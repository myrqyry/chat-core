import { fetchWithTimeout } from '../../network/fetch';
import type {
  TwitchAuth,
  TwitchChatSubscriptionType,
  TwitchEventSubSubscription,
  TwitchEventSubSubscriptionType,
  TwitchHypeTrainSubscriptionType,
} from './types';

export const DEFAULT_TWITCH_CHAT_SUBSCRIPTIONS: TwitchChatSubscriptionType[] = [
  'channel.chat.message',
  'channel.chat.message_delete',
  'channel.chat.notification',
  'channel.chat_settings.update',
  'channel.chat.clear',
  'channel.chat.clear_user_messages',
];

export const TWITCH_HYPE_TRAIN_SUBSCRIPTIONS: TwitchHypeTrainSubscriptionType[] = [
  'channel.hype_train.begin',
  'channel.hype_train.progress',
  'channel.hype_train.end',
];

const HYPE_TRAIN_SUBSCRIPTIONS = new Set<TwitchEventSubSubscriptionType>(
  TWITCH_HYPE_TRAIN_SUBSCRIPTIONS,
);

const versionFor = (type: TwitchEventSubSubscriptionType): string =>
  HYPE_TRAIN_SUBSCRIPTIONS.has(type) ? '2' : '1';

const conditionFor = (
  type: TwitchEventSubSubscriptionType,
  broadcasterUserId: string,
  auth: TwitchAuth,
): Record<string, string> => HYPE_TRAIN_SUBSCRIPTIONS.has(type)
  ? { broadcaster_user_id: broadcasterUserId }
  : {
      broadcaster_user_id: broadcasterUserId,
      user_id: auth.userId,
    };

export const twitchSubscriptionRequiredScopes = (
  subscriptions: Iterable<TwitchEventSubSubscriptionType>,
): string[] => {
  const required = new Set<string>();
  for (const type of subscriptions) {
    if (HYPE_TRAIN_SUBSCRIPTIONS.has(type)) required.add('channel:read:hype_train');
  }
  return [...required];
};

export async function createTwitchEventSubSubscription(
  type: TwitchEventSubSubscriptionType,
  sessionId: string,
  broadcasterUserId: string,
  auth: TwitchAuth,
  signal?: AbortSignal,
): Promise<TwitchEventSubSubscription | null> {
  const response = await fetchWithTimeout(
    'https://api.twitch.tv/helix/eventsub/subscriptions',
    {
      method: 'POST',
      headers: {
        'Client-Id': auth.clientId,
        Authorization: `Bearer ${auth.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type,
        version: versionFor(type),
        condition: conditionFor(type, broadcasterUserId, auth),
        transport: {
          method: 'websocket',
          session_id: sessionId,
        },
      }),
      signal,
    },
    5_000,
    0,
  );

  let body: { data?: TwitchEventSubSubscription[]; message?: string } | undefined;
  try {
    body = await response.json() as { data?: TwitchEventSubSubscription[]; message?: string };
  } catch {
    // Twitch normally returns JSON, but status is sufficient if it does not.
  }

  if (!response.ok) {
    const detail = body?.message ? `: ${body.message}` : '';
    throw new Error(`Twitch EventSub subscription ${type} failed with ${response.status}${detail}`);
  }

  return body?.data?.[0] ?? null;
}

export async function subscribeTwitchChat(
  sessionId: string,
  broadcasterUserId: string,
  auth: TwitchAuth,
  options: {
    subscriptions?: TwitchEventSubSubscriptionType[];
    signal?: AbortSignal;
  } = {},
): Promise<TwitchEventSubSubscription[]> {
  const subscriptions = options.subscriptions ?? DEFAULT_TWITCH_CHAT_SUBSCRIPTIONS;
  const created = await Promise.all(subscriptions.map((type) =>
    createTwitchEventSubSubscription(type, sessionId, broadcasterUserId, auth, options.signal)));
  return created.filter((subscription): subscription is TwitchEventSubSubscription => subscription !== null);
}
