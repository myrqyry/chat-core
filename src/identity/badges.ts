import { fetchJson } from '../network/fetch';
import type { Badge, BadgeImage, BadgeRef, EnrichmentResult, IdentityFetchOptions } from '../types/identity';

export const IDENTITY_BADGE_CACHE_MS = 15 * 60 * 1000;

export interface TwitchBadgeApiOptions extends IdentityFetchOptions {
  clientId: string;
  accessToken: string;
}

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

interface TwitchBadgeVersion {
  id?: string;
  image_url_1x?: string;
  image_url_2x?: string;
  image_url_4x?: string;
  title?: string;
  description?: string;
}

interface TwitchBadgeSet {
  set_id?: string;
  versions?: TwitchBadgeVersion[];
}

interface TwitchBadgeResponse {
  data?: TwitchBadgeSet[];
}

interface BttvBadgeRow {
  id?: string;
  name?: string;
  providerId?: string;
  badge?: { description?: string; svg?: string };
}

interface FfzBadgeRow {
  id?: number;
  name?: string;
  title?: string;
  slot?: number;
  replaces?: string;
  color?: string;
  urls?: Record<string, string>;
}

interface FfzBadgesResponse {
  badges?: FfzBadgeRow[];
  users?: Record<string, string[]>;
}

let bttvCache: CacheEntry<BttvBadgeRow[]> | null = null;
let ffzCache: CacheEntry<FfzBadgesResponse> | null = null;
const twitchCache = new Map<string, CacheEntry<Badge[]>>();

const errorMessage = (error: unknown): string => error instanceof Error ? error.message : 'Badge lookup failed';
const normalizeUrl = (url: string): string => url.startsWith('//') ? `https:${url}` : url;
const ttlFor = (options: IdentityFetchOptions): number => options.cacheTtlMs ?? IDENTITY_BADGE_CACHE_MS;
const fresh = <T>(entry: CacheEntry<T> | null | undefined): entry is CacheEntry<T> => !!entry && entry.expiresAt > Date.now();

const imagesFromUrls = (urls: Record<string, string> | undefined): BadgeImage[] =>
  Object.entries(urls ?? {})
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([scale, url]) => ({ url: normalizeUrl(url), scale: Number(scale) || undefined }));

const twitchImages = (version: TwitchBadgeVersion): BadgeImage[] => {
  const images: BadgeImage[] = [];
  if (version.image_url_1x) images.push({ url: version.image_url_1x, scale: 1 });
  if (version.image_url_2x) images.push({ url: version.image_url_2x, scale: 2 });
  if (version.image_url_4x) images.push({ url: version.image_url_4x, scale: 4 });
  return images;
};

export function clearBadgeCaches(): void {
  bttvCache = null;
  ffzCache = null;
  twitchCache.clear();
}

export function parseTwitchBadgeRefs(
  badges: Record<string, string> | null | undefined,
  badgeInfo: Record<string, string> | null | undefined = undefined,
): BadgeRef[] {
  return Object.entries(badges ?? {}).map(([id, version]) => ({
    id,
    version,
    provider: 'twitch' as const,
    ...(badgeInfo?.[id] ? { info: badgeInfo[id] } : {}),
  }));
}

export function resolveBadgeRefs(refs: BadgeRef[], catalog: Badge[]): Badge[] {
  return refs.flatMap((ref) => {
    const badge = catalog.find((candidate) =>
      candidate.provider === ref.provider &&
      candidate.id === ref.id &&
      (ref.version === undefined || candidate.version === undefined || candidate.version === ref.version));
    return badge ? [badge] : [];
  });
}

export function mergeBadges(...groups: Badge[][]): Badge[] {
  const merged: Badge[] = [];

  for (const badge of groups.flat()) {
    if (badge.replaces) {
      const replacementIndex = merged.findIndex((existing) => existing.id === badge.replaces);
      if (replacementIndex >= 0) {
        merged[replacementIndex] = badge;
        continue;
      }
    }

    if (!merged.some((existing) => existing.provider === badge.provider && existing.id === badge.id)) {
      merged.push(badge);
    }
  }

  return merged.sort((a, b) => (a.slot ?? Number.MAX_SAFE_INTEGER) - (b.slot ?? Number.MAX_SAFE_INTEGER));
}

