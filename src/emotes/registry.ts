import type { EmoteCandidate, EmoteProvider, EmoteScope, EmoteSet, MergeCandidatesOptions } from '../types/emotes';

const DEFAULT_PROVIDER_PRIORITY: Record<EmoteProvider, number> = {
  custom: 100,
  'twitch-cheer': 95,
  twitch: 90,
  kick: 90,
  youtube: 90,
  '7tv': 70,
  bttv: 60,
  ffz: 50,
  emoji: 10,
};

const DEFAULT_SCOPE_PRIORITY: Record<EmoteScope, number> = {
  custom: 50,
  native: 40,
  user: 35,
  channel: 30,
  global: 20,
  emoji: 10,
};

const isValidUrl = (url: string): boolean => {
  if (typeof url !== 'string' || !url) return false;
  if (/^data:image\/(?:png|jpe?g|gif|webp|avif|svg\+xml);base64,[a-z0-9+/=\s]+$/i.test(url)) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

export const mergeCandidates = (
  candidates: EmoteCandidate[],
  options: MergeCandidatesOptions = {},
): EmoteSet => {
  const providerPriority = { ...DEFAULT_PROVIDER_PRIORITY, ...options.providerPriority };
  const scopePriority = { ...DEFAULT_SCOPE_PRIORITY, ...options.scopePriority };
  const result: EmoteSet = {};
  const winners = new Map<string, number>();

  for (const candidate of candidates) {
    if (!candidate.code || !isValidUrl(candidate.url)) continue;
    const score = providerPriority[candidate.provider] + scopePriority[candidate.scope];
    const previousScore = winners.get(candidate.code);
    if (previousScore !== undefined && previousScore >= score) continue;

    const { scope: _scope, ...emote } = candidate;
    result[candidate.code] = emote;
    winners.set(candidate.code, score);
  }

  return result;
};
