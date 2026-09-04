import type { EmoteCandidate } from '../types/emotes';
import type { ProviderOptions, ProviderResult } from '../types/providers';
import { fetchJson } from '../network/fetch';
import { providerStatus } from '../types/providers';

interface BttvEmote { id?: string; code?: string; }
interface BttvResponse { channelEmotes?: BttvEmote[]; sharedEmotes?: BttvEmote[]; }

const candidatesFrom = (emotes: BttvEmote[], scope: 'channel' | 'global'): EmoteCandidate[] =>
  emotes.flatMap((emote) => emote.id && emote.code ? [{
    id: emote.id,
    code: emote.code,
    url: `https://cdn.betterttv.net/emote/${emote.id}/3x`,
    zeroWidth: false,
    provider: 'bttv' as const,
    scope,
  }] : []);

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
    return { candidates: [], status: providerStatus('bttv', 'channel', [], error) };
  }
}
