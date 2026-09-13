import {
  parseSevenTvDispatch,
  parseSevenTvEventFrame,
  parseSevenTvHello,
  sevenTvSubscribeFrame,
  sevenTvUnsubscribeFrame,
} from './protocol';
import type {
  SevenTvEventSocketHandle,
  SevenTvEventSocketOptions,
  SevenTvSubscription,
} from './types';

const DEFAULT_URL = 'wss://events.7tv.io/v3';
const DEFAULT_RECONNECT_BASE_DELAY_MS = 1_000;
const DEFAULT_MAINTENANCE_RECONNECT_DELAY_MS = 5 * 60_000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const WATCHDOG_INTERVAL_MS = 1_000;

const subscriptionKey = (subscription: SevenTvSubscription): string => {
  const condition = Object.entries(subscription.condition).sort(([a], [b]) => a.localeCompare(b));
  return `${subscription.type}:${JSON.stringify(condition)}`;
};

export function sevenTvReconnectDelay(attempt: number, baseMs = DEFAULT_RECONNECT_BASE_DELAY_MS): number {
  const base = Math.min(baseMs * 2 ** attempt, MAX_RECONNECT_DELAY_MS);
  const jittered = base * (0.75 + Math.random() * 0.5);
  return Math.round(Math.min(jittered, MAX_RECONNECT_DELAY_MS));
}

export function shouldReconnectSevenTv(code: number): boolean {
  // 7TV maps client/protocol errors to 1008 at the WebSocket layer. Retrying
  // those unchanged just creates a hot failure loop.
  if (code === 1008) return false;
  if ([4001, 4002, 4003, 4004, 4005, 4009, 4010, 4011].includes(code)) return false;
  return true;
}

