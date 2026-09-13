import type {
  ChatEvent,
  HypeTrainContribution,
  HypeTrainData,
  HypeTrainPhase,
  HypeTrainSharedParticipant,
} from '../../types/chat';
import type { TwitchEventSubEnvelope, TwitchNormalizeContext } from './types';

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const stringValue = (value: unknown): string | undefined =>
  typeof value === 'string' && value ? value : undefined;

const numberValue = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const booleanValue = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined;

const eventTimestamp = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const normalized = value.replace(/(\.\d{3})\d+(Z|[+-]\d\d:\d\d)$/u, '$1$2');
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const contributionFrom = (value: unknown): HypeTrainContribution | undefined => {
  const row = asRecord(value);
  if (!row) return undefined;
  const total = numberValue(row.total);
  const type = stringValue(row.type);
  if (total === undefined || !type) return undefined;
  return {
    userId: stringValue(row.user_id),
    username: stringValue(row.user_login),
    displayName: stringValue(row.user_name),
    type,
    total,
  };
};

const contributionsFrom = (value: unknown): HypeTrainContribution[] =>
  Array.isArray(value)
    ? value.flatMap((entry) => {
      const contribution = contributionFrom(entry);
      return contribution ? [contribution] : [];
    })
    : [];

const participantFrom = (value: unknown): HypeTrainSharedParticipant | undefined => {
  const row = asRecord(value);
  if (!row) return undefined;
  const broadcasterUserId = stringValue(row.broadcaster_user_id);
  if (!broadcasterUserId) return undefined;
  return {
    broadcasterUserId,
    broadcasterUsername: stringValue(row.broadcaster_user_login),
    broadcasterDisplayName: stringValue(row.broadcaster_user_name),
  };
};

const participantsFrom = (value: unknown): HypeTrainSharedParticipant[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((entry) => {
    const participant = participantFrom(entry);
    return participant ? [participant] : [];
  });
};

const phaseFromSubscription = (type: string): HypeTrainPhase | null => {
  if (type === 'channel.hype_train.begin') return 'begin';
  if (type === 'channel.hype_train.progress') return 'progress';
  if (type === 'channel.hype_train.end') return 'end';
  return null;
};

export function normalizeTwitchHypeTrainEvent(
  envelope: TwitchEventSubEnvelope,
  context: TwitchNormalizeContext = {},
): ChatEvent<HypeTrainData> | null {
  if (envelope.metadata.message_type !== 'notification') return null;

  const subscriptionType = envelope.metadata.subscription_type ?? envelope.payload.subscription?.type;
  if (!subscriptionType) return null;
  const phase = phaseFromSubscription(subscriptionType);
  if (!phase) return null;

  const event = asRecord(envelope.payload.event);
  if (!event) return null;

  const id = stringValue(event.id);
  const channelId = stringValue(event.broadcaster_user_id);
  const total = numberValue(event.total);
  const level = numberValue(event.level);
  if (!id || !channelId || total === undefined || level === undefined) return null;

  const now = context.now?.() ?? Date.now();
  const timestamp = eventTimestamp(envelope.metadata.message_timestamp, now);
  const sharedTrainParticipants = participantsFrom(event.shared_train_participants);
  const topContributions = contributionsFrom(event.top_contributions);
  const lastContribution = contributionFrom(event.last_contribution);

  const data: HypeTrainData = {
    phase,
    id,
    total,
    level,
    progress: numberValue(event.progress),
    goal: numberValue(event.goal),
    topContributions,
    lastContribution,
    startedAt: stringValue(event.started_at),
    expiresAt: stringValue(event.expires_at),
    endedAt: stringValue(event.ended_at),
    cooldownEndsAt: stringValue(event.cooldown_ends_at),
    trainType: stringValue(event.type),
    isSharedTrain: booleanValue(event.is_shared_train),
    sharedTrainParticipants,
    allTimeHighLevel: numberValue(event.all_time_high_level),
    allTimeHighTotal: numberValue(event.all_time_high_total),
  };

  return {
    id: envelope.metadata.message_id || id,
    type: 'hype-train',
    platform: 'twitch',
    channelId,
    channelName: stringValue(event.broadcaster_user_login),
    timestamp,
    origin: 'live',
    data,
    raw: envelope,
  };
}
