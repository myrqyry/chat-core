import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchChannelEmotesDetailed } from '../src/emotes/loader';

describe('fetchChannelEmotesDetailed', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shares the underlying request while allowing one consumer to abort', async () => {
    let resolveUser: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (String(input).includes('api.ivr.fi')) {
        return new Promise<Response>((resolve) => { resolveUser = resolve; });
      }
      return Promise.resolve(new Response('{}', { status: 404 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const firstController = new AbortController();
    const first = fetchChannelEmotesDetailed(' Shared-Channel ', { signal: firstController.signal });
    const firstSettled = first.then(() => 'resolved', (error: Error) => `rejected:${error.name}`);
    const second = fetchChannelEmotesDetailed('shared-channel');
    firstController.abort();
    await vi.waitFor(() => expect(resolveUser).toBeDefined());
    resolveUser?.(new Response(JSON.stringify([{ id: '123' }]), { status: 200 }));

    await expect(firstSettled).resolves.toBe('rejected:AbortError');
    await expect(second).resolves.toMatchObject({ complete: false, fromCache: false });
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('api.ivr.fi'))).toHaveLength(1);
  });

  it('marks the BTTV channel result degraded when Twitch ID resolution really fails', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('api.ivr.fi')) return new Response('{}', { status: 503 });
      if (url.includes('7tv.io/v3/emote-sets/global')) return new Response(JSON.stringify({ emotes: [] }), { status: 200 });
      if (url.includes('betterttv.net/3/cached/emotes/global')) return new Response(JSON.stringify([]), { status: 200 });
      if (url.includes('frankerfacez.com/v1/set/global')) return new Response(JSON.stringify({ sets: {} }), { status: 200 });
      if (url.includes('7tv.io/v3/users/twitch/')) return new Response('{}', { status: 404 });
      if (url.includes('frankerfacez.com/v1/room/')) return new Response('{}', { status: 404 });
      return new Response('{}', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchChannelEmotesDetailed('lookup-failure-test', { bypassCache: true });
    const bttvChannel = result.providers.find((status) => status.provider === 'bttv' && status.scope === 'channel');

    expect(result.complete).toBe(false);
    expect(bttvChannel).toMatchObject({ ok: false, count: 0 });
    expect(bttvChannel?.error).toContain('Twitch user lookup failed');
  });

  it('does not cache a degraded result and retries it on the next call', async () => {
    let failGlobalSevenTv = true;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('api.ivr.fi')) return new Response(JSON.stringify([]), { status: 200 });
      if (url.includes('7tv.io/v3/emote-sets/global')) {
        return failGlobalSevenTv
          ? new Response('{}', { status: 503 })
          : new Response(JSON.stringify({ emotes: [] }), { status: 200 });
      }
      if (url.includes('betterttv.net/3/cached/emotes/global')) return new Response(JSON.stringify([]), { status: 200 });
      if (url.includes('frankerfacez.com/v1/set/global')) return new Response(JSON.stringify({ sets: {} }), { status: 200 });
      if (url.includes('7tv.io/v3/users/twitch/')) return new Response('{}', { status: 404 });
      if (url.includes('frankerfacez.com/v1/room/')) return new Response('{}', { status: 404 });
      return new Response('{}', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const first = await fetchChannelEmotesDetailed('cache-recovery-test');
    expect(first).toMatchObject({ complete: false, fromCache: false });
    const callsAfterFirst = fetchMock.mock.calls.length;

    failGlobalSevenTv = false;
    const second = await fetchChannelEmotesDetailed('cache-recovery-test');
    expect(second).toMatchObject({ complete: true, fromCache: false });
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterFirst);

    const callsAfterSecond = fetchMock.mock.calls.length;
    const third = await fetchChannelEmotesDetailed('cache-recovery-test');
    expect(third).toMatchObject({ complete: true, fromCache: true });
    expect(fetchMock.mock.calls).toHaveLength(callsAfterSecond);
  });
});
