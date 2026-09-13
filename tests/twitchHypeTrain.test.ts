import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_TWITCH_CHAT_SUBSCRIPTIONS,
  TWITCH_HYPE_TRAIN_SUBSCRIPTIONS,
  createTwitchEventSubSubscription,
  deserializeChatEvent,
  normalizeTwitchHypeTrainEvent,
  planTwitchCapabilities,
  serializeChatEvent,
  twitchSubscriptionRequiredScopes,
} from '../src/index';
import type { TwitchAuth, TwitchEventSubEnvelope } from '../src/index';

const envelope = (
  type: string,
  event: Record<string, unknown>,
  messageId = 'delivery-1',
): TwitchEventSubEnvelope => ({
  metadata: {
    message_id: messageId,
    message_type: 'notification',
    message_timestamp: '2026-09-13T01:00:00.123456Z',
    subscription_type: type,
    subscription_version: '2',
  },
  payload: {
    subscription: { type, version: '2' },
    event,
  },
});

describe('Twitch Hype Train support', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('plans Hype Train as an opt-in, handled v2 capability with its own scope', () => {
    const blocked = planTwitchCapabilities(['hype-train'], {
      broadcasterUserId: 'broadcaster',
      userId: 'reader',
      scopes: ['user:read:chat'],
    });

    expect(blocked.capabilities[0]).toMatchObject({
      id: 'hype-train',
      ready: false,
      partial: false,
    });
    expect(blocked.subscriptions.map(({ type, version, handledByChatCore }) => ({
      type, version, handledByChatCore,
    }))).toEqual(TWITCH_HYPE_TRAIN_SUBSCRIPTIONS.map((type) => ({
      type,
      version: '2',
      handledByChatCore: true,
    })));
    expect(blocked.missingScopeRequirements).toEqual([
      { anyOf: ['channel:read:hype_train'] },
    ]);

    const ready = planTwitchCapabilities(['hype-train'], {
      broadcasterUserId: 'broadcaster',
      userId: 'reader',
      scopes: ['channel:read:hype_train'],
    });
    expect(ready.capabilities[0]?.ready).toBe(true);
  });

  it('only requests the Hype Train scope when Hype Train subscriptions are selected', () => {
    expect(twitchSubscriptionRequiredScopes(DEFAULT_TWITCH_CHAT_SUBSCRIPTIONS)).toEqual([]);
    expect(twitchSubscriptionRequiredScopes([
      ...DEFAULT_TWITCH_CHAT_SUBSCRIPTIONS,
      ...TWITCH_HYPE_TRAIN_SUBSCRIPTIONS,
    ])).toEqual(['channel:read:hype_train']);
  });

  it('creates v2 broadcaster-only Hype Train subscriptions without changing chat requests', async () => {
    const requests: Array<Record<string, unknown>> = [];
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
      const request = requests.at(-1) ?? {};
      return new Response(JSON.stringify({
        data: [{
          type: request.type,
          version: request.version,
          status: 'enabled',
        }],
      }), { status: 202 });
    }));

    const auth: TwitchAuth = {
      clientId: 'client',
      accessToken: 'token',
      userId: 'reader',
      scopes: ['user:read:chat', 'channel:read:hype_train'],
    };

    await createTwitchEventSubSubscription(
      'channel.hype_train.progress',
      'session',
      'broadcaster',
      auth,
    );
    await createTwitchEventSubSubscription(
      'channel.chat.message',
      'session',
      'broadcaster',
      auth,
    );

    expect(requests[0]).toMatchObject({
      type: 'channel.hype_train.progress',
      version: '2',
      condition: { broadcaster_user_id: 'broadcaster' },
      transport: { method: 'websocket', session_id: 'session' },
    });
    expect(requests[0]?.condition).not.toHaveProperty('user_id');
    expect(requests[1]).toMatchObject({
      type: 'channel.chat.message',
      version: '1',
      condition: {
        broadcaster_user_id: 'broadcaster',
        user_id: 'reader',
      },
    });
  });

  it('normalizes progress independently of begin and preserves structured contributions', () => {
    const normalized = normalizeTwitchHypeTrainEvent(envelope(
      'channel.hype_train.progress',
      {
        id: 'train-1',
        broadcaster_user_id: 'broadcaster',
        broadcaster_user_login: 'streamer',
        total: 4200,
        progress: 1200,
        goal: 2500,
        level: 3,
        top_contributions: [{
          user_id: 'u1',
          user_login: 'gifter',
          user_name: 'Gifter',
          type: 'subscription',
          total: 3000,
        }],
        last_contribution: {
          user_id: 'u2',
          user_login: 'cheerer',
          user_name: 'Cheerer',
          type: 'bits',
          total: 200,
        },
        shared_train_participants: [{
          broadcaster_user_id: 'partner',
          broadcaster_user_login: 'partner_login',
          broadcaster_user_name: 'Partner',
        }],
        started_at: '2026-09-13T00:55:00Z',
        expires_at: '2026-09-13T01:05:00Z',
        type: 'regular',
        is_shared_train: true,
      },
    ));

    expect(normalized).not.toBeNull();
    expect(normalized).toMatchObject({
      id: 'delivery-1',
      type: 'hype-train',
      platform: 'twitch',
      channelId: 'broadcaster',
      channelName: 'streamer',
      origin: 'live',
      data: {
        phase: 'progress',
        id: 'train-1',
        total: 4200,
        progress: 1200,
        goal: 2500,
        level: 3,
        trainType: 'regular',
        isSharedTrain: true,
        topContributions: [{
          userId: 'u1', username: 'gifter', displayName: 'Gifter', type: 'subscription', total: 3000,
        }],
        lastContribution: {
          userId: 'u2', username: 'cheerer', displayName: 'Cheerer', type: 'bits', total: 200,
        },
        sharedTrainParticipants: [{
          broadcasterUserId: 'partner',
          broadcasterUsername: 'partner_login',
          broadcasterDisplayName: 'Partner',
        }],
      },
    });
    expect(normalized?.timestamp).toBe(Date.parse('2026-09-13T01:00:00.123Z'));

    expect(deserializeChatEvent(serializeChatEvent(normalized!))).toEqual(normalized);
  });

  it('normalizes end without inventing progress or goal fields', () => {
    const normalized = normalizeTwitchHypeTrainEvent(envelope(
      'channel.hype_train.end',
      {
        id: 'train-2',
        broadcaster_user_id: 'broadcaster',
        broadcaster_user_login: 'streamer',
        total: 9000,
        level: 5,
        top_contributions: [],
        started_at: '2026-09-13T00:45:00Z',
        ended_at: '2026-09-13T01:00:00Z',
        cooldown_ends_at: '2026-09-13T02:00:00Z',
        type: 'golden_kappa',
        is_shared_train: false,
      },
      'delivery-end',
    ));

    expect(normalized?.data).toMatchObject({
      phase: 'end',
      id: 'train-2',
      total: 9000,
      level: 5,
      endedAt: '2026-09-13T01:00:00Z',
      cooldownEndsAt: '2026-09-13T02:00:00Z',
      trainType: 'golden_kappa',
    });
    expect(normalized?.data.progress).toBeUndefined();
    expect(normalized?.data.goal).toBeUndefined();
  });
});
