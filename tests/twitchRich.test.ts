import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearTwitchCheermoteCache,
  connectTwitchChat,
  fetchTwitchCheermotes,
  normalizeTwitchEventSubNotification,
  resolveTwitchCheermote,
  type TwitchCheermoteSet,
  type TwitchEventSubEnvelope,
} from '../src/index';

const cheermotes: TwitchCheermoteSet = {
  cheer: {
    prefix: 'Cheer',
    tiers: [{
      min_bits: 100,
      id: '100',
      images: {
        dark: {
          animated: { '4': 'https://cdn.example/cheer100.gif' },
          static: { '4': 'https://cdn.example/cheer100.png' },
        },
      },
    }],
  },
};

const richMessageEnvelope = (): TwitchEventSubEnvelope => ({
  metadata: {
    message_id: 'delivery-rich',
    message_type: 'notification',
    message_timestamp: '2026-09-12T23:30:00.123456789Z',
    subscription_type: 'channel.chat.message',
    subscription_version: '1',
  },
  payload: {
    subscription: { type: 'channel.chat.message', version: '1' },
    event: {
      broadcaster_user_id: '10',
      broadcaster_user_login: 'destination',
      broadcaster_user_name: 'Destination',
      chatter_user_id: '20',
      chatter_user_login: 'viewer',
      chatter_user_name: 'Viewer',
      message_id: 'message-rich',
      message: {
        text: 'Cheer100 dancing cat',
        fragments: [
          {
            type: 'cheermote',
            text: 'Cheer100',
            cheermote: { prefix: 'Cheer', bits: 100, tier: 100 },
          },
          { type: 'text', text: ' ' },
          {
            type: 'gif',
            text: 'dancing cat',
            gif: { id: 'gif-1', url: 'https://twitch.example/gif-1.gif' },
          },
        ],
      },
      badges: [{ set_id: 'subscriber', id: '12', info: '16' }],
      reply: {
        parent_message_id: 'parent-1',
        parent_message_body: 'parent body',
        parent_user_id: '30',
        parent_user_login: 'parent_login',
        parent_user_name: 'Parent Name',
        thread_message_id: 'root-1',
        thread_user_id: '40',
        thread_user_login: 'root_login',
        thread_user_name: 'Root Name',
      },
      source_broadcaster_user_id: '99',
      source_broadcaster_user_login: 'origin',
      source_broadcaster_user_name: 'Origin Channel',
      source_message_id: 'source-message-1',
      source_badges: [{ set_id: 'moderator', id: '1', info: '' }],
      is_source_only: true,
    },
  },
});

describe('Twitch rich message normalization', () => {
  it('preserves GIF media, Cheermote assets, Shared Chat provenance, and reply/thread context', () => {
    const event = normalizeTwitchEventSubNotification(richMessageEnvelope(), { cheermotes });

    expect(event?.message).toMatchObject({
      id: 'message-rich',
      replyToMessageId: 'parent-1',
      reply: {
        parentMessageId: 'parent-1',
        parentMessageBody: 'parent body',
        parentUserId: '30',
        parentUsername: 'parent_login',
        parentDisplayName: 'Parent Name',
        threadMessageId: 'root-1',
        threadUserId: '40',
        threadUsername: 'root_login',
        threadDisplayName: 'Root Name',
      },
      source: {
        channelId: '99',
        channelName: 'origin',
        displayName: 'Origin Channel',
        messageId: 'source-message-1',
        sourceOnly: true,
        badgeRefs: [{ id: 'moderator', provider: 'twitch', version: '1' }],
      },
      traits: { emoteOnly: false },
    });

    expect(event?.message?.fragments).toEqual([
      expect.objectContaining({
        type: 'cheermote',
        text: 'Cheer100',
        bits: 100,
        emote: expect.objectContaining({
          provider: 'twitch-cheer',
          url: 'https://cdn.example/cheer100.gif',
          animated: true,
        }),
      }),
      { type: 'text', text: ' ' },
      expect.objectContaining({
        type: 'media',
        mediaType: 'gif',
        id: 'gif-1',
        url: 'https://twitch.example/gif-1.gif',
        alt: 'dancing cat',
      }),
    ]);
  });
});

