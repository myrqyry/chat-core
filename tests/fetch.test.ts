import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchJson, fetchWithTimeout, HttpError } from '../src/network/fetch';

describe('fetchWithTimeout', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.useRealTimers());

  it('passes a composed abort signal and parses JSON', async () => {
    const fetchMock = vi.fn(async (_url: string, options?: RequestInit) => {
      expect(options?.signal).toBeInstanceOf(AbortSignal);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchJson<{ ok: boolean }>('https://example.com/data')).resolves.toEqual({ ok: true });
  });

  it('does not retry caller cancellation', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn((_url: string, options?: RequestInit) => {
      controller.abort();
      return Promise.reject(new DOMException('Aborted', 'AbortError'));
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchWithTimeout('https://example.com/data', { signal: controller.signal }, 100, 3))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects when the request exceeds its timeout', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, options?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const signal = options?.signal;
      signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));
    vi.stubGlobal('fetch', fetchMock);

    const request = fetchWithTimeout('https://example.com/slow', {}, 50, 0);
    await vi.advanceTimersByTimeAsync(50);

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a server failure once', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchWithTimeout('https://example.com/data', {}, 1000, 1)).resolves.toMatchObject({ status: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('preserves HTTP status for JSON request failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 404 })));

    const error = await fetchJson('https://example.com/missing').catch((caught) => caught);
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ status: 404, url: 'https://example.com/missing' });
  });
});
