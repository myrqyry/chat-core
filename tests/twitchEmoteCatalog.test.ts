import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchTwitchEmoteCatalog,
  normalizeTwitchMessageFragments,
  resolveTwitchEmoteAsset,
  sevenTvCandidateFromActiveEmote,
} from '../src/index';

const TWITCH_TEMPLATE =
  'https://static-cdn.jtvnw.net/emoticons/v2/{{id}}/{{format}}/{{theme_mode}}/{{scale}}';

describe('Twitch native emote catalog', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('fetches global and channel catalogs with existing Twitch auth and preserves precedence', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const headers = init?.headers as Record<string, string> | undefined;
      expect(headers?.['Client-Id']).toBe('client-id');
      expect(headers?.Authorization).toBe('Bearer user-token');

      const url = String(input);
      if (url.endsWith('/helix/chat/emotes/global')) {
        return new Response(JSON.stringify({
          template: TWITCH_TEMPLATE,
          data: [{
            id: '25',
            name: 'Kappa',
            format: ['static'],
            scale: ['1.0', '2.0', '3.0'],
            theme_mode: ['light', 'dark'],
          }],
        }), { status: 200 });
      }
      if (url.includes('/helix/chat/emotes?broadcaster_id=123')) {
        return new Response(JSON.stringify({
          template: TWITCH_TEMPLATE,
          data: [
            {
              id: 'channel-kappa',
              name: 'Kappa',
              emote_type: 'subscriptions',
              emote_set_id: 'set-1',
              owner_id: '123',
              tier: '1000',
              format: ['static'],
              scale: ['1.0', '2.0', '3.0'],
              theme_mode: ['light', 'dark'],
            },
            {
              id: 'dance',
              name: 'Dance',
              format: ['static', 'animated'],
              scale: ['1.0', '2.0', '3.0'],
              theme_mode: ['light', 'dark'],
            },
          ],
        }), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const catalog = await fetchTwitchEmoteCatalog(
      { clientId: 'client-id', accessToken: 'user-token' },
      '123',
    );

    expect(catalog.global).toHaveLength(1);
    expect(catalog.channel).toHaveLength(2);
    expect(catalog.emotes.Kappa.id).toBe('channel-kappa');
    expect(catalog.emotes.Dance.provider).toBe('twitch');
    expect(catalog.channel[0]).toMatchObject({
      emoteType: 'subscriptions',
      emoteSetId: 'set-1',
      ownerId: '123',
      tier: '1000',
    });
  });

  it('resolves only supported static/animated, theme, and size variants', () => {
    const descriptor = {
      id: 'dance',
      formats: ['static', 'animated'],
      scales: ['1.0', '2.0', '3.0'],
      themes: ['light', 'dark'],
      template: TWITCH_TEMPLATE,
    };

    expect(resolveTwitchEmoteAsset(descriptor, {
      animated: false,
      theme: 'light',
      scale: 2,
    })).toBe('https://static-cdn.jtvnw.net/emoticons/v2/dance/static/light/2.0');

    expect(resolveTwitchEmoteAsset(descriptor, {
      animated: true,
      theme: 'dark',
      scale: 3,
    })).toBe('https://static-cdn.jtvnw.net/emoticons/v2/dance/animated/dark/3.0');

    expect(resolveTwitchEmoteAsset({
      id: 'static-only',
      formats: ['static'],
      scales: ['1.0', '2.0'],
      themes: ['light'],
      template: TWITCH_TEMPLATE,
    }, {
      animated: true,
      theme: 'dark',
      scale: 3,
    })).toBe('https://static-cdn.jtvnw.net/emoticons/v2/static-only/static/light/2.0');
  });

  it('uses the same variant model for EventSub native emote fragments', () => {
    const normalized = normalizeTwitchMessageFragments('Dance', [{
      type: 'emote',
      text: 'Dance',
      emote: { id: 'dance', format: ['static', 'animated'] },
    }]);
    const fragment = normalized.fragments[0];
    expect(fragment.type).toBe('emote');
    if (fragment.type !== 'emote') return;

    expect(fragment.emote.url).toBe(
      'https://static-cdn.jtvnw.net/emoticons/v2/dance/animated/dark/3.0',
    );
    expect(fragment.emote.images).toContainEqual(expect.objectContaining({
      scale: 1,
      animated: false,
      theme: 'light',
    }));
    expect(fragment.emote.images).toContainEqual(expect.objectContaining({
      scale: 3,
      animated: true,
      theme: 'dark',
    }));
  });
});

describe('7TV content metadata', () => {
  it('keeps content flags separate from active zero-width assignment', () => {
    const candidate = sevenTvCandidateFromActiveEmote({
      id: 'flagged',
      name: 'Flagged',
      flags: 0,
      data: {
        flags: (1 << 8) | (1 << 16) | (1 << 17) | (1 << 18) | (1 << 24),
        listed: false,
        animated: false,
        host: {
          url: '//cdn.7tv.app/emote/flagged',
          files: [{ name: '4x.webp', width: 128, height: 128, format: 'WEBP' }],
        },
      },
    });

    expect(candidate).not.toBeNull();
    expect(candidate?.zeroWidth).toBe(false);
    expect(candidate?.modifier).toBeUndefined();
    expect(candidate?.content).toEqual({
      sexual: true,
      epilepsy: true,
      edgy: true,
      twitchDisallowed: true,
      listed: false,
    });
  });
});
