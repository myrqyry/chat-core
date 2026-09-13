import { appendMessageFragments, parseMessageFragments } from '../../messages/parse';
import type { ChatFragment } from '../../types/chat';
import type { Emote, EmoteSet } from '../../types/emotes';
import { resolveTwitchCheermote } from './cheermotes';
import type {
  TwitchCheermoteSet,
  TwitchMessageFragmentPayload,
  TwitchNormalizedMessage,
} from './types';

const TWITCH_CDN = 'https://static-cdn.jtvnw.net/emoticons/v2';

const twitchEmote = (
  id: string,
  code: string,
  formats: string[] | undefined,
): Emote => {
  const animated = formats?.includes('animated') ?? false;
  const format = animated ? 'animated' : 'static';
  const url = `${TWITCH_CDN}/${encodeURIComponent(id)}/${format}/dark/3.0`;
  return {
    id,
    code,
    provider: 'twitch',
    zeroWidth: false,
    animated,
    url,
    altUrls: [
      `${TWITCH_CDN}/${encodeURIComponent(id)}/${format}/dark/2.0`,
      `${TWITCH_CDN}/${encodeURIComponent(id)}/${format}/dark/1.0`,
    ],
  };
};

const appendTwitchFragment = (
  fragment: TwitchMessageFragmentPayload,
  emotes: EmoteSet,
  cheermotes: TwitchCheermoteSet | undefined,
  normalized: ChatFragment[],
): void => {
  if (fragment.type === 'emote' && fragment.emote?.id) {
    normalized.push({
      type: 'emote',
      text: fragment.text,
      emote: twitchEmote(fragment.emote.id, fragment.text, fragment.emote.format),
      overlays: [],
      modifiers: [],
    });
    return;
  }

  if (fragment.type === 'mention' && fragment.mention) {
    normalized.push({
      type: 'mention',
      text: fragment.text,
      username: fragment.mention.user_login ?? fragment.mention.user_name,
      userId: fragment.mention.user_id,
    });
    return;
  }

  if (fragment.type === 'cheermote' && fragment.cheermote) {
    const bits = fragment.cheermote.bits ?? 0;
    normalized.push({
      type: 'cheermote',
      text: fragment.text,
      bits,
      prefix: fragment.cheermote.prefix,
      tier: fragment.cheermote.tier,
      emote: resolveTwitchCheermote(
        cheermotes,
        fragment.cheermote.prefix,
        fragment.cheermote.tier,
        bits,
        fragment.text,
      ),
    });
    return;
  }

  if (fragment.type === 'gif' && fragment.gif?.url) {
    normalized.push({
      type: 'media',
      text: fragment.text,
      mediaType: 'gif',
      id: fragment.gif.id,
      url: fragment.gif.url,
      alt: fragment.text || undefined,
      raw: fragment,
    });
    return;
  }

  if (fragment.type === 'gif' && fragment.gif) {
    normalized.push({ type: 'unknown', text: fragment.text, raw: fragment });
    return;
  }

  appendMessageFragments(fragment.text, normalized, { emotes });
};

export function normalizeTwitchMessageFragments(
  text: string,
  fragments: TwitchMessageFragmentPayload[] | undefined,
  emotes: EmoteSet = {},
  cheermotes?: TwitchCheermoteSet,
): TwitchNormalizedMessage {
  if (!fragments?.length) {
    return { text, fragments: parseMessageFragments(text, { emotes }) };
  }

  const normalized: ChatFragment[] = [];
  for (const fragment of fragments) appendTwitchFragment(fragment, emotes, cheermotes, normalized);
  return { text, fragments: normalized };
}

export function isTwitchMessageEmoteOnly(fragments: ChatFragment[]): boolean {
  let hasEmote = false;
  for (const fragment of fragments) {
    if (fragment.type === 'emote') {
      hasEmote = true;
      continue;
    }
    if (fragment.type === 'modifier') continue;
    if (fragment.type === 'text' && /^\s*$/u.test(fragment.text)) continue;
    return false;
  }
  return hasEmote;
}
