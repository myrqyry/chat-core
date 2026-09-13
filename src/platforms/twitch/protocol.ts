import type { TwitchEventSubEnvelope } from './types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function parseTwitchEventSubFrame(raw: string): TwitchEventSubEnvelope | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !isRecord(parsed.metadata) || !isRecord(parsed.payload)) return null;

  const metadata = parsed.metadata;
  if (
    typeof metadata.message_id !== 'string' ||
    typeof metadata.message_type !== 'string' ||
    typeof metadata.message_timestamp !== 'string'
  ) {
    return null;
  }

  return parsed as unknown as TwitchEventSubEnvelope;
}
