import type { EmoteFetchResult } from '../types/emotes';

const CACHE_VERSION = 'v4';
// Keep the pre-rename storage prefix so existing browser caches survive the Chatbus rename.
const CACHE_PREFIX = `chat-core-emotes-${CACHE_VERSION}-`;
export const CACHE_DURATION_MS = 5 * 60 * 1000;

const memoryCache = new Map<string, string>();

const getStorage = (): Storage | null => {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
};
const get = (key: string): string | null => {
  const memoryValue = memoryCache.get(key);
  if (memoryValue !== undefined) return memoryValue;
  try { return getStorage()?.getItem(key) ?? null; } catch { return null; }
};
const set = (key: string, value: string): void => {
  memoryCache.set(key, value);
  try { getStorage()?.setItem(key, value); } catch {}
};
const remove = (key: string): void => {
  memoryCache.delete(key);
  try { getStorage()?.removeItem(key); } catch {}
};

export const clearCachedEmotes = (channel?: string): void => {
  if (channel !== undefined) {
    const normalized = channel.trim().toLowerCase();
    if (normalized) remove(`${CACHE_PREFIX}${normalized}`);
    return;
  }
  memoryCache.clear();
  try {
    const storage = getStorage();
    if (!storage) return;
    for (let i = storage.length - 1; i >= 0; i -= 1) {
      const key = storage.key(i);
      if (key?.startsWith(CACHE_PREFIX)) storage.removeItem(key);
    }
  } catch {}
};

export const readCachedEmotes = (channel: string): EmoteFetchResult | null => {
  const raw = get(`${CACHE_PREFIX}${channel}`);
  if (!raw) return null;
  try {
    const entry = JSON.parse(raw) as { timestamp: number; result: EmoteFetchResult };
    if (!entry.timestamp || Date.now() - entry.timestamp >= CACHE_DURATION_MS) return null;
    if (!entry.result || typeof entry.result.emotes !== 'object') return null;
    return { ...entry.result, fromCache: true };
  } catch { return null; }
};
export const writeCachedEmotes = (channel: string, result: EmoteFetchResult): void => {
  set(`${CACHE_PREFIX}${channel}`, JSON.stringify({ timestamp: Date.now(), result: { ...result, fromCache: false } }));
};
