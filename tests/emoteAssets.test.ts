import { describe, expect, it } from 'vitest';
import { emoteAssetCandidates, resolveEmoteAsset } from '../src/emotes/assets';
import type { Emote } from '../src/types/emotes';

const emote = (overrides: Partial<Emote> = {}): Emote => ({
  code: 'Wave',
  id: 'wave-1',
  url: 'https://cdn.example/wave/2x.webp',
  altUrls: [
    'https://cdn.example/wave/1x.webp',
    'https://cdn.example/wave/3x.avif',
    'https://cdn.example/wave/2x.webp',
  ],
  zeroWidth: false,
  provider: '7tv',
  images: [
    { url: 'https://cdn.example/wave/1x.webp', width: 32, height: 24, scale: 1, format: 'webp', animated: false },
    { url: 'https://cdn.example/wave/2x.webp', width: 64, height: 48, scale: 2, format: 'webp', animated: false },
    { url: 'https://cdn.example/wave/3x.avif', width: 96, height: 72, scale: 3, format: 'avif', animated: false },
  ],
  ...overrides,
});

describe('emote asset resolution', () => {
  it('keeps the declared primary URL first when no preferences are supplied', () => {
    const assets = emoteAssetCandidates(emote());

    expect(assets.map((asset) => asset.url)).toEqual([
      'https://cdn.example/wave/2x.webp',
      'https://cdn.example/wave/1x.webp',
      'https://cdn.example/wave/3x.avif',
    ]);
    expect(assets[0]).toMatchObject({ width: 64, height: 48, scale: 2, format: 'webp' });
  });

  it('selects the closest requested scale and preserves deterministic fallbacks', () => {
    const assets = emoteAssetCandidates(emote(), { scale: 1 });

    expect(assets[0].scale).toBe(1);
    expect(assets.map((asset) => asset.scale)).toEqual([1, 2, 3]);
    expect(resolveEmoteAsset(emote(), { scale: 1 })?.url).toContain('/1x.webp');
  });

  it('derives scale metadata from URL-only Twitch and Nx asset variants', () => {
    const twitch: Emote = {
      code: 'Kappa',
      id: '25',
      url: 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/3.0',
      altUrls: [
        'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0',
        'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0',
      ],
      zeroWidth: false,
      provider: 'twitch',
    };

    const twitchScaleOne = resolveEmoteAsset(twitch, { scale: 1 });
    expect(twitchScaleOne).toMatchObject({ scale: 1 });
    expect(twitchScaleOne).not.toHaveProperty('format');
    expect(twitchScaleOne?.url).toContain('/1.0');
    expect(emoteAssetCandidates(twitch, { preferredFormats: ['webp'] })[0]).not.toHaveProperty('format');

    const filenameScaled = emote({
      images: undefined,
      url: 'https://cdn.example/wave/3x.webp',
      altUrls: ['https://cdn.example/wave/1x.webp', 'https://cdn.example/wave/2x.webp'],
    });
    expect(resolveEmoteAsset(filenameScaled, { scale: 2 })).toMatchObject({ scale: 2 });
  });

  it('prefers a requested format before scale when both are specified', () => {
    const resolved = resolveEmoteAsset(emote(), {
      preferredFormats: ['avif', 'webp'],
      scale: 2,
    });

    expect(resolved).toMatchObject({ format: 'avif', scale: 3 });
  });

  it('prefers an animation and theme match but falls back to unspecified metadata', () => {
    const themed = emote({
      url: 'https://cdn.example/static-dark.webp',
      images: [
        { url: 'https://cdn.example/static-dark.webp', animated: false, theme: 'dark', scale: 1 },
        { url: 'https://cdn.example/animated-light.webp', animated: true, theme: 'light', scale: 1 },
        { url: 'https://cdn.example/animated-generic.webp', animated: true, scale: 1 },
      ],
      altUrls: [],
    });

    expect(resolveEmoteAsset(themed, { animated: true, theme: 'light' })?.url)
      .toContain('animated-light');
    expect(resolveEmoteAsset(themed, { animated: true, theme: 'dark' })?.url)
      .toContain('animated-generic');
  });

  it('uses intrinsic dimensions to prefer the smallest asset that meets a target', () => {
    expect(resolveEmoteAsset(emote(), { targetWidth: 50, targetHeight: 40 }))
      .toMatchObject({ width: 64, height: 48, scale: 2 });
    expect(resolveEmoteAsset(emote(), { targetWidth: 90, targetHeight: 70 }))
      .toMatchObject({ width: 96, height: 72, scale: 3 });
  });

  it('falls through equal unknown scale ranks to dimension preferences', () => {
    const withoutScales = emote({
      url: 'https://cdn.example/wave-large.webp',
      altUrls: [],
      images: [
        { url: 'https://cdn.example/wave-large.webp', width: 128, height: 96 },
        { url: 'https://cdn.example/wave-medium.webp', width: 64, height: 48 },
      ],
    });

    expect(resolveEmoteAsset(withoutScales, { scale: 2, targetWidth: 50, targetHeight: 40 }))
      .toMatchObject({ url: 'https://cdn.example/wave-medium.webp', width: 64, height: 48 });
  });

  it('deduplicates URLs and drops unsafe fallbacks', () => {
    const assets = emoteAssetCandidates(emote({
      altUrls: [
        'javascript:alert(1)',
        'https://cdn.example/wave/1x.webp',
        'https://cdn.example/wave/1x.webp',
      ],
    }));

    expect(assets.map((asset) => asset.url)).toEqual([
      'https://cdn.example/wave/2x.webp',
      'https://cdn.example/wave/1x.webp',
      'https://cdn.example/wave/3x.avif',
    ]);
  });
});
