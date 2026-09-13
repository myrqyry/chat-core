import type { EmoteCandidate, EmoteSet } from '../types/emotes';
import type { ChatConnectionState } from '../types/chat';
import type { SevenTvPlatform } from '../emotes/sevenTv';

export interface SevenTvChangeField {
  key?: string;
  index?: number;
  nested?: boolean;
  old_value?: unknown;
  value?: unknown;
}

export interface SevenTvChangeMap {
  id?: string;
  kind?: number;
  contextual?: boolean;
  actor?: unknown;
  added?: SevenTvChangeField[];
  updated?: SevenTvChangeField[];
  removed?: SevenTvChangeField[];
  pushed?: SevenTvChangeField[];
  pulled?: SevenTvChangeField[];
  [key: string]: unknown;
}

export interface SevenTvDispatch {
  type: string;
  body: SevenTvChangeMap;
}

export interface SevenTvEventEnvelope {
  op: number;
  t?: number;
  d: unknown;
}

export interface SevenTvSubscription {
  type: string;
  condition: Record<string, string>;
}

export interface SevenTvHelloPayload {
  heartbeat_interval: number;
  session_id: string;
  subscription_limit?: number;
}

export interface SevenTvEventSocketOptions {
  url?: string;
  subscriptions?: SevenTvSubscription[];
  reconnectBaseDelayMs?: number;
  maintenanceReconnectDelayMs?: number;
  onDispatch?: (dispatch: SevenTvDispatch, envelope: SevenTvEventEnvelope) => void;
  onStateChange?: (state: ChatConnectionState) => void;
  onError?: (error: Error) => void;
}

export interface SevenTvEventSocketHandle {
  subscribe: (subscription: SevenTvSubscription) => void;
  unsubscribe: (subscription: SevenTvSubscription) => void;
  close: () => void;
}

export interface SevenTvEmoteSetPatchResult {
  emotes: EmoteSet;
  changed: boolean;
  added: string[];
  updated: string[];
  removed: string[];
}

export interface SevenTvLiveConnectOptions {
  platform: SevenTvPlatform;
  platformUserId: string;
  cacheChannelName?: string;
  signal?: AbortSignal;
  onEmoteSetChange?: (
    emotes: EmoteSet,
    info: { reason: 'dispatch' | 'reassigned'; dispatch?: SevenTvDispatch; emoteSetId?: string; candidates: EmoteCandidate[] },
  ) => void;
  onCosmeticsInvalidated?: (dispatch: SevenTvDispatch) => void;
  onStateChange?: (state: ChatConnectionState) => void;
  onError?: (error: Error) => void;
  socket?: Omit<SevenTvEventSocketOptions, 'subscriptions' | 'onDispatch' | 'onStateChange' | 'onError'>;
}

export interface SevenTvLiveConnection {
  platform: SevenTvPlatform;
  platformUserId: string;
  sevenTvUserId?: string;
  emoteSetId?: string;
  emotes: () => EmoteSet;
  candidates: () => EmoteCandidate[];
  close: () => void;
}
