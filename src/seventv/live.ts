import type { Emote, EmoteCandidate, EmoteSet } from '../types/emotes';
import {
  fetchSevenTvChannelSnapshot,
  sevenTvCandidateFromActiveEmote,
  type SevenTvActiveEmote,
} from '../emotes/sevenTv';
import { clearSevenTvUserCosmeticsCache } from '../identity/sevenTv';
import { clearCachedEmotes } from '../emotes/cache';
import { createSevenTvEventSocket } from './socket';
import type {
  SevenTvChangeField,
  SevenTvDispatch,
  SevenTvEmoteSetPatchResult,
  SevenTvLiveConnectOptions,
  SevenTvLiveConnection,
  SevenTvSubscription,
} from './types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const deepMerge = (base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> => {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const previous = result[key];
    result[key] = isRecord(previous) && isRecord(value) ? deepMerge(previous, value) : value;
  }
  return result;
};

const emoteFromCandidate = (candidate: EmoteCandidate): Emote => {
  const { scope: _scope, ...emote } = candidate;
  return emote;
};

export const replaceSevenTvChannelCandidates = (
  baseCandidates: EmoteCandidate[],
  liveCandidates: EmoteCandidate[],
): EmoteCandidate[] => [
  ...baseCandidates.filter((candidate) => !(candidate.provider === '7tv' && candidate.scope === 'channel')),
  ...liveCandidates,
];

const emoteSetFromCandidates = (candidates: EmoteCandidate[]): EmoteSet => {
  const result: EmoteSet = {};
  for (const candidate of candidates) result[candidate.code] = emoteFromCandidate(candidate);
  return result;
};

const recordFrom = (value: unknown): Record<string, unknown> | null => isRecord(value) ? value : null;

const findCodeById = (emotes: EmoteSet, id: string): string | undefined =>
  Object.entries(emotes).find(([, emote]) => emote.provider === '7tv' && emote.id === id)?.[0];

const codeFromRecord = (value: Record<string, unknown> | null): string | undefined =>
  value && typeof value.name === 'string' ? value.name : undefined;

const idFromRecord = (value: Record<string, unknown> | null): string | undefined =>
  value && typeof value.id === 'string' ? value.id : undefined;

const candidateFromRecord = (value: Record<string, unknown>): EmoteCandidate | null =>
  sevenTvCandidateFromActiveEmote(value as SevenTvActiveEmote, 'channel');

const addCandidate = (
  next: EmoteSet,
  candidate: EmoteCandidate,
  added: string[],
  updated: string[],
) => {
  const existing = next[candidate.code];
  next[candidate.code] = emoteFromCandidate(candidate);
  (existing ? updated : added).push(candidate.code);
};

const applyPushed = (
  next: EmoteSet,
  field: SevenTvChangeField,
  added: string[],
  updated: string[],
): void => {
  if (field.key !== 'emotes') return;
  const value = recordFrom(field.value);
  if (!value) return;
  const candidate = candidateFromRecord(value);
  if (candidate) addCandidate(next, candidate, added, updated);
};

const applyPulled = (next: EmoteSet, field: SevenTvChangeField, removed: string[]): void => {
  if (field.key !== 'emotes') return;
  const oldValue = recordFrom(field.old_value);
  const code = codeFromRecord(oldValue) ?? (idFromRecord(oldValue) ? findCodeById(next, idFromRecord(oldValue)!) : undefined);
  if (!code || !next[code]) return;
  delete next[code];
  removed.push(code);
};

const applyUpdated = (
  next: EmoteSet,
  field: SevenTvChangeField,
  updated: string[],
  added: string[],
  removed: string[],
): void => {
  if (field.key !== 'emotes') return;
  const oldValue = recordFrom(field.old_value);
  const value = recordFrom(field.value);
  if (!value) return;

  const oldCode = codeFromRecord(oldValue) ?? (idFromRecord(oldValue) ? findCodeById(next, idFromRecord(oldValue)!) : undefined);
  const existing = oldCode ? next[oldCode] : undefined;
  const existingRaw = recordFrom(existing?.raw) ?? {};
  const merged = deepMerge(deepMerge(existingRaw, oldValue ?? {}), value);
  const candidate = candidateFromRecord(merged);
  if (!candidate) return;

  if (oldCode && oldCode !== candidate.code && next[oldCode]) {
    delete next[oldCode];
    removed.push(oldCode);
  }
  addCandidate(next, candidate, added, updated);
};

export function applySevenTvEmoteSetDispatch(
  emotes: EmoteSet,
  dispatch: SevenTvDispatch,
): SevenTvEmoteSetPatchResult {
  if (dispatch.type !== 'emote_set.update') {
    return { emotes, changed: false, added: [], updated: [], removed: [] };
  }

  const next: EmoteSet = { ...emotes };
  const added: string[] = [];
  const updated: string[] = [];
  const removed: string[] = [];

  for (const field of dispatch.body.pushed ?? []) applyPushed(next, field, added, updated);
  for (const field of dispatch.body.added ?? []) applyPushed(next, field, added, updated);
  for (const field of dispatch.body.updated ?? []) applyUpdated(next, field, updated, added, removed);
  for (const field of dispatch.body.pulled ?? []) applyPulled(next, field, removed);
  for (const field of dispatch.body.removed ?? []) applyPulled(next, field, removed);

  const changed = added.length > 0 || updated.length > 0 || removed.length > 0;
  return { emotes: changed ? next : emotes, changed, added, updated, removed };
}

const objectSubscription = (type: string, objectId: string): SevenTvSubscription => ({
  type,
  condition: { object_id: objectId },
});