describe('Twitch Cheermote enrichment', () => {
  afterEach(() => {
    clearTwitchCheermoteCache();
    vi.unstubAllGlobals();
  });

  it('loads broadcaster-aware Cheermotes, caches them, and resolves the matching tier', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: Object.values(cheermotes),
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const auth = { clientId: 'client-1', accessToken: 'token-1', userId: 'user-1' };
    const first = await fetchTwitchCheermotes(auth, '10');
    const second = await fetchTwitchCheermotes(auth, '10');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/helix/bits/cheermotes?broadcaster_id=10');
    expect(init).toMatchObject({
      headers: {
        'Client-Id': 'client-1',
        Authorization: 'Bearer token-1',
      },
    });
    expect(second).toBe(first);
    expect(resolveTwitchCheermote(first, 'cheer', 100, 100, 'Cheer100')).toMatchObject({
      provider: 'twitch-cheer',
      url: 'https://cdn.example/cheer100.gif',
      code: 'Cheer100',
    });
  });
});

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  readonly url: string;
  closeCount = 0;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  close(): void {
    this.closeCount += 1;
  }

  emitOpen(): void {
    this.onopen?.({} as Event);
  }

  emitMessage(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent<unknown>);
  }
}

const welcome = {
  metadata: {
    message_id: 'welcome-1',
    message_type: 'session_welcome',
    message_timestamp: '2026-09-12T23:30:00Z',
  },
  payload: {
    session: {
      id: 'session-1',
      status: 'connected',
      keepalive_timeout_seconds: 30,
      reconnect_url: null,
    },
  },
};

describe('Twitch EventSub subscription state', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    clearTwitchCheermoteCache();
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    clearTwitchCheermoteCache();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('retains successful subscription records and removes a revoked capability', async () => {
    const events: unknown[] = [];
    const changes: Array<{ reason: string; count: number }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/oauth2/validate')) {
        return new Response(JSON.stringify({
          client_id: 'client-1',
          user_id: 'user-1',
          login: 'bot',
          scopes: ['user:read:chat'],
        }), { status: 200 });
      }
      if (url.includes('/helix/users')) {
        return new Response(JSON.stringify({
          data: [{ id: '10', login: 'streamer', display_name: 'Streamer' }],
        }), { status: 200 });
      }
      if (url.includes('/helix/bits/cheermotes')) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      if (url.includes('/helix/eventsub/subscriptions')) {
        const body = JSON.parse(String(init?.body)) as { type: string; version: string };
        return new Response(JSON.stringify({
          data: [{
            id: `sub-${body.type}`,
            type: body.type,
            version: body.version,
            status: 'enabled',
          }],
        }), { status: 202 });
      }
      return new Response('', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const connection = await connectTwitchChat({
      channel: 'streamer',
      accessToken: 'token-1',
      onEvent: (event) => events.push(event),
      onSubscriptionStateChange: (change) => changes.push({
        reason: change.reason,
        count: change.subscriptions.length,
      }),
    });

    const ws = MockWebSocket.instances[0]!;
    ws.emitOpen();
    ws.emitMessage(welcome);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(connection.subscriptions()).toHaveLength(6);
    expect(changes.at(-1)).toEqual({ reason: 'subscribed', count: 6 });

    ws.emitMessage({
      metadata: {
        message_id: 'revocation-1',
        message_type: 'revocation',
        message_timestamp: '2026-09-12T23:31:00Z',
        subscription_type: 'channel.chat.message_delete',
        subscription_version: '1',
      },
      payload: {
        subscription: {
          id: 'sub-channel.chat.message_delete',
          type: 'channel.chat.message_delete',
          version: '1',
          status: 'authorization_revoked',
        },
      },
    });

    expect(connection.subscriptions()).toHaveLength(5);
    expect(changes.at(-1)).toEqual({ reason: 'revoked', count: 5 });
    expect(events.at(-1)).toMatchObject({
      type: 'system',
      data: {
        kind: 'eventsub-revocation',
        subscriptionId: 'sub-channel.chat.message_delete',
        subscriptionType: 'channel.chat.message_delete',
        status: 'authorization_revoked',
      },
    });

    connection.close();
  });
});
