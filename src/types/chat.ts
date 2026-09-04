import type { Emote, EmoteSet } from './emotes';
import type { Badge, BadgeRef, NamePaint } from './identity';

export type ChatPlatform = 'twitch' | 'kick' | 'youtube' | 'custom';
export type ChatEventOrigin = 'live' | 'replay' | 'test';
export type ChatConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

export interface ChatUser {
  platform: ChatPlatform;
  id?: string;
  username: string;
  displayName?: string;
  color?: string;
  roles?: string[];
  badgeRefs?: BadgeRef[];
  badges?: Badge[];
  namePaint?: NamePaint;
  raw?: unknown;
}

export interface NativeEmoteSpan {
  id: string;
  start: number;
  end: number;
  provider?: Emote['provider'];
  emote?: Emote;
}

export interface TextFragment {
  type: 'text';
  text: string;
}

export interface EmoteFragment {
  type: 'emote';
  text: string;
  emote: Emote;
  overlays: Emote[];
}

export interface MentionFragment {
  type: 'mention';
  text: string;
  username?: string;
  userId?: string;
}

export interface CheermoteFragment {
  type: 'cheermote';
  text: string;
  bits: number;
  prefix?: string;
  tier?: number;
  emote?: Emote;
}

export interface UnknownFragment {
  type: 'unknown';
  text: string;
  raw?: unknown;
}

export type ChatFragment = TextFragment | EmoteFragment | MentionFragment | CheermoteFragment | UnknownFragment;

export interface ChatMessage {
  id: string;
  platform: ChatPlatform;
  channelId?: string;
  channelName?: string;
  user: ChatUser;
  text: string;
  fragments: ChatFragment[];
  timestamp: number;
  replyToMessageId?: string;
  raw?: unknown;
}

export type ChatEventType =
  | 'message'
  | 'message-delete'
  | 'user-timeout'
  | 'user-ban'
  | 'subscription'
  | 'gift-subscription'
  | 'cheer'
  | 'raid'
  | 'reward-redemption'
  | 'room-state'
  | 'stream-online'
  | 'stream-offline'
  | 'system';

export interface ChatEvent<T = unknown> {
  id?: string;
  type: ChatEventType;
  platform: ChatPlatform;
  channelId?: string;
  channelName?: string;
  timestamp: number;
  origin?: ChatEventOrigin;
  user?: ChatUser;
  message?: ChatMessage;
  data?: T;
  raw?: unknown;
}

export interface ParseMessageOptions {
  emotes?: EmoteSet;
  nativeEmotes?: NativeEmoteSpan[];
}
