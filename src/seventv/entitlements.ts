import { fetchSevenTvEmoteSet, type SevenTvPlatform } from '../emotes/sevenTv';
import { mergeCandidates } from '../emotes/registry';
import type { EmoteCandidate, EmoteSet } from '../types/emotes';
import type { SevenTvDispatch } from './types';

export type SevenTvEntitlementKind = 'EMOTE_SET' | 'BADGE' | 'PAINT';

export interface SevenTvEntitlement {
  id: string;
  kind: SevenTvEntitlementKind;
  refId: string;
  sevenTvUserId?: string;
  platform: SevenTvPlatform;
  platformUserId: string;
  raw?: unknown;
}

export interface SevenTvEntitlementLoadError {
  emoteSetId: string;
  error: Error;
}

export interface SevenTvEntitlementApplyResult {
  changed: boolean;
  granted: SevenTvEntitlement[];
  revoked: SevenTvEntitlement[];
  addedEmoteSetIds: string[];
  removedEmoteSetIds: string[];
  loadedEmoteSetIds?: string[];
  resetUserIds: string[];
  loadErrors: SevenTvEntitlementLoadError[];
}

export interface SevenTvEntitlementStoreOptions {
  platform: SevenTvPlatform;
  signal?: AbortSignal;
  loadEmoteSet?: (emoteSetId: string) => Promise<EmoteCandidate[]>;
}

const ENTITLEMENT_KINDS = new Set<SevenTvEntitlementKind>(['EMOTE_SET', 'BADGE', 'PAINT']);

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const stringValue = (value: unknown): string | undefined =>
  typeof value === 'string' && value ? value : undefined;

const entitlementKind = (value: unknown): SevenTvEntitlementKind | undefined => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.toUpperCase() as SevenTvEntitlementKind;
  return ENTITLEMENT_KINDS.has(normalized) ? normalized : undefined;
};

const platformMatches = (value: unknown, platform: SevenTvPlatform): boolean =>
  typeof value === 'string' && value.toLowerCase() === platform;

const canonicalEntitlementId = (
  platformUserId: string,
  kind: SevenTvEntitlementKind,
  refId: string,
): string => `${platformUserId}:${kind}:${refId}`;

const entitlementFromDirectFields = (
  object: Record<string, unknown>,
  platform: SevenTvPlatform,
  raw: unknown,
): SevenTvEntitlement[] => {
  const kind = entitlementKind(object.kind);
  const refId = stringValue(object.ref_id) ?? stringValue(object.refId);
  const platformUserId = stringValue(object.platform_id) ?? stringValue(object.platformUserId);
  if (!kind || !refId || !platformUserId) return [];
  return [{
    id: canonicalEntitlementId(platformUserId, kind, refId),
    kind,
    refId,
    sevenTvUserId: stringValue(object.user_id) ?? stringValue(object.userId),
    platform,
    platformUserId,
    raw,
  }];
};

export function sevenTvEntitlementsFromDispatch(
  dispatch: SevenTvDispatch,
  platform: SevenTvPlatform,
): SevenTvEntitlement[] {
  if (dispatch.type !== 'entitlement.create' && dispatch.type !== 'entitlement.delete') return [];
  const object = asRecord(dispatch.body.object);
  if (!object) return [];

  const direct = entitlementFromDirectFields(object, platform, object);
  if (direct.length) return direct;

  const kind = entitlementKind(object.kind);
  const refId = stringValue(object.ref_id) ?? stringValue(object.refId);
  const user = asRecord(object.user);
  const sevenTvUserId = stringValue(user?.id);
  if (!kind || !refId || !user) return [];

  const connections = Array.isArray(user.connections) ? user.connections : [];
  return connections.flatMap((connection): SevenTvEntitlement[] => {
    const row = asRecord(connection);
    const platformUserId = stringValue(row?.id);
    if (!row || !platformUserId || !platformMatches(row.platform, platform)) return [];
    return [{
      id: canonicalEntitlementId(platformUserId, kind, refId),
      kind,
      refId,
      sevenTvUserId,
      platform,
      platformUserId,
      raw: object,
    }];
  });
}

const meaningfulEntitlementEqual = (a: SevenTvEntitlement, b: SevenTvEntitlement): boolean =>
  a.id === b.id &&
  a.kind === b.kind &&
  a.refId === b.refId &&
  a.sevenTvUserId === b.sevenTvUserId &&
  a.platform === b.platform &&
  a.platformUserId === b.platformUserId;

const referencedEmoteSetIds = (values: Iterable<SevenTvEntitlement>): Set<string> => {
  const ids = new Set<string>();
  for (const entitlement of values) {
    if (entitlement.kind === 'EMOTE_SET') ids.add(entitlement.refId);
  }
  return ids;
};

const sorted = <T>(values: Iterable<T>, key: (value: T) => string): T[] =>
  [...values].sort((a, b) => key(a).localeCompare(key(b)));

export class SevenTvEntitlementStore {
  readonly platform: SevenTvPlatform;
  private readonly signal?: AbortSignal;
  private readonly loadEmoteSet: (emoteSetId: string) => Promise<EmoteCandidate[]>;
  private readonly byId = new Map<string, SevenTvEntitlement>();
  private readonly personalSets = new Map<string, EmoteCandidate[]>();