const userUpdateTouchesEmoteSetAssignment = (dispatch: SevenTvDispatch): boolean => {
  for (const field of dispatch.body.updated ?? []) {
    if (field.key !== 'connections') continue;
    if (Array.isArray(field.value)) {
      if (field.value.some((nested) => isRecord(nested) && nested.key === 'emote_set')) return true;
    }
    const value = recordFrom(field.value);
    if (value && 'emote_set' in value) return true;
  }
  return false;
};

const channelSubscription = (
  type: string,
  platform: 'twitch' | 'kick',
  platformUserId: string,
): SevenTvSubscription => ({
  type,
  condition: { ctx: 'channel', platform: platform.toUpperCase(), id: platformUserId },
});

export async function connectSevenTvLive(
  options: SevenTvLiveConnectOptions,
): Promise<SevenTvLiveConnection> {
  const platformUserId = options.platformUserId.trim();
  if (!platformUserId) throw new Error('7TV live connection requires a platform user id');
  if (options.signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');

  const initial = await fetchSevenTvChannelSnapshot(options.platform, platformUserId, { signal: options.signal });
  if (options.signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
  if (!initial.status.ok) {
    options.onError?.(new Error(initial.status.error ?? 'Initial 7TV channel lookup failed'));
  }

  let stopped = false;
  let sevenTvUserId = initial.sevenTvUserId;
  let emoteSetId = initial.emoteSetId;
  let currentCandidates = [...initial.candidates];
  let currentEmotes = emoteSetFromCandidates(currentCandidates);
  let refreshGeneration = 0;

  const subscriptions: SevenTvSubscription[] = [
    channelSubscription('cosmetic.*', options.platform, platformUserId),
    channelSubscription('entitlement.*', options.platform, platformUserId),
  ];
  if (sevenTvUserId) subscriptions.push(objectSubscription('user.update', sevenTvUserId));
  if (emoteSetId) subscriptions.push(objectSubscription('emote_set.update', emoteSetId));

  let socket = createSevenTvEventSocket({
    ...options.socket,
    subscriptions,
    onStateChange: options.onStateChange,
    onError: options.onError,
    onDispatch: (dispatch) => {
      if (stopped) return;

      if (dispatch.type === 'emote_set.update' && dispatch.body.id === emoteSetId) {
        const patch = applySevenTvEmoteSetDispatch(currentEmotes, dispatch);
        if (!patch.changed) return;
        currentEmotes = patch.emotes;
        currentCandidates = Object.values(currentEmotes).map((emote) => ({ ...emote, scope: 'channel' as const }));
        if (options.cacheChannelName) clearCachedEmotes(options.cacheChannelName);
        options.onEmoteSetChange?.(currentEmotes, { reason: 'dispatch', dispatch, emoteSetId, candidates: currentCandidates });
        return;
      }

      if (
        dispatch.type === 'user.update' &&
        dispatch.body.id === sevenTvUserId &&
        userUpdateTouchesEmoteSetAssignment(dispatch)
      ) {
        void refreshSnapshot(dispatch);
        return;
      }

      if (dispatch.type.startsWith('cosmetic.') || dispatch.type.startsWith('entitlement.')) {
        clearSevenTvUserCosmeticsCache();
        options.onCosmeticsInvalidated?.(dispatch);
      }
    },
  });

  const refreshSnapshot = async (dispatch?: SevenTvDispatch) => {
    const generation = ++refreshGeneration;
    try {
      const refreshed = await fetchSevenTvChannelSnapshot(options.platform, platformUserId, { signal: options.signal });
      if (stopped || generation !== refreshGeneration) return;
      if (!refreshed.status.ok) {
        options.onError?.(new Error(refreshed.status.error ?? '7TV channel refresh failed'));
        return;
      }

      const previousUserId = sevenTvUserId;
      const previousSetId = emoteSetId;
      sevenTvUserId = refreshed.sevenTvUserId;
      emoteSetId = refreshed.emoteSetId;

      if (previousUserId && previousUserId !== sevenTvUserId) {
        socket.unsubscribe(objectSubscription('user.update', previousUserId));
      }
      if (sevenTvUserId && previousUserId !== sevenTvUserId) {
        socket.subscribe(objectSubscription('user.update', sevenTvUserId));
      }
      if (previousSetId && previousSetId !== emoteSetId) {
        socket.unsubscribe(objectSubscription('emote_set.update', previousSetId));
      }
      if (emoteSetId && previousSetId !== emoteSetId) {
        socket.subscribe(objectSubscription('emote_set.update', emoteSetId));
      }

      if (previousSetId !== emoteSetId || dispatch) {
        currentCandidates = [...refreshed.candidates];
        currentEmotes = emoteSetFromCandidates(currentCandidates);
        if (options.cacheChannelName) clearCachedEmotes(options.cacheChannelName);
        options.onEmoteSetChange?.(currentEmotes, { reason: 'reassigned', dispatch, emoteSetId, candidates: currentCandidates });
      }
    } catch (error) {
      if (stopped || options.signal?.aborted) return;
      options.onError?.(error instanceof Error ? error : new Error('7TV channel refresh failed'));
    }
  };

  const onAbort = () => connection.close();
  const connection: SevenTvLiveConnection = {
    platform: options.platform,
    platformUserId,
    get sevenTvUserId() { return sevenTvUserId; },
    get emoteSetId() { return emoteSetId; },
    emotes: () => currentEmotes,
    candidates: () => currentCandidates,
    close: () => {
      if (stopped) return;
      stopped = true;
      refreshGeneration += 1;
      options.signal?.removeEventListener('abort', onAbort);
      socket.close();
    },
  };
  options.signal?.addEventListener('abort', onAbort, { once: true });
  return connection;
}
