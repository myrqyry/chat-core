import type { ChatConnectionState, ChatEvent, ChatFragment } from '../../types/chat';
import type { EmoteSet } from '../../types/emotes';

export type TwitchChatSubscriptionType =
  | 'channel.chat.message'
  | 'channel.chat.message_delete'
  | 'channel.chat.notification'
  | 'channel.chat_settings.update'
  | 'channel.chat.clear'
  | 'channel.chat.clear_user_messages';

export interface TwitchAuth {
  clientId: string;
  accessToken: string;
  userId: string;
  login?: string;
  scopes?: string[];
  expiresIn?: number;
}

export interface TwitchTokenValidation {
  client_id?: string;
  login?: string;
  scopes?: string[];
  user_id?: string;
  expires_in?: number;
}

export interface TwitchResolvedChannel {
  id: string;
  login: string;
  displayName?: string;
}

export interface TwitchEventSubMetadata {
  message_id: string;
  message_type: string;
  message_timestamp: string;
  subscription_type?: string;
  subscription_version?: string;
}

export interface TwitchEventSubSession {
  id: string;
  status?: string;
  connected_at?: string;
  keepalive_timeout_seconds?: number | null;
  reconnect_url?: string | null;
}

export interface TwitchEventSubSubscription {
  id?: string;
  status?: string;
  type: string;
  version?: string;
  condition?: Record<string, unknown>;
  transport?: Record<string, unknown>;
  created_at?: string;
  cost?: number;
}

export interface TwitchEventSubEnvelope {
  metadata: TwitchEventSubMetadata;
  payload: {
    session?: TwitchEventSubSession;
    subscription?: TwitchEventSubSubscription;
    event?: Record<string, unknown>;
  };
}

export interface TwitchMessageFragmentPayload {
  type: string;
  text: string;
  cheermote?: { prefix?: string; bits?: number; tier?: number } | null;
  emote?: {
    id?: string;
    emote_set_id?: string;
    owner_id?: string;
    format?: string[];
  } | null;
  mention?: {
    user_id?: string;
    user_name?: string;
    user_login?: string;
  } | null;
  gif?: {
    id?: string;
    url?: string;
  } | null;
}

export interface TwitchChatMessagePayload {
  broadcaster_user_id: string;
  broadcaster_user_login: string;
  broadcaster_user_name?: string;
  chatter_user_id: string;
  chatter_user_login: string;
  chatter_user_name?: string;
  message_id: string;
  message: {
    text: string;
    fragments?: TwitchMessageFragmentPayload[];
  };
  color?: string;
  badges?: Array<{ set_id?: string; id?: string; info?: string }>;
  message_type?: string;
  cheer?: { bits?: number } | null;
  reply?: {
    parent_message_id?: string;
    parent_message_body?: string;
    parent_user_id?: string;
    parent_user_name?: string;
    parent_user_login?: string;
    thread_message_id?: string;
    thread_user_id?: string;
    thread_user_name?: string;
    thread_user_login?: string;
  } | null;
  channel_points_custom_reward_id?: string | null;
  source_broadcaster_user_id?: string | null;
  source_broadcaster_user_login?: string | null;
  source_broadcaster_user_name?: string | null;
  source_message_id?: string | null;
  source_badges?: Array<{ set_id?: string; id?: string; info?: string }> | null;
  is_source_only?: boolean | null;
}

export interface TwitchNormalizeContext {
  emotes?: EmoteSet;
  now?: () => number;
}

export interface TwitchEventSubSocketOptions {
  url?: string;
  keepaliveGraceMs?: number;
  reconnectBaseDelayMs?: number;
  onWelcome?: (
    session: TwitchEventSubSession,
    context: { isServerReconnect: boolean },
  ) => void | Promise<void>;
  onNotification?: (envelope: TwitchEventSubEnvelope) => void;
  onRevocation?: (envelope: TwitchEventSubEnvelope) => void;
  onError?: (error: Error) => void;
  onStateChange?: (state: ChatConnectionState) => void;
}

export interface TwitchEventSubSocketHandle {
  close: () => void;
}

export interface TwitchConnectOptions {
  channel: string;
  accessToken: string;
  clientId?: string;
  userId?: string;
  broadcasterUserId?: string;
  subscriptions?: TwitchChatSubscriptionType[];
  emotes?: EmoteSet;
  getEmotes?: () => EmoteSet;
  signal?: AbortSignal;
  socket?: Omit<
    TwitchEventSubSocketOptions,
    'onWelcome' | 'onNotification' | 'onRevocation' | 'onError' | 'onStateChange'
  >;
  onEvent: (event: ChatEvent) => void;
  onStateChange?: (state: ChatConnectionState) => void;
  onError?: (error: Error) => void;
}

export interface TwitchChatConnection {
  auth: TwitchAuth;
  channel: TwitchResolvedChannel;
  close: () => void;
}

export interface TwitchNormalizedMessage {
  text: string;
  fragments: ChatFragment[];
}
