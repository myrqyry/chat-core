import type { NativeEmoteSpan } from '../../types/chat';
import type { Emote } from '../../types/emotes';

const KICK_EMOTE_CDN = 'https://d2egosedh0nm8l.cloudfront.net/emotes';
const markerPattern = /\[emote:(\d+):([^\]]+)\]/gu;

export interface ParsedKickMessageContent {
  text: string;
  nativeEmotes: NativeEmoteSpan[];
}

export const kickEmoteUrl = (id: string): string =>
  `${KICK_EMOTE_CDN}/${encodeURIComponent(id)}/fullsize`;

export function parseKickMessageContent(content: string): ParsedKickMessageContent {
  markerPattern.lastIndex = 0;
  const nativeEmotes: NativeEmoteSpan[] = [];
  let text = '';
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = markerPattern.exec(content)) !== null) {
    text += content.slice(cursor, match.index);

    const id = match[1];
    const code = match[2];
    const start = text.length;
    text += code;
    const end = text.length - 1;
    const url = kickEmoteUrl(id);
    const emote: Emote = {
      id,
      code,
      provider: 'kick',
      zeroWidth: false,
      url,
      images: [{ url }],
      raw: { marker: match[0] },
    };

    nativeEmotes.push({ id, start, end, provider: 'kick', emote });
    cursor = match.index + match[0].length;
  }

  text += content.slice(cursor);
  return { text, nativeEmotes };
}
