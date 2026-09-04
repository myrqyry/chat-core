import type { ChatFragment, EmoteFragment, NativeEmoteSpan, ParseMessageOptions } from '../types/chat';
import type { Emote, EmoteSet } from '../types/emotes';

const TWITCH_CDN = 'https://static-cdn.jtvnw.net/emoticons/v2';
const tokenPattern = /\S+/gu;

const twitchEmote = (id: string, code: string): Emote => ({
  id,
  code,
  provider: 'twitch',
  zeroWidth: false,
  url: `${TWITCH_CDN}/${encodeURIComponent(id)}/default/dark/3.0`,
  altUrls: [
    `${TWITCH_CDN}/${encodeURIComponent(id)}/default/dark/2.0`,
    `${TWITCH_CDN}/${encodeURIComponent(id)}/default/dark/1.0`,
  ],
});

const pushText = (fragments: ChatFragment[], text: string): void => {
  if (!text) return;
  const previous = fragments.at(-1);
  if (previous?.type === 'text') previous.text += text;
  else fragments.push({ type: 'text', text });
};

const previousBaseEmote = (fragments: ChatFragment[]): { fragment: EmoteFragment; separated: boolean } | null => {
  let baseIndex = fragments.length - 1;
  const trailing = fragments[baseIndex];
  const separated = trailing?.type === 'text' && /^\s+$/u.test(trailing.text);
  if (separated) baseIndex -= 1;
  const base = fragments[baseIndex];
  return base?.type === 'emote' ? { fragment: base, separated } : null;
};

const appendEmote = (fragments: ChatFragment[], text: string, emote: Emote): void => {
  if (emote.modifier === 'overlay' || emote.modifier === 'hidden' || emote.zeroWidth) {
    const base = previousBaseEmote(fragments);
    if (base) {
      if (base.separated) fragments.pop();
      if (emote.modifier === 'hidden') base.fragment.modifiers.push(emote);
      else base.fragment.overlays.push(emote);
      return;
    }
    if (emote.modifier === 'hidden') {
      fragments.push({ type: 'modifier', text, emote });
      return;
    }
  }

  const fragment: EmoteFragment = { type: 'emote', text, emote, overlays: [], modifiers: [] };
  fragments.push(fragment);
};

const parsePlainRange = (text: string, emotes: EmoteSet, fragments: ChatFragment[]): void => {
  tokenPattern.lastIndex = 0;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(text)) !== null) {
    if (match.index > cursor) pushText(fragments, text.slice(cursor, match.index));
    const token = match[0];
    const emote = emotes[token];
    if (emote) appendEmote(fragments, token, emote);
    else pushText(fragments, token);
    cursor = match.index + token.length;
  }

  if (cursor < text.length) pushText(fragments, text.slice(cursor));
};

export function twitchEmoteSpansFromTag(
  positions: Record<string, string[]> | null | undefined,
): NativeEmoteSpan[] {
  if (!positions) return [];
  const spans: NativeEmoteSpan[] = [];

  for (const [id, ranges] of Object.entries(positions)) {
    for (const range of ranges) {
      const [startText, endText] = range.split('-');
      const start = Number(startText);
      const end = Number(endText);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) continue;
      spans.push({ id, start, end, provider: 'twitch' });
    }
  }

  return spans.sort((a, b) => a.start - b.start || a.end - b.end);
}

export function parseMessageFragments(
  text: string,
  options: ParseMessageOptions = {},
): ChatFragment[] {
  const emotes = options.emotes ?? {};
  const nativeSpans = [...(options.nativeEmotes ?? [])]
    .filter((span) => span.start >= 0 && span.end >= span.start && span.start < text.length)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const fragments: ChatFragment[] = [];
  let cursor = 0;

  for (const span of nativeSpans) {
    if (span.start < cursor) continue;
    if (span.start > cursor) parsePlainRange(text.slice(cursor, span.start), emotes, fragments);

    const end = Math.min(span.end, text.length - 1);
    const code = text.slice(span.start, end + 1);
    const emote = span.emote ?? (span.provider && span.provider !== 'twitch'
      ? emotes[code]
      : twitchEmote(span.id, code));

    if (emote) appendEmote(fragments, code, emote);
    else pushText(fragments, code);
    cursor = end + 1;
  }

  if (cursor < text.length) parsePlainRange(text.slice(cursor), emotes, fragments);
  return fragments;
}
