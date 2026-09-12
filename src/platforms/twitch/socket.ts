import { parseTwitchEventSubFrame } from './protocol';
import type {
  TwitchEventSubEnvelope,
  TwitchEventSubSession,
  TwitchEventSubSocketHandle,
  TwitchEventSubSocketOptions,
} from './types';

const DEFAULT_URL = 'wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30';
const DEFAULT_KEEPALIVE_GRACE_MS = 5_000;
const DEFAULT_RECONNECT_BASE_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const WELCOME_TIMEOUT_MS = 15_000;
const WATCHDOG_INTERVAL_MS = 1_000;

interface SocketContext {
  ws: WebSocket;
  url: string;
  isServerReconnect: boolean;
  oldSocket?: WebSocket;
  ready: boolean;
  lastActivityAt: number;
  keepaliveTimeoutMs: number | null;
  welcomeTimer: ReturnType<typeof setTimeout> | null;
}

export function twitchReconnectDelay(attempt: number, baseMs = DEFAULT_RECONNECT_BASE_DELAY_MS): number {
  const base = Math.min(baseMs * 2 ** attempt, MAX_RECONNECT_DELAY_MS);
  const jittered = base * (0.75 + Math.random() * 0.5);
  return Math.round(Math.min(jittered, MAX_RECONNECT_DELAY_MS));
}

export function createTwitchEventSubSocket(
  options: TwitchEventSubSocketOptions = {},
): TwitchEventSubSocketHandle {
  const defaultUrl = options.url ?? DEFAULT_URL;
  const keepaliveGraceMs = options.keepaliveGraceMs ?? DEFAULT_KEEPALIVE_GRACE_MS;
  const reconnectBaseDelayMs = options.reconnectBaseDelayMs ?? DEFAULT_RECONNECT_BASE_DELAY_MS;

  let stopped = false;
  let active: SocketContext | null = null;
  let handoff: SocketContext | null = null;
  let reconnectAttempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let watchdogTimer: ReturnType<typeof setInterval> | null = null;

  const clearReconnectTimer = () => {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const detachAndClose = (context: SocketContext | null) => {
    if (!context) return;
    if (context.welcomeTimer !== null) {
      clearTimeout(context.welcomeTimer);
      context.welcomeTimer = null;
    }
    context.ws.onopen = null;
    context.ws.onmessage = null;
    context.ws.onerror = null;
    context.ws.onclose = null;
    context.ws.close();
  };

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer !== null) return;
    options.onStateChange?.('reconnecting');
    const delay = twitchReconnectDelay(reconnectAttempts++, reconnectBaseDelayMs);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      openSocket(defaultUrl, false);
    }, delay);
  };

  const markReady = async (context: SocketContext, session: TwitchEventSubSession) => {
    try {
      await options.onWelcome?.(session, { isServerReconnect: context.isServerReconnect });
    } catch (error) {
      if (stopped || (active !== context && handoff !== context)) return;
      options.onError?.(error instanceof Error ? error : new Error('Twitch EventSub welcome handler failed'));
      context.ws.close();
      return;
    }

    if (stopped || (active !== context && handoff !== context)) return;
    context.ready = true;
    reconnectAttempts = 0;

    if (context.welcomeTimer !== null) {
      clearTimeout(context.welcomeTimer);
      context.welcomeTimer = null;
    }

    if (context.isServerReconnect) {
      const previous = active;
      active = context;
      handoff = null;
      if (previous && previous !== context) detachAndClose(previous);
    } else {
      active = context;
    }

    options.onStateChange?.('connected');
  };

  const handleEnvelope = (context: SocketContext, envelope: TwitchEventSubEnvelope) => {
    const type = envelope.metadata.message_type;
    if (type === 'session_welcome') {
      const session = envelope.payload.session;
      if (!session?.id) {
        options.onError?.(new Error('Twitch EventSub welcome did not include a session id'));
        context.ws.close();
        return;
      }
      const seconds = session.keepalive_timeout_seconds;
      context.keepaliveTimeoutMs =
        typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
      void markReady(context, session);
      return;
    }

    if (type === 'session_keepalive') return;

    if (type === 'session_reconnect') {
      const reconnectUrl = envelope.payload.session?.reconnect_url;
      if (!reconnectUrl || handoff) return;
      options.onStateChange?.('reconnecting');
      openSocket(reconnectUrl, true, context.ws);
      return;
    }

    if (type === 'notification') {
      options.onNotification?.(envelope);
      return;
    }

    if (type === 'revocation') {
      options.onRevocation?.(envelope);
      return;
    }
  };

  function openSocket(url: string, isServerReconnect: boolean, oldSocket?: WebSocket) {
    if (stopped) return;
    if (!isServerReconnect) options.onStateChange?.(reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

    const ws = new WebSocket(url);
    const context: SocketContext = {
      ws,
      url,
      isServerReconnect,
      oldSocket,
      ready: false,
      lastActivityAt: Date.now(),
      keepaliveTimeoutMs: null,
      welcomeTimer: null,
    };

    if (isServerReconnect) handoff = context;
    else active = context;

    context.welcomeTimer = setTimeout(() => {
      if (stopped || context.ready) return;
      options.onError?.(new Error('Twitch EventSub did not send a welcome message in time'));
      context.ws.close();
    }, WELCOME_TIMEOUT_MS);

    ws.onopen = () => {
      if (stopped) return;
      context.lastActivityAt = Date.now();
    };

    ws.onmessage = (event) => {
      if (stopped || typeof event.data !== 'string') return;
      context.lastActivityAt = Date.now();
      const envelope = parseTwitchEventSubFrame(event.data);
      if (!envelope) return;
      handleEnvelope(context, envelope);
    };

    ws.onerror = () => {
      if (stopped) return;
      options.onStateChange?.('error');
      options.onError?.(new Error('Twitch EventSub WebSocket error'));
    };

    ws.onclose = () => {
      if (context.welcomeTimer !== null) {
        clearTimeout(context.welcomeTimer);
        context.welcomeTimer = null;
      }
      const wasActive = active === context;
      const wasHandoff = handoff === context;
      if (wasActive) active = null;
      if (wasHandoff) handoff = null;
      if (stopped) return;

      if (wasHandoff && active) {
        // The old connection is still carrying the subscriptions. Its own close
        // will trigger a fresh session if Twitch cannot complete the handoff.
        return;
      }
      if (wasActive && handoff) {
        // A server-directed replacement is already being established.
        return;
      }
      scheduleReconnect();
    };
  }

  watchdogTimer = setInterval(() => {
    if (stopped || !active?.ready || active.keepaliveTimeoutMs === null) return;
    const deadline = active.keepaliveTimeoutMs + keepaliveGraceMs;
    if (Date.now() - active.lastActivityAt <= deadline) return;
    options.onError?.(new Error(`No Twitch EventSub activity for ${deadline}ms; reconnecting`));
    active.ws.close();
  }, WATCHDOG_INTERVAL_MS);

  openSocket(defaultUrl, false);

  return {
    close: () => {
      if (stopped) return;
      stopped = true;
      clearReconnectTimer();
      if (watchdogTimer !== null) {
        clearInterval(watchdogTimer);
        watchdogTimer = null;
      }
      const currentActive = active;
      const currentHandoff = handoff;
      active = null;
      handoff = null;
      detachAndClose(currentHandoff);
      if (currentActive && currentActive !== currentHandoff) detachAndClose(currentActive);
      options.onStateChange?.('disconnected');
    },
  };
}
