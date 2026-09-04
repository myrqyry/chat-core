import { afterEach, describe, expect, it, vi } from 'vitest';
import { readCachedEmotes, writeCachedEmotes } from '../src/emotes/cache';
import type { EmoteFetchResult } from '../src/types/emotes';

const result: EmoteFetchResult = {
  emotes: {
    Test: {
      code: 'Test',
      id: 'test',
      url: 'https://example.com/4x.webp',
      altUrls: ['https://example.com/1x.png'],
      zeroWidth: false,
      provider: '7tv',
    },
  },
  providers: [],
  fromCache: false,
  complete: true,
};

describe('emote cache', () => {
  afterEach(() => vi.useRealTimers());

  it('round-trips fresh results and alternate URLs', () => {
    writeCachedEmotes('cache-test', result);

    expect(readCachedEmotes('cache-test')).toMatchObject({
      fromCache: true,
      emotes: { Test: { altUrls: result.emotes.Test.altUrls } },
    });
  });

  it('expires results after the cache duration', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-03T00:00:00Z'));
    writeCachedEmotes('expiry-test', result);
    vi.advanceTimersByTime(5 * 60 * 1000);

    expect(readCachedEmotes('expiry-test')).toBeNull();
  });

  it('ignores malformed records', () => {
    expect(readCachedEmotes('malformed-test')).toBeNull();
  });
});
