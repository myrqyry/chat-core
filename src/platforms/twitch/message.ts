import { parseMessageFragments } from '../../messages/parse';
import type { ChatFragment } from '../../types/chat';
import type { Emote, EmoteSet } from '../../types/emotes';
import type { TwitchMessageFragmentPayload, TwitchNormalizedMessage } from './types';

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

const fragmentFromTwitch = (
  fragment: TwitchMessageFragmentPayload,
  emotes: EmoteSet,
): ChatFragment[] => {
  if (fragment.type === 'emote' && fragment.emote?.id) {
    return [{
      type: 'emote',
      text: fragment.text,
      emote: twitchEmote(fragment.emote.id, fragment.text, fragment.emote.format),
      overlays: [],
      modifiers: [],
    }];
  }

  if (fragment.type === 'mention' && fragment.mention) {
    return [{
      type: 'mention',
      text: fragment.text,
      username: fragment.mention.user_login ?? fragment.mention.user_name,
      userId: fragment.mention.user_id,
    }];
  }

  if (fragment.type === 'cheermote' && fragment.cheermote) {
    return [{
      type: 'cheermote',
      text: fragment.text,
      bits: fragment.cheermote.bits ?? 0,
      prefix: fragment.cheermote.prefix,
      tier: fragment.cheermote.tier,
    }];
  }

  if (fragment.type === 'gif' && fragment.gif) {
    return [{ type: 'unknown', text: fragment.text, raw: fragment }];
  }

  return parseMessageFragments(fragment.text, { emotes });
};

export function normalizeTwitchMessageFragments(
  text: string,
  fragments: TwitchMessageFragmentPayload[] | undefined,
  emotes: EmoteSet = {},
): TwitchNormalizedMessage {
  if (!fragments?.length) {
    return { text, fragments: parseMessageFragments(text, { emotes }) };
  }

  const normalized = fragments.flatMap((fragment) => fragmentFromTwitch(fragment, emotes));
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