async function fetchTwitchBadgesDetailed(
  url: string,
  scope: 'global' | 'channel',
  options: TwitchBadgeApiOptions,
): Promise<EnrichmentResult<Badge[]>> {
  const cached = twitchCache.get(url);
  if (!options.bypassCache && fresh(cached)) return { value: cached.value, ok: true };

  try {
    const data = await fetchJson<TwitchBadgeResponse>(url, {
      signal: options.signal,
      headers: {
        'Client-Id': options.clientId,
        Authorization: `Bearer ${options.accessToken}`,
      },
    });
    const badges = (data.data ?? []).flatMap((set): Badge[] => (set.versions ?? []).flatMap((version) => {
      const images = twitchImages(version);
      if (!set.set_id || !version.id || images.length === 0) return [];
      return [{
        id: set.set_id,
        version: version.id,
        provider: 'twitch',
        scope,
        title: version.title,
        tooltip: version.description,
        images,
        raw: version,
      }];
    }));
    const ttl = ttlFor(options);
    if (ttl > 0) twitchCache.set(url, { value: badges, expiresAt: Date.now() + ttl });
    return { value: badges, ok: true };
  } catch (error) {
    return { value: null, ok: false, error: errorMessage(error) };
  }
}

export const fetchTwitchGlobalBadgesDetailed = (
  options: TwitchBadgeApiOptions,
): Promise<EnrichmentResult<Badge[]>> =>
  fetchTwitchBadgesDetailed('https://api.twitch.tv/helix/chat/badges/global', 'global', options);

export const fetchTwitchChannelBadgesDetailed = (
  broadcasterId: string,
  options: TwitchBadgeApiOptions,
): Promise<EnrichmentResult<Badge[]>> =>
  fetchTwitchBadgesDetailed(
    `https://api.twitch.tv/helix/chat/badges?broadcaster_id=${encodeURIComponent(broadcasterId)}`,
    'channel',
    options,
  );

async function loadBttvBadges(options: IdentityFetchOptions): Promise<BttvBadgeRow[]> {
  if (!options.bypassCache && fresh(bttvCache)) return bttvCache.value;
  const rows = await fetchJson<BttvBadgeRow[]>('https://api.betterttv.net/3/cached/badges', { signal: options.signal });
  const ttl = ttlFor(options);
  if (ttl > 0) bttvCache = { value: rows, expiresAt: Date.now() + ttl };
  return rows;
}

export async function fetchBttvBadgesForUserDetailed(
  username: string,
  options: IdentityFetchOptions = {},
): Promise<EnrichmentResult<Badge[]>> {
  try {
    const rows = await loadBttvBadges(options);
    const wanted = username.toLocaleLowerCase();
    const badges = rows
      .filter((row) => row.name?.toLocaleLowerCase() === wanted && row.badge?.svg)
      .map((row): Badge => ({
        id: row.id ?? row.providerId ?? 'badge',
        provider: 'bttv',
        scope: 'user',
        title: row.badge?.description,
        images: [{ url: normalizeUrl(row.badge!.svg!) }],
        raw: row,
      }));
    return { value: badges, ok: true };
  } catch (error) {
    return { value: null, ok: false, error: errorMessage(error) };
  }
}

export async function fetchBttvBadgesForUser(
  username: string,
  options: IdentityFetchOptions = {},
): Promise<Badge[]> {
  return (await fetchBttvBadgesForUserDetailed(username, options)).value ?? [];
}

async function loadFfzBadges(options: IdentityFetchOptions): Promise<FfzBadgesResponse> {
  if (!options.bypassCache && fresh(ffzCache)) return ffzCache.value;
  const data = await fetchJson<FfzBadgesResponse>('https://api.frankerfacez.com/v1/badges', { signal: options.signal });
  const ttl = ttlFor(options);
  if (ttl > 0) ffzCache = { value: data, expiresAt: Date.now() + ttl };
  return data;
}

export async function fetchFfzBadgesForUserDetailed(
  username: string,
  options: IdentityFetchOptions = {},
): Promise<EnrichmentResult<Badge[]>> {
  try {
    const data = await loadFfzBadges(options);
    const wanted = username.toLocaleLowerCase();
    const badges = Object.entries(data.users ?? {}).flatMap(([badgeId, users]): Badge[] => {
      if (!users.some((user) => user.toLocaleLowerCase() === wanted)) return [];
      const row = (data.badges ?? []).find((badge) => String(badge.id) === badgeId);
      if (!row) return [];
      const images = imagesFromUrls(row.urls);
      if (images.length === 0) return [];
      return [{
        id: badgeId,
        provider: 'ffz',
        scope: 'user',
        name: row.name,
        title: row.title,
        images,
        slot: row.slot,
        ...(row.replaces ? { replaces: row.replaces } : {}),
        ...(row.color ? { color: row.color } : {}),
        raw: row,
      }];
    });
    return { value: badges, ok: true };
  } catch (error) {
    return { value: null, ok: false, error: errorMessage(error) };
  }
}

export async function fetchFfzBadgesForUser(
  username: string,
  options: IdentityFetchOptions = {},
): Promise<Badge[]> {
  return (await fetchFfzBadgesForUserDetailed(username, options)).value ?? [];
}
