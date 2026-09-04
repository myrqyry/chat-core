import type { EmoteCandidate } from '../types/emotes';
import type { ProviderOptions, ProviderResult } from '../types/providers';
import { fetchJson, HttpError } from '../network/fetch';
import { providerStatus } from '../types/providers';

const API = 'https://7tv.io/v3';

interface SevenTvEmote {
  id?: string;
  name?: string;
  data?: {
    flags?: number;
    host?: { url?: string; files?: Array<{ name?: string }> };
  };
}

interface SevenTvSet {
  emotes?: SevenTvEmote[];
}

const candidatesFrom = (emotes: SevenTvEmote[], scope: 'channel' | 'global'): EmoteCandidate[] =>
  emotes.flatMap((emote) => {
    const id = emote.id;
    const code = emote.name;
    const host = emote.data?.host?.url;
    if (!id || !code || !host) return [];
    const baseUrl = host.startsWith('//') ? `https:${host}` : host;
    const files = emote.data?.host?.files ?? [];
    const altUrls = files
      .map((file) => file.name)
      .filter((name): name is string => !!name)
      .filter((name) => name !== '4x.webp')
      .map((name) => `${baseUrl}/${name}`);
    return [{
      id,
      code,
      url: `${baseUrl}/4x.webp`,
      ...(altUrls.length > 0 ? { altUrls } : {}),
      zeroWidth: ((emote.data?.flags ?? 0) & 256) !== 0,
      provider: '7tv' as const,
      scope,
    }];
  });

async function load(url: string, scope: 'channel' | 'global', options: ProviderOptions): Promise<ProviderResult> {
  try {
    const data = await fetchJson<SevenTvSet>(url, { signal: options.signal });
    const candidates = candidatesFrom(data.emotes ?? [], scope);
    return { candidates, status: providerStatus('7tv', scope, candidates) };
  } catch (error) {
    return { candidates: [], status: providerStatus('7tv', scope, [], error) };
  }
}

export const fetchGlobalSevenTv = (options: ProviderOptions = {}): Promise<ProviderResult> =>
  load(`${API}/emote-sets/global`, 'global', options);

export async function fetchChannelSevenTv(
  channelName: string,
  twitchUserId: string | null,
  options: ProviderOptions = {},
): Promise<ProviderResult> {
  const lookups = twitchUserId ? [twitchUserId, channelName] : [channelName];
  let lastRealError: unknown;

  for (const lookup of lookups) {
    try {
      const user = await fetchJson<{ emote_set?: { id?: string } }>(
        `${API}/users/twitch/${encodeURIComponent(lookup)}`,
        { signal: options.signal },
      );
      const setId = user.emote_set?.id;
      if (setId) return load(`${API}/emote-sets/${encodeURIComponent(setId)}`, 'channel', options);
      return { candidates: [], status: providerStatus('7tv', 'channel', []) };
    } catch (error) {
      if (options.signal?.aborted) {
        return { candidates: [], status: providerStatus('7tv', 'channel', [], error) };
      }
      if (error instanceof HttpError && error.status === 404) {
        continue;
      }
      lastRealError = error;
    }
  }

  if (lastRealError !== undefined) {
    return { candidates: [], status: providerStatus('7tv', 'channel', [], lastRealError) };
  }
  return { candidates: [], status: providerStatus('7tv', 'channel', []) };
}
