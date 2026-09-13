export type {
  Emote,
  EmoteCandidate,
  EmoteFetchOptions,
  EmoteFetchResult,
  EmoteImage,
  EmoteModifier,
  EmoteProvider,
  EmoteScope,
  EmoteSet,
  MergeCandidatesOptions,
  ProviderStatus,
} from './types/emotes';
export type {
  Badge,
  BadgeImage,
  BadgeProvider,
  BadgeRef,
  BadgeScope,
  EnrichmentResult,
  IdentityFetchOptions,
  NamePaint,
  NamePaintGradient,
  NamePaintShadow,
  NamePaintStop,
  UserCosmetics,
} from './types/identity';
export type {
  ChatConnectionState,
  ChatEvent,
  ChatEventOrigin,
  ChatEventType,
  ChatFragment,
  ChatMessage,
  ChatMessageReply,
  ChatMessageSource,
  ChatMessageTraits,
  ChatPlatform,
  ChatUser,
  CheermoteFragment,
  EmoteFragment,
  MediaFragment,
  MentionFragment,
  ModifierFragment,
  NativeEmoteSpan,
  ParseMessageOptions,
  TextFragment,
  UnknownFragment,
} from './types/chat';
export { mergeCandidates } from './emotes/registry';
export { parseMessageFragments, twitchEmoteSpansFromTag } from './messages/parse';
export {
  clearBadgeCaches,
  fetchBttvBadgesForUser,
  fetchBttvBadgesForUserDetailed,
  fetchFfzBadgesForUser,
  fetchFfzBadgesForUserDetailed,
  fetchTwitchChannelBadgesDetailed,
  fetchTwitchGlobalBadgesDetailed,
  IDENTITY_BADGE_CACHE_MS,
  mergeBadges,
  parseTwitchBadgeRefs,
  resolveBadgeRefs,
} from './identity/badges';
export type { TwitchBadgeApiOptions } from './identity/badges';
export {
  clearSevenTvUserCosmeticsCache,
  fetchSevenTvUserCosmetics,
  fetchSevenTvUserCosmeticsDetailed,
  SEVEN_TV_COSMETICS_CACHE_MS,
} from './identity/sevenTv';
export { fetchJson, fetchWithTimeout, isAbortError } from './network/fetch';
export { resolveTwitchUserId } from './emotes/twitch';
export {
  fetchChannelSevenTv,
  fetchGlobalSevenTv,
  fetchKickChannelSevenTv,
  fetchSevenTvChannelSnapshot,
  sevenTvCandidateFromActiveEmote,
  sevenTvCandidatesFromActiveEmotes,
} from './emotes/sevenTv';
export type {
  SevenTvActiveEmote,
  SevenTvChannelSnapshot,
  SevenTvPlatform,
} from './emotes/sevenTv';
export { fetchChannelBttv, fetchGlobalBttv } from './emotes/bttv';
export { fetchChannelFfz, fetchGlobalFfz } from './emotes/ffz';
export { fetchChannelEmotes, fetchChannelEmotesDetailed } from './emotes/loader';
export { CACHE_DURATION_MS, clearCachedEmotes } from './emotes/cache';
export type { ProviderOptions, ProviderResult } from './types/providers';

export { resolveKickChannel } from './platforms/kick/channel';
export type { ResolveKickChannelOptions } from './platforms/kick/channel';
export { connectKickChat } from './platforms/kick/connect';
export { kickEmoteUrl, parseKickMessageContent } from './platforms/kick/emotes';
export type { ParsedKickMessageContent } from './platforms/kick/emotes';
export { normalizeKickEvent } from './platforms/kick/normalize';
export { parseKickPusherFrame } from './platforms/kick/protocol';
export { createKickSocket, kickReconnectDelay } from './platforms/kick/socket';
export type {
  KickChannelInfo,
  KickChatConnection,
  KickChatMessagePayload,
  KickConnectOptions,
  KickGiftedSubscriptionsPayload,
  KickMessageDeletedPayload,
  KickNormalizeContext,
  KickPinnedMessagePayload,
  KickPollDeletePayload,
  KickPollUpdatePayload,
  KickProtocolDataByType,
  KickProtocolEvent,
  KickResolvedChannel,
  KickSender,
  KickSenderIdentity,
  KickSocketHandle,
  KickSocketOptions,
  KickStreamHostPayload,
  KickSubscriptionPayload,
  KickUserBannedPayload,
  KickUserUnbannedPayload,
} from './platforms/kick/types';

export {
  applySevenTvEmoteSetDispatch,
  connectSevenTvLive,
  replaceSevenTvChannelCandidates,
} from './seventv/live';
export {
  parseSevenTvDispatch,
  parseSevenTvEventFrame,
  parseSevenTvHello,
  sevenTvSubscribeFrame,
  sevenTvUnsubscribeFrame,
} from './seventv/protocol';
export {
  createSevenTvEventSocket,
  sevenTvReconnectDelay,
  shouldReconnectSevenTv,
} from './seventv/socket';
export type {
  SevenTvChangeField,
  SevenTvChangeMap,
  SevenTvDispatch,
  SevenTvEmoteSetPatchResult,
  SevenTvEventEnvelope,
  SevenTvEventSocketHandle,
  SevenTvEventSocketOptions,
  SevenTvHelloPayload,
  SevenTvLiveConnection,
  SevenTvLiveConnectOptions,
  SevenTvSubscription,
} from './seventv/types';

export {
  resolveTwitchChannel,
  resolveTwitchEventSubAuth,
  validateTwitchUserAccessToken,
} from './platforms/twitch/auth';
export {
  clearTwitchCheermoteCache,
  fetchTwitchCheermotes,
  resolveTwitchCheermote,
  TWITCH_CHEERMOTE_CACHE_MS,
} from './platforms/twitch/cheermotes';
export { connectTwitchChat } from './platforms/twitch/connect';
export {
  isTwitchMessageEmoteOnly,
  normalizeTwitchMessageFragments,
} from './platforms/twitch/message';
export { normalizeTwitchEventSubNotification } from './platforms/twitch/normalize';
export { parseTwitchEventSubFrame } from './platforms/twitch/protocol';
export { createTwitchEventSubSocket, twitchReconnectDelay } from './platforms/twitch/socket';
export {
  createTwitchEventSubSubscription,
  DEFAULT_TWITCH_CHAT_SUBSCRIPTIONS,
  subscribeTwitchChat,
} from './platforms/twitch/subscriptions';
export type {
  TwitchAuth,
  TwitchChatConnection,
  TwitchChatMessagePayload,
  TwitchChatSubscriptionType,
  TwitchCheermoteDefinition,
  TwitchCheermoteImageTheme,
  TwitchCheermoteSet,
  TwitchCheermoteTier,
  TwitchConnectOptions,
  TwitchEventSubEnvelope,
  TwitchEventSubMetadata,
  TwitchEventSubSession,
  TwitchEventSubSocketHandle,
  TwitchEventSubSocketOptions,
  TwitchEventSubSubscription,
  TwitchMessageFragmentPayload,
  TwitchNormalizeContext,
  TwitchNormalizedMessage,
  TwitchResolvedChannel,
  TwitchSubscriptionStateChange,
  TwitchTokenValidation,
} from './platforms/twitch/types';
