import type { ChatEvent } from '../../types/chat';
import { resolveTwitchChannel, resolveTwitchEventSubAuth } from './auth';
import { normalizeTwitchEventSubNotification } from './normalize';
import { createTwitchEventSubSocket } from './socket';
import { subscribeTwitchChat } from './subscriptions';
import type {
  TwitchChatConnection,
  TwitchConnectOptions,
  TwitchEventSubEnvelope,
} from './types';

const DEDUPE_TTL_MS = 10 * 60 * 1000;
const DEDUPE_MAX = 2_000;

const createMessageDeduper = () => {
  const seen = new Map<string, number>();
  return (id: string): boolean => {
    const now = Date.now();
    for (const [key, timestamp] of seen) {
      if (now - timestamp <= DEDUPE_TTL_MS) break;
      seen.delete(key);
    }
    if (seen.has(id)) return false;
    seen.set(id, now);
    while (seen.size > DEDUPE_MAX) {
      const oldest = seen.keys().next().value as string | undefined;
      if (!oldest) break;
      seen.delete(oldest);
    }
    return true;
  };
};

export async function connectTwitchChat(options: TwitchConnectOptions): Promise<TwitchChatConnection> {
  const channelName = options.channel.trim().replace(/^#/u, '');
  if (!channelName) throw new Error('Twitch channel name must not be empty');
  if (options.signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');

  const auth = await resolveTwitchEventSubAuth(options.accessToken, {
    clientId: options.clientId,
    userId: options.userId,
    signal: options.signal,
  });

  const channel = options.broadcasterUserId
    ? { id: options.broadcasterUserId, login: channelName.toLowerCase() }
    : await resolveTwitchChannel(channelName, auth, options.signal);

  const acceptMessage = createMessageDeduper();

  const handleNotification = (envelope: TwitchEventSubEnvelope) => {
    if (!acceptMessage(envelope.metadata.message_id)) return;
    const event = normalizeTwitchEventSubNotification(envelope, {
      emotes: options.getEmotes?.() ?? options.emotes,
    });
    if (event) options.onEvent(event);
  };

  const handleRevocation = (envelope: TwitchEventSubEnvelope) => {
    if (!acceptMessage(envelope.metadata.message_id)) return;
    const subscription = envelope.payload.subscription;
    const event: ChatEvent = {
      id: envelope.metadata.message_id,
      type: 'system',
      platform: 'twitch',
      channelId: channel.id,
      channelName: channel.login,
      timestamp: Date.now(),
      data: {
        kind: 'eventsub-revocation',
        subscriptionType: subscription?.type,
        status: subscription?.status,
      },
      raw: envelope,
    };
    options.onEvent(event);
  };

  const socket = createTwitchEventSubSocket({
    ...options.socket,
    onStateChange: options.onStateChange,
    onError: options.onError,
    onNotification: handleNotification,
    onRevocation: handleRevocation,
    onWelcome: async (session, { isServerReconnect }) => {
      if (isServerReconnect) return;
      await subscribeTwitchChat(session.id, channel.id, auth, {
        subscriptions: options.subscriptions,
        signal: options.signal,
      });
    },
  });

  const abort = () => socket.close();
  options.signal?.addEventListener('abort', abort, { once: true });

  return {
    auth,
    channel,
    close: () => {
      options.signal?.removeEventListener('abort', abort);
      socket.close();
    },
  };
}
