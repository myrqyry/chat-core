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
});
