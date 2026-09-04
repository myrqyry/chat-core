import type { EmoteCandidate, EmoteSet } from '../types/emotes';

const PROVIDER_PRIORITY: Record<EmoteCandidate['provider'], number> = {
  custom: 100,
  twitch: 90,
  'twitch-cheer': 90,
  kick: 90,
  '7tv': 70,
  bttv: 60,
  ffz: 50,
};

const SCOPE_PRIORITY: Record<EmoteCandidate['scope'], number> = {
  custom: 40,
  native: 30,
  channel: 20,
  global: 10,
};

const isValidUrl = (url: string): boolean => {
  if (typeof url !== 'string' || !url) return false;
  if (/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(url)) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

export const mergeCandidates = (candidates: EmoteCandidate[]): EmoteSet => {
  const result: EmoteSet = {};
  const winners = new Map<string, number>();

  for (const candidate of candidates) {
    if (!candidate.code || !isValidUrl(candidate.url)) continue;
    const score = PROVIDER_PRIORITY[candidate.provider] + SCOPE_PRIORITY[candidate.scope];
    const previousScore = winners.get(candidate.code);
    if (previousScore !== undefined && previousScore >= score) continue;

    const { scope: _scope, ...emote } = candidate;
    result[candidate.code] = emote;
    winners.set(candidate.code, score);
  }

  return result;
};
