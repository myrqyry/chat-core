import { describe, expect, it } from 'vitest';
import { mergeCandidates, parseMessageFragments, resolveEmoteAsset, twitchEmoteSpansFromTag } from '../src/index';
import type { EmoteSet } from '../src/index';

describe('message fragments', () => {
  it('preserves text while turning third-party emotes into structured fragments', () => {
    const emotes: EmoteSet = {
      Kappaish: {
        id: 'third-1',
        code: 'Kappaish',
        provider: '7tv',
        zeroWidth: false,
        url: 'https://cdn.example/Kappaish.webp',
      },
    };

    expect(parseMessageFragments('hi Kappaish there', { emotes })).toEqual([
      { type: 'text', text: 'hi ' },
      { type: 'emote', text: 'Kappaish', emote: emotes.Kappaish, overlays: [], modifiers: [] },
      { type: 'text', text: ' there' },
    ]);
  });

  it('attaches zero-width emotes to the preceding base emote', () => {
    const emotes: EmoteSet = {
      Base: { id: 'base', code: 'Base', provider: '7tv', zeroWidth: false, url: 'https://cdn.example/base.webp' },
      Hat: { id: 'hat', code: 'Hat', provider: '7tv', zeroWidth: true, url: 'https://cdn.example/hat.webp' },
    };

    expect(parseMessageFragments('Base Hat', { emotes })).toEqual([
      { type: 'emote', text: 'Base', emote: emotes.Base, overlays: [emotes.Hat], modifiers: [] },
    ]);
  });

  it('preserves hidden FFZ modifiers without rendering them as emotes', () => {
    const emotes: EmoteSet = {
      Base: { id: 'base', code: 'Base', provider: 'ffz', zeroWidth: false, url: 'https://cdn.example/base.webp' },
      Effect: {
        id: 'effect', code: 'Effect', provider: 'ffz', zeroWidth: false,
        modifier: 'hidden', url: 'https://cdn.example/effect.webp',
      },
    };

    expect(parseMessageFragments('Base Effect', { emotes })).toEqual([
      { type: 'emote', text: 'Base', emote: emotes.Base, overlays: [], modifiers: [emotes.Effect] },
    ]);
  });

  it('keeps an orphan hidden modifier as an explicit non-rendering fragment', () => {
    const emotes: EmoteSet = {
      Effect: {
        id: 'effect', code: 'Effect', provider: 'ffz', zeroWidth: false,
        modifier: 'hidden', url: 'https://cdn.example/effect.webp',
      },
    };
    expect(parseMessageFragments('Effect', { emotes })).toEqual([
      { type: 'modifier', text: 'Effect', emote: emotes.Effect },
    ]);
  });

  it('uses Twitch native emote positions without loading a catalog', () => {
    const spans = twitchEmoteSpansFromTag({ '25': ['3-7'] });
    const fragments = parseMessageFragments('yo Kappa!', { nativeEmotes: spans });

    expect(fragments[1]).toMatchObject({
      type: 'emote',
      text: 'Kappa',
      emote: { id: '25', provider: 'twitch' },
      modifiers: [],
    });
    const native = fragments[1];
    expect(native.type).toBe('emote');
    if (native.type !== 'emote') return;
    const lightOne = native.emote.images?.find((image) => image.theme === 'light' && image.scale === 1);
    expect(lightOne).toBeDefined();
    expect(lightOne).not.toHaveProperty('animated');
    expect(native.emote).not.toHaveProperty('animated');
    expect(resolveEmoteAsset(native.emote, { theme: 'light', scale: 1, animated: true })?.url)
      .toBe('https://static-cdn.jtvnw.net/emoticons/v2/25/default/light/1.0');
  });
});

describe('emote precedence', () => {
  it('keeps sender-local user emotes above channel emotes', () => {
    const result = mergeCandidates([
      { id: 'ffz', code: 'Same', provider: 'ffz', scope: 'user', zeroWidth: false, url: 'https://ffz.example/same' },
      { id: '7tv', code: 'Same', provider: '7tv', scope: 'channel', zeroWidth: false, url: 'https://7tv.example/same' },
    ]);
    expect(result.Same.id).toBe('ffz');
  });

  it('supports caller-defined provider ordering within the same scope', () => {
    const candidates = [
      { id: 'ffz', code: 'Same', provider: 'ffz', scope: 'channel', zeroWidth: false, url: 'https://ffz.example/same' },
      { id: '7tv', code: 'Same', provider: '7tv', scope: 'channel', zeroWidth: false, url: 'https://7tv.example/same' },
    ] as const;

    expect(mergeCandidates([...candidates]).Same.id).toBe('7tv');
    expect(mergeCandidates([...candidates], { providerPriority: { ffz: 100 } }).Same.id).toBe('ffz');
  });
});
