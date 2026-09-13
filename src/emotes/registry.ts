import type { EmoteCandidate, EmoteProvider, EmoteScope, EmoteSet, MergeCandidatesOptions } from '../types/emotes';
import { isValidEmoteAssetUrl } from './assets';

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

  // Scope is intentionally lexicographic rather than additive with provider
  // priority. A sender-local or channel emote must not lose to a global emote
  // merely because the global provider has a larger numeric provider score.
  const scopeDelta = scopePriority[candidate.scope] - scopePriority[previous.scope];
  if (scopeDelta !== 0) return scopeDelta > 0;

  const providerDelta = providerPriority[candidate.provider] - providerPriority[previous.provider];
  return providerDelta > 0;
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
    if (!candidate.code || !isValidEmoteAssetUrl(candidate.url)) continue;
    const previous = winners.get(candidate.code);
    if (previous && !candidateWins(candidate, previous, providerPriority, scopePriority)) continue;

    const { scope: _scope, ...emote } = candidate;
    result[candidate.code] = emote;
    winners.set(candidate.code, candidate);
  }

  return result;
};
