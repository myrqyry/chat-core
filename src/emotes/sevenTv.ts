import type { EmoteCandidate, EmoteImage } from '../types/emotes';
import type { ProviderOptions, ProviderResult } from '../types/providers';
import { fetchJson, HttpError } from '../network/fetch';
import { providerStatus } from '../types/providers';

const API = 'https://7tv.io/v3';
const ACTIVE_EMOTE_ZERO_WIDTH = 1 << 0;

export type SevenTvPlatform = 'twitch' | 'kick';

interface SevenTvHostFile {
  name?: string;
  width?: number;
  height?: number;
  frame_count?: number;
  format?: string;
}

export interface SevenTvActiveEmote {
  id?: string;
  name?: string;
  flags?: number;
  data?: {
    name?: string;
    flags?: number;
    animated?: boolean;
    owner?: { display_name?: string };
    host?: { url?: string; files?: SevenTvHostFile[] };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface SevenTvSet {
  id?: string;
  emotes?: SevenTvActiveEmote[];
}

interface SevenTvConnection {
  id?: string;
  user?: { id?: string };
  emote_set?: SevenTvSet;
}

export interface SevenTvChannelSnapshot extends ProviderResult {
  found: boolean;
  platform: SevenTvPlatform;
  platformUserId: string;
  sevenTvUserId?: string;
  emoteSetId?: string;
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

const imageRank = (image: EmoteImage): number => {
  if (image.width && image.height) return image.width * image.height;
  const scale = image.url.match(/\/(\d+)x\.[a-z0-9]+$/iu)?.[1];
  return scale ? Number(scale) : 0;
};

const bestImage = (images: EmoteImage[]): EmoteImage | undefined => {
  const highest = (items: EmoteImage[]): EmoteImage | undefined =>
    [...items].sort((a, b) => imageRank(b) - imageRank(a))[0];
  return highest(images.filter((image) => /\.webp$/iu.test(image.url))) ??
    highest(images.filter((image) => /\.avif$/iu.test(image.url))) ??
    highest(images);
};

export function sevenTvCandidateFromActiveEmote(
  emote: SevenTvActiveEmote,
  scope: 'channel' | 'global' | 'user' = 'channel',
): EmoteCandidate | null {
  const id = emote.id;
  const code = emote.name;
  const host = emote.data?.host?.url;
  if (!id || !code || !host) return null;
  const images = imagesFrom(host, emote.data?.host?.files ?? []);
  const primary = bestImage(images);
  if (!primary) return null;

  // 7TV's active-emote ZeroWidth bit means this emote is configured as
  // zero-width in this set. data.flags bit 8 merely recommends zero-width and
  // must not override the set owner's choice.
  const zeroWidth = ((emote.flags ?? 0) & ACTIVE_EMOTE_ZERO_WIDTH) !== 0;
  return {
    id,
    code,
    url: primary.url,
    altUrls: images.filter((image) => image.url !== primary.url).map((image) => image.url),
    zeroWidth,
    provider: '7tv',
    scope,
    animated: emote.data?.animated ?? images.some((image) => image.animated),
    ownerName: emote.data?.owner?.display_name,
    images,
    ...(zeroWidth ? { modifier: 'overlay' as const } : {}),
    raw: emote,
  };
}

export const sevenTvCandidatesFromActiveEmotes = (
  emotes: SevenTvActiveEmote[],
  scope: 'channel' | 'global' | 'user',
): EmoteCandidate[] => emotes.flatMap((emote) => {
  const candidate = sevenTvCandidateFromActiveEmote(emote, scope);
  return candidate ? [candidate] : [];
});

async function load(url: string, scope: 'channel' | 'global', options: ProviderOptions): Promise<ProviderResult> {
  try {
    const data = await fetchJson<SevenTvSet>(url, { signal: options.signal });
    const candidates = sevenTvCandidatesFromActiveEmotes(data.emotes ?? [], scope);
    return { candidates, status: providerStatus('7tv', scope, candidates) };
  } catch (error) {
    return { candidates: [], status: providerStatus('7tv', scope, [], error) };
  }
}

export const fetchGlobalSevenTv = (options: ProviderOptions = {}): Promise<ProviderResult> =>
  load(`${API}/emote-sets/global`, 'global', options);

export async function fetchSevenTvChannelSnapshot(
  platform: SevenTvPlatform,
  platformUserId: string,
  options: ProviderOptions = {},
): Promise<SevenTvChannelSnapshot> {
  const normalizedId = platformUserId.trim();
  if (!normalizedId) {
    const candidates: EmoteCandidate[] = [];
    return {
      found: false,
      platform,
      platformUserId: normalizedId,
      candidates,
      status: providerStatus('7tv', 'channel', candidates),
    };
  }

  try {
    const connection = await fetchJson<SevenTvConnection>(
      `${API}/users/${platform}/${encodeURIComponent(normalizedId)}`,
      { signal: options.signal },
    );
    const emoteSetId = connection.emote_set?.id;
    const sevenTvUserId = connection.user?.id ?? connection.id;
    if (!emoteSetId) {
      const candidates: EmoteCandidate[] = [];
      return {
        found: true,
        platform,
        platformUserId: normalizedId,
        sevenTvUserId,
        candidates,
        status: providerStatus('7tv', 'channel', candidates),
      };
    }

    const result = await load(`${API}/emote-sets/${encodeURIComponent(emoteSetId)}`, 'channel', options);
    return {
      ...result,
      found: true,
      platform,
      platformUserId: normalizedId,
      sevenTvUserId,
      emoteSetId,
    };
  } catch (error) {
    const candidates: EmoteCandidate[] = [];
    if (error instanceof HttpError && error.status === 404) {
      return {
        found: false,
        platform,
        platformUserId: normalizedId,
        candidates,
        status: providerStatus('7tv', 'channel', candidates),
      };
    }
    return {
      found: false,
      platform,
      platformUserId: normalizedId,
      candidates,
      status: providerStatus('7tv', 'channel', candidates, error),
    };
  }
}

export async function fetchChannelSevenTv(
  channelName: string,
  twitchUserId: string | null,
  options: ProviderOptions = {},
): Promise<ProviderResult> {
  const lookups = twitchUserId ? [twitchUserId, channelName] : [channelName];
  let lastRealError: string | undefined;

  for (const lookup of lookups) {
    const snapshot = await fetchSevenTvChannelSnapshot('twitch', lookup, options);
    if (snapshot.found) return snapshot;
    if (!snapshot.status.ok) lastRealError = snapshot.status.error;
    if (options.signal?.aborted) return snapshot;
  }

  const candidates: EmoteCandidate[] = [];
  if (lastRealError) {
    return { candidates, status: { provider: '7tv', scope: 'channel', ok: false, count: 0, error: lastRealError } };
  }
  return { candidates, status: providerStatus('7tv', 'channel', candidates) };
}

export async function fetchKickChannelSevenTv(
  kickUserId: string,
  options: ProviderOptions = {},
): Promise<ProviderResult> {
  return fetchSevenTvChannelSnapshot('kick', kickUserId, options);
}
