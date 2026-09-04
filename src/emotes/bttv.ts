import type { EmoteCandidate, EmoteImage } from '../types/emotes';
import type { ProviderOptions, ProviderResult } from '../types/providers';
import { fetchJson, HttpError } from '../network/fetch';
import { providerStatus } from '../types/providers';

interface BttvEmote {
  id?: string;
  code?: string;
  animated?: boolean;
  imageType?: string;
  user?: { name?: string };
}
interface BttvResponse { channelEmotes?: BttvEmote[]; sharedEmotes?: BttvEmote[]; }

const imagesFrom = (emote: BttvEmote): EmoteImage[] => [1, 2, 3].map((scale) => ({
  url: `https://cdn.betterttv.net/emote/${emote.id}/${scale}x`,
  scale,
  format: emote.imageType,
  animated: emote.animated ?? emote.imageType === 'gif',
}));

const candidatesFrom = (emotes: BttvEmote[], scope: 'channel' | 'global'): EmoteCandidate[] =>
  emotes.flatMap((emote) => {
    if (!emote.id || !emote.code) return [];
    const images = imagesFrom(emote);
    return [{
      id: emote.id,
      code: emote.code,
      url: images[2].url,
      altUrls: images.slice(0, 2).map((image) => image.url),
      zeroWidth: false,
      provider: 'bttv' as const,
      scope,
      animated: emote.animated ?? emote.imageType === 'gif',
      ownerName: emote.user?.name,
      images,
      raw: emote,
    }];
  });

export async function fetchGlobalBttv(options: ProviderOptions = {}): Promise<ProviderResult> {
  try {
    const data = await fetchJson<BttvEmote[]>('https://api.betterttv.net/3/cached/emotes/global', { signal: options.signal });
    const candidates = candidatesFrom(data, 'global');
    return { candidates, status: providerStatus('bttv', 'global', candidates) };
  } catch (error) {
    return { candidates: [], status: providerStatus('bttv', 'global', [], error) };
  }
}

export async function fetchChannelBttv(twitchUserId: string | null, options: ProviderOptions = {}): Promise<ProviderResult> {
  if (!twitchUserId) return { candidates: [], status: providerStatus('bttv', 'channel', []) };
  try {
    const data = await fetchJson<BttvResponse>(`https://api.betterttv.net/3/cached/users/twitch/${encodeURIComponent(twitchUserId)}`, { signal: options.signal });
    const candidates = candidatesFrom([...(data.channelEmotes ?? []), ...(data.sharedEmotes ?? [])], 'channel');
    return { candidates, status: providerStatus('bttv', 'channel', candidates) };
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      return { candidates: [], status: providerStatus('bttv', 'channel', []) };
    }
    return { candidates: [], status: providerStatus('bttv', 'channel', [], error) };
  }
}
