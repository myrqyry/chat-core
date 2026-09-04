import type { EmoteFetchOptions, EmoteFetchResult, EmoteSet, ProviderStatus } from '../types/emotes';
import { isAbortError } from '../network/fetch';
import { fetchChannelSevenTv, fetchGlobalSevenTv } from './sevenTv';
import { fetchChannelBttv, fetchGlobalBttv } from './bttv';
import { fetchChannelFfz, fetchGlobalFfz } from './ffz';
import { resolveTwitchUserId } from './twitch';
import { mergeCandidates } from './registry';
import { readCachedEmotes, writeCachedEmotes } from './cache';

const inflight = new Map<string, Promise<EmoteFetchResult>>();

const abortable = <T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> => {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('The operation was aborted.', 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => { signal.removeEventListener('abort', onAbort); resolve(value); },
      (error) => { signal.removeEventListener('abort', onAbort); reject(error); },
    );
  });
};

const load = async (channel: string): Promise<EmoteFetchResult> => {
  const globalResults = await Promise.all([
    fetchGlobalSevenTv(),
    fetchGlobalBttv(),
    fetchGlobalFfz(),
  ]);
  const userId = await resolveTwitchUserId(channel);
  const channelResults = await Promise.all([
    fetchChannelSevenTv(channel, userId),
    fetchChannelBttv(userId),
    fetchChannelFfz(channel),
  ]);
  const results = [...globalResults, ...channelResults];
  const providers: ProviderStatus[] = results.map((result) => result.status);
  const emotes: EmoteSet = mergeCandidates(results.flatMap((result) => result.candidates));
  const result: EmoteFetchResult = {
    emotes,
    providers,
    fromCache: false,
    complete: providers.every((status) => status.ok),
  };
  writeCachedEmotes(channel, result);
  return result;
};

export const fetchChannelEmotesDetailed = async (
  channelName: string,
  options: EmoteFetchOptions = {},
): Promise<EmoteFetchResult> => {
  const channel = channelName.trim().toLowerCase();
  if (!channel) return { emotes: {}, providers: [], fromCache: false, complete: true };

  if (!options.bypassCache) {
    const cached = readCachedEmotes(channel);
    if (cached) return abortable(Promise.resolve(cached), options.signal);
    const current = inflight.get(channel);
    if (current) return abortable(current, options.signal);
  }

  const request = load(channel);
  inflight.set(channel, request);
  request.finally(() => {
    if (inflight.get(channel) === request) inflight.delete(channel);
  }).catch(() => undefined);
  return abortable(request, options.signal);
};

export const fetchChannelEmotes = async (
  channelName: string,
  options: EmoteFetchOptions = {},
): Promise<EmoteSet> => (await fetchChannelEmotesDetailed(channelName, options)).emotes;

export { isAbortError };
