import { fetchJson } from '../../network/fetch';
import { mergeCandidates } from '../../emotes/registry';
import {
  createTwitchNativeEmote,
  TWITCH_EMOTE_CDN_TEMPLATE,
  type TwitchEmoteAssetDescriptor,
  type TwitchEmoteFormat,
  type TwitchEmoteScale,
} from '../../emotes/twitchAssets';
import type { EmoteCandidate, EmoteSet, EmoteTheme } from '../../types/emotes';
import type { TwitchAuth } from './types';

interface TwitchHelixEmote {
  id?: string;
  name?: string;
  tier?: string;
  emote_type?: string;
  emote_set_id?: string;
  owner_id?: string;
  format?: string[];
  scale?: string[];
  theme_mode?: string[];
}

interface TwitchHelixEmoteResponse {
  data?: TwitchHelixEmote[];
  template?: string;
}

export interface TwitchEmoteCatalogEntry extends TwitchEmoteAssetDescriptor {
  name: string;
  scope: 'global' | 'channel';
  formats: TwitchEmoteFormat[];
  scales: TwitchEmoteScale[];
  themes: EmoteTheme[];
  template: string;
  tier?: string;
  emoteType?: string;
  emoteSetId?: string;
  ownerId?: string;
  raw: unknown;
}

export interface TwitchEmoteCatalog {
  global: TwitchEmoteCatalogEntry[];
  channel: TwitchEmoteCatalogEntry[];
  entries: TwitchEmoteCatalogEntry[];
  candidates: EmoteCandidate[];
  emotes: EmoteSet;
}

export interface TwitchEmoteCatalogFetchOptions {
  signal?: AbortSignal;
}

const isFormat = (value: string): value is TwitchEmoteFormat =>
  value === 'static' || value === 'animated';
const isScale = (value: string): value is TwitchEmoteScale =>
  value === '1.0' || value === '2.0' || value === '3.0';
const isTheme = (value: string): value is EmoteTheme => value === 'dark' || value === 'light';

const authHeaders = (auth: Pick<TwitchAuth, 'clientId' | 'accessToken'>): Record<string, string> => ({
  'Client-Id': auth.clientId,
  Authorization: `Bearer ${auth.accessToken}`,
});

const entryFrom = (
  raw: TwitchHelixEmote,
  scope: 'global' | 'channel',
  template: string,
): TwitchEmoteCatalogEntry | null => {
  if (!raw.id || !raw.name) return null;
  const formats = (raw.format ?? []).filter(isFormat);
  const scales = (raw.scale ?? []).filter(isScale);
  const themes = (raw.theme_mode ?? []).filter(isTheme);
  return {
    id: raw.id,
    name: raw.name,
    scope,
    formats: formats.length > 0 ? [...new Set(formats)] : ['static'],
    scales: scales.length > 0 ? [...new Set(scales)] : ['1.0', '2.0', '3.0'],
    themes: themes.length > 0 ? [...new Set(themes)] : ['dark', 'light'],
    template: template || TWITCH_EMOTE_CDN_TEMPLATE,
    tier: raw.tier,
    emoteType: raw.emote_type,
    emoteSetId: raw.emote_set_id,
    ownerId: raw.owner_id,
    raw,
  };
};

const fetchCatalogScope = async (
  url: string,
  scope: 'global' | 'channel',
  auth: Pick<TwitchAuth, 'clientId' | 'accessToken'>,
  options: TwitchEmoteCatalogFetchOptions,
): Promise<TwitchEmoteCatalogEntry[]> => {
  const response = await fetchJson<TwitchHelixEmoteResponse>(url, {
    headers: authHeaders(auth),
    signal: options.signal,
  });
  const template = response.template ?? TWITCH_EMOTE_CDN_TEMPLATE;
  return (response.data ?? []).flatMap((raw) => {
    const entry = entryFrom(raw, scope, template);
    return entry ? [entry] : [];
  });
};

export const twitchCatalogEntryToCandidate = (entry: TwitchEmoteCatalogEntry): EmoteCandidate => ({
  ...createTwitchNativeEmote(entry, entry.name, entry.raw),
  scope: entry.scope,
});

export const fetchTwitchGlobalEmoteCatalog = (
  auth: Pick<TwitchAuth, 'clientId' | 'accessToken'>,
  options: TwitchEmoteCatalogFetchOptions = {},
): Promise<TwitchEmoteCatalogEntry[]> =>
  fetchCatalogScope('https://api.twitch.tv/helix/chat/emotes/global', 'global', auth, options);

export const fetchTwitchChannelEmoteCatalog = (
  broadcasterUserId: string,
  auth: Pick<TwitchAuth, 'clientId' | 'accessToken'>,
  options: TwitchEmoteCatalogFetchOptions = {},
): Promise<TwitchEmoteCatalogEntry[]> => {
  const id = broadcasterUserId.trim();
  if (!id) return Promise.reject(new Error('Twitch broadcaster user ID must not be empty'));
  return fetchCatalogScope(
    `https://api.twitch.tv/helix/chat/emotes?broadcaster_id=${encodeURIComponent(id)}`,
    'channel',
    auth,
    options,
  );
};

export async function fetchTwitchEmoteCatalog(
  auth: Pick<TwitchAuth, 'clientId' | 'accessToken'>,
  broadcasterUserId: string,
  options: TwitchEmoteCatalogFetchOptions = {},
): Promise<TwitchEmoteCatalog> {
  const [global, channel] = await Promise.all([
    fetchTwitchGlobalEmoteCatalog(auth, options),
    fetchTwitchChannelEmoteCatalog(broadcasterUserId, auth, options),
  ]);
  const entries = [...global, ...channel];
  const candidates = entries.map(twitchCatalogEntryToCandidate);
  return {
    global,
    channel,
    entries,
    candidates,
    emotes: mergeCandidates(candidates),
  };
}
