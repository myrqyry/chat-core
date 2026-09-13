import { fetchWithTimeout } from '../../network/fetch';
import type { Emote, EmoteImage } from '../../types/emotes';
import type {
  TwitchAuth,
  TwitchCheermoteDefinition,
  TwitchCheermoteSet,
  TwitchCheermoteTier,
} from './types';

export const TWITCH_CHEERMOTE_CACHE_MS = 10 * 60 * 1000;

const cache = new Map<string, { expiresAt: number; value: TwitchCheermoteSet }>();
const SIZE_ORDER = ['4', '3', '2', '1.5', '1'];

const cacheKey = (broadcasterUserId?: string): string => broadcasterUserId || 'global';

const responseError = async (response: Response): Promise<Error> => {
  let detail = '';
  try {
    const body = await response.json() as { message?: string };
    detail = body.message ? `: ${body.message}` : '';
  } catch {
    // Ignore non-JSON bodies.
  }
  return new Error(`Twitch Cheermotes request failed with ${response.status}${detail}`);
};

export function clearTwitchCheermoteCache(broadcasterUserId?: string): void {
  if (broadcasterUserId) cache.delete(cacheKey(broadcasterUserId));
  else cache.clear();
}

export async function fetchTwitchCheermotes(
  auth: TwitchAuth,
  broadcasterUserId?: string,
  signal?: AbortSignal,
): Promise<TwitchCheermoteSet> {
  const key = cacheKey(broadcasterUserId);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const url = new URL('https://api.twitch.tv/helix/bits/cheermotes');
  if (broadcasterUserId) url.searchParams.set('broadcaster_id', broadcasterUserId);
  const response = await fetchWithTimeout(url.toString(), {
    headers: {
      'Client-Id': auth.clientId,
      Authorization: `Bearer ${auth.accessToken}`,
    },
    signal,
  });
  if (!response.ok) throw await responseError(response);

  const body = await response.json() as { data?: TwitchCheermoteDefinition[] };
  const result: TwitchCheermoteSet = {};
  for (const definition of body.data ?? []) {
    if (!definition.prefix || !Array.isArray(definition.tiers)) continue;
    result[definition.prefix.toLowerCase()] = definition;
  }
  cache.set(key, { expiresAt: Date.now() + TWITCH_CHEERMOTE_CACHE_MS, value: result });
  return result;
}

const urlsForTier = (tier: TwitchCheermoteTier): { primary?: string; staticUrl?: string; images: EmoteImage[] } => {
  const themeOrder = ['dark', 'light'] as const;
  const firstUrl = (kind: 'animated' | 'static'): string | undefined => {
    for (const theme of themeOrder) {
      const variants = tier.images?.[theme]?.[kind];
      const url = SIZE_ORDER.map((size) => variants?.[size]).find(Boolean);
      if (url) return url;
    }
    return undefined;
  };

  const animatedUrl = firstUrl('animated');
  const staticUrl = firstUrl('static');
  const images: EmoteImage[] = [];

  for (const theme of themeOrder) {
    const themed = tier.images?.[theme];
    for (const size of SIZE_ORDER) {
      const animatedCandidate = themed?.animated?.[size];
      if (animatedCandidate) {
        images.push({ url: animatedCandidate, scale: Number(size), format: 'gif', animated: true, theme });
      }
      const staticCandidate = themed?.static?.[size];
      if (staticCandidate) {
        images.push({ url: staticCandidate, scale: Number(size), format: 'png', animated: false, theme });
      }
    }
  }

  return { primary: animatedUrl ?? staticUrl, staticUrl, images };
};

const tierFor = (
  definition: TwitchCheermoteDefinition,
  tierValue: number | undefined,
  bits: number,
): TwitchCheermoteTier | undefined => {
  const exact = tierValue === undefined
    ? undefined
    : definition.tiers.find((tier) => tier.min_bits === tierValue || Number(tier.id) === tierValue);
  if (exact) return exact;
  return [...definition.tiers]
    .sort((a, b) => b.min_bits - a.min_bits)
    .find((tier) => bits >= tier.min_bits);
};

export function resolveTwitchCheermote(
  cheermotes: TwitchCheermoteSet | undefined,
  prefix: string | undefined,
  tierValue: number | undefined,
  bits: number,
  text?: string,
): Emote | undefined {
  if (!cheermotes || !prefix) return undefined;
  const definition = cheermotes[prefix.toLowerCase()];
  if (!definition) return undefined;
  const tier = tierFor(definition, tierValue, bits);
  if (!tier) return undefined;
  const assets = urlsForTier(tier);
  if (!assets.primary) return undefined;

  return {
    id: `${definition.prefix}:${tier.id}`,
    code: text ?? `${definition.prefix}${bits}`,
    url: assets.primary,
    altUrls: assets.images.map((image) => image.url).filter((url) => url !== assets.primary),
    zeroWidth: false,
    provider: 'twitch-cheer',
    animated: assets.primary !== assets.staticUrl,
    images: assets.images,
    raw: { definition, tier },
  };
}
