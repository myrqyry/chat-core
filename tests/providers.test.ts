import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchChannelBttv,
  fetchChannelFfz,
  fetchChannelSevenTv,
  fetchGlobalBttv,
  fetchGlobalFfz,
} from '../src/index';

describe('provider adapters', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('parses 7TV channel candidates and the zero-width bitmask', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/users/twitch/123')) {
        return new Response(JSON.stringify({ emote_set: { id: 'set-1' } }), { status: 200 });
      }
      return new Response(JSON.stringify({
        emotes: [{
          id: 'emote-1',
          name: 'Overlay',
          data: { flags: 256, host: { url: '//cdn.7tv.app/emote/emote-1', files: [{ name: '1x.png' }] } },
        }],
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchChannelSevenTv('channel', '123');

    expect(result.status).toMatchObject({ provider: '7tv', scope: 'channel', ok: true, count: 1 });
    expect(result.candidates[0]).toMatchObject({ code: 'Overlay', zeroWidth: true, scope: 'channel' });
    expect(result.candidates[0].altUrls).toEqual(['https://cdn.7tv.app/emote/emote-1/1x.png']);
  });

  it('parses global BTTV and FFZ candidates', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('betterttv')) {
        return new Response(JSON.stringify([{ id: 'bttv-1', code: 'GlobalBTTV' }]), { status: 200 });
      }
      return new Response(JSON.stringify({ sets: { '1': { emoticons: [{ id: 7, name: 'GlobalFFZ', urls: { '1': '//cdn.example.com/7' } }] } } }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const [bttv, ffz] = await Promise.all([fetchGlobalBttv(), fetchGlobalFfz()]);

    expect(bttv.candidates[0]).toMatchObject({ code: 'GlobalBTTV', scope: 'global' });
    expect(ffz.candidates[0]).toMatchObject({ code: 'GlobalFFZ', url: 'https://cdn.example.com/7', scope: 'global' });
  });

  it('treats a missing optional channel provider account as an empty success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 404 })));

    const [bttv, ffz, sevenTv] = await Promise.all([
      fetchChannelBttv('123'),
      fetchChannelFfz('channel'),
      fetchChannelSevenTv('channel', '123'),
    ]);

    expect(bttv).toMatchObject({ candidates: [], status: { ok: true, count: 0 } });
    expect(ffz).toMatchObject({ candidates: [], status: { ok: true, count: 0 } });
    expect(sevenTv).toMatchObject({ candidates: [], status: { ok: true, count: 0 } });
  });

  it('reports a real 7TV channel provider failure instead of silently succeeding', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 503 })));

    const result = await fetchChannelSevenTv('channel', '123');

    expect(result.candidates).toEqual([]);
    expect(result.status).toMatchObject({ provider: '7tv', scope: 'channel', ok: false, count: 0 });
    expect(result.status.error).toContain('503');
  });
});
