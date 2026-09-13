import { describe, expect, it, vi } from 'vitest';
import {
  SEVEN_TV_ACTIVE_EMOTE_FLAGS,
  SevenTvEntitlementStore,
  deserializeChatEvent,
  mergeCandidates,
  normalizeTwitchEventSubNotification,
  sevenTvCandidateFromActiveEmote,
  sevenTvOverridesFromActiveEmote,
} from '../src/index';
import type { EmoteCandidate, SevenTvDispatch } from '../src/index';

const activeEmote = (name = 'Personal', flags = 0) => ({
  id: `7tv-${name}`,
  name,
  flags,
  data: {
    flags: 0,
    animated: false,
    host: {
      url: `//cdn.7tv.app/emote/7tv-${name}`,
      files: [{ name: '4x.webp', width: 128, height: 128, format: 'WEBP' }],
    },
  },
});

const entitlementDispatch = (
  type: 'entitlement.create' | 'entitlement.delete',
  kind: 'EMOTE_SET' | 'BADGE' | 'PAINT' = 'EMOTE_SET',
  refId = 'personal-set',
): SevenTvDispatch => ({
  type,
  body: {
    object: {
      kind,
      ref_id: refId,
      user: {
        id: 'seven-user',
        connections: [
          { id: 'twitch-user', platform: 'TWITCH' },
          { id: 'kick-user', platform: 'KICK' },
        ],
      },
    },
  },
});

describe('7TV active emote overrides', () => {
  it('preserves all current provider override bits without confusing pending with zero-width', () => {
    const flags =
      SEVEN_TV_ACTIVE_EMOTE_FLAGS.pending |
      SEVEN_TV_ACTIVE_EMOTE_FLAGS.overrideTwitchGlobal |
      SEVEN_TV_ACTIVE_EMOTE_FLAGS.overrideTwitchSubscriber |
      SEVEN_TV_ACTIVE_EMOTE_FLAGS.overrideBetterTtv |
      SEVEN_TV_ACTIVE_EMOTE_FLAGS.overrideFrankerFaceZ;
    const source = activeEmote('Same', flags);
    const candidate = sevenTvCandidateFromActiveEmote(source);

    expect(sevenTvOverridesFromActiveEmote(source)).toEqual({
      twitchGlobal: true,
      twitchSubscriber: true,
      betterTtv: true,
      frankerFaceZ: true,
    });
    expect(candidate).toMatchObject({
      zeroWidth: false,
      overrides: {
        twitchGlobal: true,
        twitchSubscriber: true,
        betterTtv: true,
        frankerFaceZ: true,
      },
    });
  });

  it('lets explicit 7TV Twitch override flags beat Twitch while leaving unflagged aliases alone', () => {
    const twitchGlobal: EmoteCandidate = {
      id: 'twitch-global', code: 'Same', url: 'https://example.com/twitch-global.webp',
      zeroWidth: false, provider: 'twitch', scope: 'global',
    };
    const twitchSubscriber: EmoteCandidate = {
      id: 'twitch-sub', code: 'SubSame', url: 'https://example.com/twitch-sub.webp',
      zeroWidth: false, provider: 'twitch', scope: 'channel',
    };
    const ordinary = sevenTvCandidateFromActiveEmote(activeEmote('Same'))!;
    const globalOverride = sevenTvCandidateFromActiveEmote(activeEmote(
      'Same',
      SEVEN_TV_ACTIVE_EMOTE_FLAGS.overrideTwitchGlobal,
    ))!;
    const subscriberOverride = sevenTvCandidateFromActiveEmote(activeEmote(
      'SubSame',
      SEVEN_TV_ACTIVE_EMOTE_FLAGS.overrideTwitchSubscriber,
    ))!;

    expect(mergeCandidates([twitchGlobal, ordinary]).Same.provider).toBe('twitch');
    expect(mergeCandidates([twitchGlobal, globalOverride]).Same.provider).toBe('7tv');
    expect(mergeCandidates([twitchSubscriber, subscriberOverride]).SubSame.provider).toBe('7tv');
  });
});

