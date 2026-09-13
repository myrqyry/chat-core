import type {
  SevenTvDispatch,
  SevenTvEventEnvelope,
  SevenTvHelloPayload,
  SevenTvSubscription,
} from './types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function parseSevenTvEventFrame(raw: string): SevenTvEventEnvelope | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || typeof parsed.op !== 'number' || !('d' in parsed)) return null;
    return {
      op: parsed.op,
      ...(typeof parsed.t === 'number' ? { t: parsed.t } : {}),
      d: parsed.d,
    };
  } catch {
    return null;
  }
}

export function parseSevenTvHello(data: unknown): SevenTvHelloPayload | null {
  if (!isRecord(data)) return null;
  const heartbeatInterval = data.heartbeat_interval;
  const sessionId = data.session_id;
  if (
    typeof heartbeatInterval !== 'number' ||
    !Number.isFinite(heartbeatInterval) ||
    heartbeatInterval <= 0 ||
    typeof sessionId !== 'string' ||
    !sessionId
  ) return null;
  return {
    heartbeat_interval: heartbeatInterval,
    session_id: sessionId,
    ...(typeof data.subscription_limit === 'number' ? { subscription_limit: data.subscription_limit } : {}),
  };
}

export function parseSevenTvDispatch(data: unknown): SevenTvDispatch | null {
  if (!isRecord(data) || typeof data.type !== 'string' || !isRecord(data.body)) return null;
  return { type: data.type, body: data.body };
}

export const sevenTvSubscribeFrame = (subscription: SevenTvSubscription): string => JSON.stringify({
  op: 35,
  d: { type: subscription.type, condition: subscription.condition },
});

export const sevenTvUnsubscribeFrame = (subscription: SevenTvSubscription): string => JSON.stringify({
  op: 36,
  d: { type: subscription.type, condition: subscription.condition },
});
