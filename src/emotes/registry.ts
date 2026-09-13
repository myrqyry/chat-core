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

const sevenTvOverrides = (sevenTv: EmoteCandidate, other: EmoteCandidate): boolean => {
  if (sevenTv.provider !== '7tv') return false;
  const overrides = sevenTv.overrides;
  if (!overrides) return false;

  if (other.provider === 'twitch') {
    if (other.scope === 'global') return overrides.twitchGlobal === true;
    if (other.scope === 'channel' || other.scope === 'user') return overrides.twitchSubscriber === true;
    return false;
  }
  if (other.provider === 'bttv') return overrides.betterTtv === true;
  if (other.provider === 'ffz') return overrides.frankerFaceZ === true;
  return false;
};

const candidateWins = (
  candidate: EmoteCandidate,
  previous: EmoteCandidate,
  providerPriority: Record<EmoteProvider, number>,
  scopePriority: Record<EmoteScope, number>,
): boolean => {
  if (sevenTvOverrides(candidate, previous)) return true;
  if (sevenTvOverrides(previous, candidate)) return false;

  const score = providerPriority[candidate.provider] + scopePriority[candidate.scope];
  const previousScore = providerPriority[previous.provider] + scopePriority[previous.scope];
  return score > previousScore;
};

export const mergeCandidates = (
  candidates: EmoteCandidate[],
  options: MergeCandidatesOptions = {},
): EmoteSet => {
  const providerPriority = { ...DEFAULT_PROVIDER_PRIORITY, ...options.providerPriority };
  const scopePriority = { ...DEFAULT_SCOPE_PRIORITY, ...options.scopePriority };
  const result: EmoteSet = {};
  const winners = new Map<string, EmoteCandidate>();

  for (const candidate of candidates) {
    if (!candidate.code || !isValidUrl(candidate.url)) continue;
    const previous = winners.get(candidate.code);
    if (previous && !candidateWins(candidate, previous, providerPriority, scopePriority)) continue;

    const { scope: _scope, ...emote } = candidate;
    result[candidate.code] = emote;
    winners.set(candidate.code, candidate);
  }

  return result;
};