describe('7TV personal entitlement state', () => {
  it('maps only the selected platform connection and loads personal emotes per sender', async () => {
    const loadEmoteSet = vi.fn(async (id: string) => {
      expect(id).toBe('personal-set');
      return [sevenTvCandidateFromActiveEmote(activeEmote('Personal'), 'user')!];
    });
    const store = new SevenTvEntitlementStore({ platform: 'twitch', loadEmoteSet });

    const result = await store.applyDispatch(entitlementDispatch('entitlement.create'));

    expect(result).toMatchObject({
      changed: true,
      addedEmoteSetIds: ['personal-set'],
      removedEmoteSetIds: [],
    });
    expect(result.granted).toHaveLength(1);
    expect(result.granted[0]).toMatchObject({
      platform: 'twitch',
      platformUserId: 'twitch-user',
      sevenTvUserId: 'seven-user',
      kind: 'EMOTE_SET',
      refId: 'personal-set',
    });
    expect(store.list('kick-user')).toEqual([]);
    expect(store.personalEmotes('twitch-user').Personal).toMatchObject({
      provider: '7tv',
      id: '7tv-Personal',
    });
    expect(loadEmoteSet).toHaveBeenCalledTimes(1);
  });

  it('reconciles revoke then re-grant in one batch without unloading or reporting a false state change', async () => {
    const loadEmoteSet = vi.fn(async () => [sevenTvCandidateFromActiveEmote(activeEmote('Personal'), 'user')!]);
    const store = new SevenTvEntitlementStore({ platform: 'twitch', loadEmoteSet });
    const create = entitlementDispatch('entitlement.create');
    const remove = entitlementDispatch('entitlement.delete');

    await store.applyDispatch(create);
    const result = await store.applyDispatches([remove, create]);

    expect(result).toMatchObject({
      changed: false,
      granted: [],
      revoked: [],
      addedEmoteSetIds: [],
      removedEmoteSetIds: [],
    });
    expect(store.personalEmotes('twitch-user').Personal).toBeDefined();
    expect(loadEmoteSet).toHaveBeenCalledTimes(1);
  });

  it('removes all entitlements for a 7TV user on entitlement.reset', async () => {
    const store = new SevenTvEntitlementStore({
      platform: 'twitch',
      loadEmoteSet: async () => [sevenTvCandidateFromActiveEmote(activeEmote(), 'user')!],
    });
    await store.applyDispatch(entitlementDispatch('entitlement.create'));
    await store.applyDispatch(entitlementDispatch('entitlement.create', 'BADGE', 'badge-1'));

    const result = await store.applyDispatch({ type: 'entitlement.reset', body: { id: 'seven-user' } });

    expect(result.resetUserIds).toEqual(['seven-user']);
    expect(result.removedEmoteSetIds).toEqual(['personal-set']);
    expect(store.list()).toEqual([]);
    expect(store.personalEmotes('twitch-user')).toEqual({});
  });
});

describe('sender-local Twitch emote resolution', () => {
  it('resolves a personal emote for the chatter without replacing native Twitch fragments', () => {
    const channelEmote: EmoteCandidate = {
      id: 'channel-same', code: 'Same', url: 'https://example.com/channel.webp',
      zeroWidth: false, provider: 'bttv', scope: 'channel',
    };
    const personal = sevenTvCandidateFromActiveEmote(activeEmote('Same'), 'user')!;
    const personalSet = mergeCandidates([personal]);

    const normalized = normalizeTwitchEventSubNotification({
      metadata: {
        message_id: 'event-1',
        message_type: 'notification',
        message_timestamp: '2026-09-13T03:00:00Z',
        subscription_type: 'channel.chat.message',
        subscription_version: '1',
      },
      payload: {
        subscription: { type: 'channel.chat.message', version: '1' },
        event: {
          broadcaster_user_id: 'broadcaster',
          broadcaster_user_login: 'channel',
          chatter_user_id: 'twitch-user',
          chatter_user_login: 'viewer',
          message_id: 'message-1',
          message: { text: 'Same' },
        },
      },
    }, {
      emotes: mergeCandidates([channelEmote]),
      getUserEmotes: (userId) => userId === 'twitch-user' ? personalSet : {},
    });

    expect(normalized?.message?.fragments[0]).toMatchObject({
      type: 'emote',
      emote: { provider: '7tv', id: '7tv-Same' },
    });
  });
});

describe('event serialization validation', () => {
  it('accepts valid override metadata and rejects malformed typed override fields', () => {
    const base = {
      type: 'message',
      platform: 'twitch',
      timestamp: 0,
      message: {
        id: 'm',
        platform: 'twitch',
        user: { platform: 'twitch', username: 'viewer' },
        text: 'Same',
        timestamp: 0,
        fragments: [{
          type: 'emote',
          text: 'Same',
          emote: {
            code: 'Same',
            id: 'seven',
            url: 'https://example.com/seven.webp',
            zeroWidth: false,
            provider: '7tv',
            overrides: { twitchGlobal: true },
          },
          overlays: [],
          modifiers: [],
        }],
      },
    };

    expect(deserializeChatEvent(JSON.stringify(base)).message?.fragments[0]).toMatchObject({ type: 'emote' });
    expect(() => deserializeChatEvent(JSON.stringify({
      ...base,
      message: {
        ...base.message,
        fragments: [{
          ...base.message.fragments[0],
          emote: {
            ...base.message.fragments[0].emote,
            overrides: { twitchGlobal: 'yes' },
          },
        }],
      },
    }))).toThrow(TypeError);
  });
});
