export type EmoteProvider =
  | 'twitch'
  | 'twitch-cheer'
  | 'kick'
  | '7tv'
  | 'bttv'
  | 'ffz'
  | 'custom';

export type EmoteScope = 'native' | 'channel' | 'global' | 'custom';

export interface Emote {
  code: string;
  id: string;
  url: string;
  altUrls?: string[];
  zeroWidth: boolean;
  provider: EmoteProvider;
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
