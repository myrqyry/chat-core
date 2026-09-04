import type { EmoteCandidate, EmoteImage } from '../types/emotes';
import type { ProviderOptions, ProviderResult } from '../types/providers';
import { fetchJson, HttpError } from '../network/fetch';
import { providerStatus } from '../types/providers';

const API = 'https://7tv.io/v3';

interface SevenTvHostFile {
  name?: string;
  width?: number;
  height?: number;
  frame_count?: number;
  format?: string;
}

interface SevenTvEmote {
  id?: string;
  name?: string;
  flags?: number;
  data?: {
    flags?: number;
    animated?: boolean;
    host?: { url?: string; files?: SevenTvHostFile[] };
  };
}

interface SevenTvSet {
  emotes?: SevenTvEmote[];
}

const normalizeUrl = (url: string): string => url.startsWith('//') ? `https:${url}` : url;

const imagesFrom = (host: string, files: SevenTvHostFile[]): EmoteImage[] => {
  const base = normalizeUrl(host).replace(/\/$/u, '');
  return files.flatMap((file): EmoteImage[] => file.name ? [{
    url: `${base}/${file.name}`,
    width: file.width,
    height: file.height,
    format: file.format ?? file.name.split('.').pop(),
    animated: (file.frame_count ?? 1) > 1,
  }] : []);
};

const primaryImage = (images: EmoteImage[]): EmoteImage | undefined =>
  images.find((image) => /\/4x\.webp$/u.test(image.url)) ??
  images.find((image) => /\.webp$/u.test(image.url)) ??
  images.find((image) => /\/4x\.avif$/u.test(image.url)) ??
  images.at(-1);

const candidatesFrom = (emotes: SevenTvEmote[], scope: 'channel' | 'global'): EmoteCandidate[] =>
  emotes.flatMap((emote) => {
    const id = emote.id;
    const code = emote.name;
    const host = emote.data?.host?.url;
    if (!id || !code || !host) return [];
    const images = imagesFrom(host, emote.data?.host?.files ?? []);
    const primary = primaryImage(images);
    if (!primary) return [];
    const zeroWidth = (((emote.flags ?? 0) & 1) !== 0) || (((emote.data?.flags ?? 0) & 256) !== 0);
    return [{
      id,
      code,
      url: primary.url,
      altUrls: images.filter((image) => image.url !== primary.url).map((image) => image.url),
      zeroWidth,
      provider: '7tv' as const,
      scope,
      animated: emote.data?.animated ?? images.some((image) => image.animated),
      images,
      ...(zeroWidth ? { modifier: 'overlay' as const } : {}),
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
      if (error instanceof HttpError && error.status === 404) continue;
      lastRealError = error;
    }
  }

  if (lastRealError !== undefined) {
    return { candidates: [], status: providerStatus('7tv', 'channel', [], lastRealError) };
  }
  return { candidates: [], status: providerStatus('7tv', 'channel', []) };
}
