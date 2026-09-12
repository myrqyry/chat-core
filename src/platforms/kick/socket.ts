import type { KickSocketHandle, KickSocketOptions } from './types';

const DEFAULT_BASE_URL = 'wss://ws-us2.pusher.com/app';
const DEFAULT_APP_KEY = '32cbd69e4b950bf97679';
const DEFAULT_INACTIVITY_TIMEOUT_MS = 90_000;
const WATCHDOG_INTERVAL_MS = 5_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

export function kickReconnectDelay(attempt: number): number {
  const base = Math.min(1000 * 2 ** attempt, MAX_RECONNECT_DELAY_MS);
  const jittered = base * (0.75 + Math.random() * 0.5);
  return Math.round(Math.min(jittered, MAX_RECONNECT_DELAY_MS));
}

const socketUrl = (appKey: string, baseUrl: string): string => {
  const params = new URLSearchParams({
    protocol: '7',
    client: 'js',
    version: '8.4.0',
    flash: 'false',
  });
  return `${baseUrl.replace(/\/$/u, '')}/${appKey}?${params.toString()}`;
};

export function createKickSocket(
  chatroomId: number,
  options: KickSocketOptions = {},
): KickSocketHandle {
  if (!Number.isInteger(chatroomId) || chatroomId <= 0) {
    throw new Error('Kick chatroom id must be a positive integer');
  }

  const appKey = options.appKey ?? DEFAULT_APP_KEY;
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const inactivityTimeoutMs = options.inactivityTimeoutMs ?? DEFAULT_INACTIVITY_TIMEOUT_MS;

  let socket: WebSocket | null = null;
  let stopped = false;
  let reconnectAttempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let watchdogTimer: ReturnType<typeof setInterval> | null = null;
  let lastActivityAt = Date.now();

  const clearReconnectTimer = () => {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const scheduleReconnect = () => {
    if (stopped) return;
    clearReconnectTimer();
    options.onStateChange?.('reconnecting');
    const delay = kickReconnectDelay(reconnectAttempts++);
    reconnectTimer = setTimeout(connect, delay);
  };

  const handleMessage = (event: MessageEvent<unknown>) => {
    lastActivityAt = Date.now();
    if (typeof event.data !== 'string') return;

    if (event.data.startsWith('{"event":"pusher:')) {
      try {
        const control = JSON.parse(event.data) as { event?: string };
        if (control.event === 'pusher:ping') {
          socket?.send(JSON.stringify({ event: 'pusher:pong', data: {} }));
          return;
        }
      } catch {
        // Non-JSON data is handled by the normal parser below.
      }
    }

    options.onMessage?.(event.data);
  };

  function connect() {
    if (stopped) return;
    options.onStateChange?.(reconnectAttempts > 0 ? 'reconnecting' : 'connecting');
    lastActivityAt = Date.now();

    const next = new WebSocket(socketUrl(appKey, baseUrl));
    socket = next;

    next.onopen = () => {
      if (stopped || socket !== next) return;
      lastActivityAt = Date.now();
      reconnectAttempts = 0;
      next.send(JSON.stringify({
        event: 'pusher:subscribe',
        data: { auth: '', channel: `chatrooms.${chatroomId}.v2` },
      }));
      options.onStateChange?.('connected');
      options.onOpen?.();
    };

    next.onmessage = handleMessage;

    next.onerror = () => {
      if (stopped || socket !== next) return;
      options.onStateChange?.('error');
      options.onError?.(new Error('Kick WebSocket error'));
    };

    next.onclose = () => {
      if (socket === next) socket = null;
      options.onClose?.();
      if (stopped) {
        options.onStateChange?.('disconnected');
        return;
      }
      scheduleReconnect();
    };
  }

  watchdogTimer = setInterval(() => {
    if (stopped || !socket) return;
    if (Date.now() - lastActivityAt <= inactivityTimeoutMs) return;
    options.onError?.(new Error(`No Kick chat activity for ${inactivityTimeoutMs}ms; reconnecting`));
    socket.close();
  }, Math.min(WATCHDOG_INTERVAL_MS, Math.max(Math.floor(inactivityTimeoutMs / 3), 1)));

  connect();

  return {
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
