import { fetchWithTimeout } from '../../network/fetch';
import type {
  TwitchAuth,
  TwitchChatSubscriptionType,
  TwitchEventSubSubscription,
} from './types';

export const DEFAULT_TWITCH_CHAT_SUBSCRIPTIONS: TwitchChatSubscriptionType[] = [
  'channel.chat.message',
  'channel.chat.message_delete',
  'channel.chat.notification',
  'channel.chat_settings.update',
  'channel.chat.clear',
  'channel.chat.clear_user_messages',
];

const versionFor = (_type: TwitchChatSubscriptionType): string => '1';

export async function createTwitchEventSubSubscription(
  type: TwitchChatSubscriptionType,
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
        condition: {
          broadcaster_user_id: broadcasterUserId,
          user_id: auth.userId,
        },
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
    subscriptions?: TwitchChatSubscriptionType[];
    signal?: AbortSignal;
  } = {},
): Promise<TwitchEventSubSubscription[]> {
  const subscriptions = options.subscriptions ?? DEFAULT_TWITCH_CHAT_SUBSCRIPTIONS;
  const created = await Promise.all(subscriptions.map((type) =>
    createTwitchEventSubSubscription(type, sessionId, broadcasterUserId, auth, options.signal)));
  return created.filter((subscription): subscription is TwitchEventSubSubscription => subscription !== null);
}
