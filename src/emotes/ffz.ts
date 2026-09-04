import type { EmoteCandidate } from '../types/emotes';
import type { ProviderOptions, ProviderResult } from '../types/providers';
import { fetchJson } from '../network/fetch';
import { providerStatus } from '../types/providers';

interface FfzEmote { id?: number; name?: string; urls?: Record<string, string>; }
interface FfzSet { emoticons?: FfzEmote[]; }
interface FfzResponse { sets?: Record<string, FfzSet>; }

const candidatesFrom = (data: FfzResponse, scope: 'channel' | 'global'): EmoteCandidate[] =>
  Object.values(data.sets ?? {}).flatMap((set) => (set.emoticons ?? []).flatMap((emote) => {
    const id = emote.id;
    const code = emote.name;
    const rawUrl = id != null ? emote.urls?.['4'] ?? emote.urls?.['2'] ?? emote.urls?.['1'] : undefined;
    if (id == null || !code || !rawUrl) return [];
    return [{
      id: String(id),
      code,
      url: rawUrl.startsWith('//') ? `https:${rawUrl}` : rawUrl,
      zeroWidth: false,
      provider: 'ffz' as const,
      scope,
    }];
  }));

async function load(url: string, scope: 'channel' | 'global', options: ProviderOptions): Promise<ProviderResult> {
  try {
    const candidates = candidatesFrom(await fetchJson<FfzResponse>(url, { signal: options.signal }), scope);
    return { candidates, status: providerStatus('ffz', scope, candidates) };
  } catch (error) {
    return { candidates: [], status: providerStatus('ffz', scope, [], error) };
  }
}

export const fetchGlobalFfz = (options: ProviderOptions = {}): Promise<ProviderResult> =>
  load('https://api.frankerfacez.com/v1/set/global', 'global', options);

export const fetchChannelFfz = (channelName: string, options: ProviderOptions = {}): Promise<ProviderResult> =>
  load(`https://api.frankerfacez.com/v1/room/${encodeURIComponent(channelName)}`, 'channel', options);
