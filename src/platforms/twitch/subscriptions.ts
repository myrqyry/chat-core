import { fetchWithTimeout } from '../../network/fetch';
import type { TwitchAuth, TwitchChatSubscriptionType } from './types';

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
): Promise<void> {
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

  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json() as { message?: string };
      detail = body.message ? `: ${body.message}` : '';
    } catch {
      // Ignore a non-JSON error body.
    }
    throw new Error(`Twitch EventSub subscription ${type} failed with ${response.status}${detail}`);
  }
}

export async function subscribeTwitchChat(
  sessionId: string,
  broadcasterUserId: string,
  auth: TwitchAuth,
  options: {
    subscriptions?: TwitchChatSubscriptionType[];
    signal?: AbortSignal;
  } = {},
): Promise<void> {
  const subscriptions = options.subscriptions ?? DEFAULT_TWITCH_CHAT_SUBSCRIPTIONS;
  await Promise.all(subscriptions.map((type) =>
    createTwitchEventSubSubscription(type, sessionId, broadcasterUserId, auth, options.signal)));
}
