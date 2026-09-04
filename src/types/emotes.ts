export type EmoteProvider =
  | 'twitch'
  | 'twitch-cheer'
  | 'kick'
  | 'youtube'
  | '7tv'
  | 'bttv'
  | 'ffz'
  | 'emoji'
  | 'custom';

export type EmoteScope = 'native' | 'user' | 'channel' | 'global' | 'emoji' | 'custom';
export type EmoteModifier = 'overlay' | 'hidden';

export interface EmoteImage {
  url: string;
  width?: number;
  height?: number;
  format?: string;
  scale?: number;
  animated?: boolean;
}

export interface Emote {
  code: string;
  id: string;
  url: string;
  altUrls?: string[];
  zeroWidth: boolean;
  provider: EmoteProvider;
  animated?: boolean;
  ownerName?: string;
  images?: EmoteImage[];
  modifier?: EmoteModifier;
}

export interface EmoteCandidate extends Emote {
  scope: EmoteScope;
}

export type EmoteSet = Record<string, Emote>;

export interface ProviderStatus {
  provider: EmoteProvider;
  scope: 'channel' | 'global';
  ok: boolean;
  count: number;
  error?: string;
}

export interface EmoteFetchResult {
  emotes: EmoteSet;
  providers: ProviderStatus[];
  fromCache: boolean;
  complete: boolean;
}

export interface EmoteFetchOptions {
  bypassCache?: boolean;
  signal?: AbortSignal;
}

export interface MergeCandidatesOptions {
  providerPriority?: Partial<Record<EmoteProvider, number>>;
  scopePriority?: Partial<Record<EmoteScope, number>>;
}