  constructor(options: SevenTvEntitlementStoreOptions) {
    this.platform = options.platform;
    this.signal = options.signal;
    this.loadEmoteSet = options.loadEmoteSet ?? ((emoteSetId) =>
      fetchSevenTvEmoteSet(emoteSetId, 'user', { signal: this.signal }));
  }

  list(platformUserId?: string): SevenTvEntitlement[] {
    const values = platformUserId
      ? [...this.byId.values()].filter((entitlement) => entitlement.platformUserId === platformUserId)
      : [...this.byId.values()];
    return sorted(values, (entitlement) => entitlement.id);
  }

  hasEmoteSetReference(emoteSetId: string): boolean {
    return [...this.byId.values()].some(
      (entitlement) => entitlement.kind === 'EMOTE_SET' && entitlement.refId === emoteSetId,
    );
  }

  emoteSetCandidates(emoteSetId: string): EmoteCandidate[] {
    return [...(this.personalSets.get(emoteSetId) ?? [])];
  }

  replaceEmoteSetCandidates(emoteSetId: string, candidates: EmoteCandidate[]): void {
    if (!this.hasEmoteSetReference(emoteSetId)) return;
    this.personalSets.set(emoteSetId, candidates.map((candidate) => ({ ...candidate, scope: 'user' })));
  }

  async refreshEmoteSet(emoteSetId: string): Promise<EmoteCandidate[]> {
    if (!this.hasEmoteSetReference(emoteSetId)) return [];
    const candidates = (await this.loadEmoteSet(emoteSetId)).map((candidate) => ({
      ...candidate,
      scope: 'user' as const,
    }));
    this.personalSets.set(emoteSetId, candidates);
    return [...candidates];
  }

  personalCandidates(platformUserId: string): EmoteCandidate[] {
    const setIds = this.list(platformUserId)
      .filter((entitlement) => entitlement.kind === 'EMOTE_SET')
      .map((entitlement) => entitlement.refId);
    const result: EmoteCandidate[] = [];
    for (const setId of setIds) result.push(...(this.personalSets.get(setId) ?? []));
    return result;
  }

  personalEmotes(platformUserId: string): EmoteSet {
    return mergeCandidates(this.personalCandidates(platformUserId));
  }

  async applyDispatch(dispatch: SevenTvDispatch): Promise<SevenTvEntitlementApplyResult> {
    return this.applyDispatches([dispatch]);
  }

  async applyDispatches(dispatches: readonly SevenTvDispatch[]): Promise<SevenTvEntitlementApplyResult> {
    const before = new Map(this.byId);
    const beforeSetIds = referencedEmoteSetIds(before.values());
    const resetUserIds = new Set<string>();

    for (const dispatch of dispatches) {
      if (dispatch.type === 'entitlement.reset') {
        const sevenTvUserId = stringValue(dispatch.body.id);
        if (!sevenTvUserId) continue;
        resetUserIds.add(sevenTvUserId);
        for (const [id, entitlement] of this.byId) {
          if (entitlement.sevenTvUserId === sevenTvUserId) this.byId.delete(id);
        }
        continue;
      }

      const entitlements = sevenTvEntitlementsFromDispatch(dispatch, this.platform);
      if (dispatch.type === 'entitlement.create') {
        for (const entitlement of entitlements) this.byId.set(entitlement.id, entitlement);
      } else if (dispatch.type === 'entitlement.delete') {
        for (const entitlement of entitlements) this.byId.delete(entitlement.id);
      }
    }

    const afterSetIds = referencedEmoteSetIds(this.byId.values());
    const granted = sorted(
      [...this.byId.values()].filter((entitlement) => {
        const previous = before.get(entitlement.id);
        return !previous || !meaningfulEntitlementEqual(previous, entitlement);
      }),
      (entitlement) => entitlement.id,
    );
    const revoked = sorted(
      [...before.values()].filter((entitlement) => {
        const current = this.byId.get(entitlement.id);
        return !current || !meaningfulEntitlementEqual(current, entitlement);
      }),
      (entitlement) => entitlement.id,
    );
    const addedEmoteSetIds = [...afterSetIds].filter((id) => !beforeSetIds.has(id)).sort();
    const removedEmoteSetIds = [...beforeSetIds].filter((id) => !afterSetIds.has(id)).sort();

    for (const id of removedEmoteSetIds) this.personalSets.delete(id);

    const loadErrors: SevenTvEntitlementLoadError[] = [];
    const loadedEmoteSetIds: string[] = [];
    const setsToLoad = [...afterSetIds].filter((id) => !this.personalSets.has(id)).sort();
    await Promise.all(setsToLoad.map(async (emoteSetId) => {
      try {
        await this.refreshEmoteSet(emoteSetId);
        loadedEmoteSetIds.push(emoteSetId);
      } catch (error) {
        loadErrors.push({
          emoteSetId,
          error: error instanceof Error ? error : new Error('7TV personal emote-set load failed'),
        });
      }
    }));

    return {
      changed: granted.length > 0 || revoked.length > 0 || loadedEmoteSetIds.length > 0,
      granted,
      revoked,
      addedEmoteSetIds,
      removedEmoteSetIds,
      loadedEmoteSetIds: loadedEmoteSetIds.sort(),
      resetUserIds: [...resetUserIds].sort(),
      loadErrors: loadErrors.sort((a, b) => a.emoteSetId.localeCompare(b.emoteSetId)),
    };
  }
}