export function createSevenTvEventSocket(
  options: SevenTvEventSocketOptions = {},
): SevenTvEventSocketHandle {
  const url = options.url ?? DEFAULT_URL;
  const reconnectBaseDelayMs = options.reconnectBaseDelayMs ?? DEFAULT_RECONNECT_BASE_DELAY_MS;
  const maintenanceReconnectDelayMs = options.maintenanceReconnectDelayMs ?? DEFAULT_MAINTENANCE_RECONNECT_DELAY_MS;
  const desiredSubscriptions = new Map<string, SevenTvSubscription>();
  for (const subscription of options.subscriptions ?? []) {
    desiredSubscriptions.set(subscriptionKey(subscription), subscription);
  }

  let stopped = false;
  let socket: WebSocket | null = null;
  let ready = false;
  let reconnectAttempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let watchdogTimer: ReturnType<typeof setInterval> | null = null;
  let heartbeatIntervalMs: number | null = null;
  let lastHeartbeatAt = Date.now();
  let endOfStreamCode: number | null = null;
  const activeSubscriptions = new Set<string>();

  const clearReconnectTimer = () => {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const send = (payload: string): boolean => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(payload);
    return true;
  };

  const sendSubscribe = (subscription: SevenTvSubscription) => {
    const key = subscriptionKey(subscription);
    if (activeSubscriptions.has(key)) return;
    if (send(sevenTvSubscribeFrame(subscription))) activeSubscriptions.add(key);
  };

  const sendUnsubscribe = (subscription: SevenTvSubscription) => {
    const key = subscriptionKey(subscription);
    if (!activeSubscriptions.has(key)) return;
    if (send(sevenTvUnsubscribeFrame(subscription))) activeSubscriptions.delete(key);
  };

  const markReady = () => {
    if (stopped || ready) return;
    ready = true;
    reconnectAttempts = 0;
    options.onStateChange?.('connected');
  };

  const installSubscriptions = (limit?: number) => {
    if (typeof limit === 'number' && limit >= 0 && desiredSubscriptions.size > limit) {
      options.onError?.(new Error(
        `7TV session allows ${limit} subscriptions but ${desiredSubscriptions.size} were requested`,
      ));
    }
    activeSubscriptions.clear();
    for (const subscription of desiredSubscriptions.values()) sendSubscribe(subscription);
    markReady();
  };

  const scheduleReconnect = (code: number) => {
    if (stopped || reconnectTimer !== null) return;
    if (!shouldReconnectSevenTv(code)) {
      options.onStateChange?.('disconnected');
      options.onError?.(new Error(`7TV EventAPI closed with non-retryable code ${code}`));
      return;
    }
    options.onStateChange?.('reconnecting');
    const delay = code === 4007
      ? Math.max(maintenanceReconnectDelayMs, sevenTvReconnectDelay(reconnectAttempts++, reconnectBaseDelayMs))
      : sevenTvReconnectDelay(reconnectAttempts++, reconnectBaseDelayMs);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      openSocket();
    }, delay);
  };

  const handleMessage = (event: MessageEvent<unknown>) => {
    if (stopped || typeof event.data !== 'string') return;
    const envelope = parseSevenTvEventFrame(event.data);
    if (!envelope) return;

    switch (envelope.op) {
      case 0: {
        const dispatch = parseSevenTvDispatch(envelope.d);
        if (dispatch) options.onDispatch?.(dispatch, envelope);
        break;
      }
      case 1: {
        const hello = parseSevenTvHello(envelope.d);
        if (!hello) {
          options.onError?.(new Error('Malformed 7TV HELLO payload'));
          socket?.close();
          return;
        }
        heartbeatIntervalMs = hello.heartbeat_interval;
        lastHeartbeatAt = Date.now();
        installSubscriptions(hello.subscription_limit);
        break;
      }
      case 2:
        lastHeartbeatAt = Date.now();
        break;
      case 4:
        socket?.close();
        break;
      case 5:
        // ACKs confirm subscribe/unsubscribe commands. Desired subscriptions are
        // already de-duplicated locally, so no state transition is required.
        break;
      case 6: {
        const message = typeof envelope.d === 'object' && envelope.d !== null
          ? (envelope.d as { message?: unknown }).message
          : undefined;
        options.onError?.(new Error(
          typeof message === 'string' ? `7TV EventAPI error: ${message}` : '7TV EventAPI returned an error payload',
        ));
        break;
      }
      case 7: {
        if (typeof envelope.d !== 'object' || envelope.d === null) break;
        const code = (envelope.d as { code?: unknown }).code;
        if (typeof code === 'number') endOfStreamCode = code;
        socket?.close();
        break;
      }
      default:
        break;
    }
  };

  function openSocket() {
    if (stopped) return;
    options.onStateChange?.(reconnectAttempts > 0 ? 'reconnecting' : 'connecting');
    ready = false;
    heartbeatIntervalMs = null;
    lastHeartbeatAt = Date.now();
    endOfStreamCode = null;
    activeSubscriptions.clear();

    const next = new WebSocket(url);
    socket = next;

    next.onopen = () => {
      if (stopped || socket !== next) return;
      lastHeartbeatAt = Date.now();
    };
    next.onmessage = handleMessage;
    next.onerror = () => {
      if (stopped || socket !== next) return;
      options.onStateChange?.('error');
      options.onError?.(new Error('7TV EventAPI WebSocket error'));
    };
    next.onclose = (event) => {
      if (socket !== next) return;
      socket = null;
      ready = false;
      heartbeatIntervalMs = null;
      activeSubscriptions.clear();

      if (stopped) {
        options.onStateChange?.('disconnected');
        return;
      }
      scheduleReconnect(endOfStreamCode ?? event.code ?? 1006);
    };
  }

  watchdogTimer = setInterval(() => {
    if (stopped || !socket || heartbeatIntervalMs === null) return;
    const deadline = heartbeatIntervalMs * 3;
    if (Date.now() - lastHeartbeatAt <= deadline) return;
    options.onError?.(new Error(`No 7TV heartbeat for ${deadline}ms; reconnecting`));
    socket.close();
  }, WATCHDOG_INTERVAL_MS);

  openSocket();

  return {
    subscribe: (subscription) => {
      const key = subscriptionKey(subscription);
      if (desiredSubscriptions.has(key)) return;
      desiredSubscriptions.set(key, subscription);
      if (ready) sendSubscribe(subscription);
    },
    unsubscribe: (subscription) => {
      const key = subscriptionKey(subscription);
      if (!desiredSubscriptions.delete(key)) return;
      if (ready) sendUnsubscribe(subscription);
    },
    close: () => {
      if (stopped) return;
      stopped = true;
      clearReconnectTimer();
      if (watchdogTimer !== null) {
        clearInterval(watchdogTimer);
        watchdogTimer = null;
      }
      const current = socket;
      socket = null;
      if (current) {
        current.onopen = null;
        current.onmessage = null;
        current.onerror = null;
        current.onclose = null;
        current.close();
      }
      options.onStateChange?.('disconnected');
    },
  };
}
