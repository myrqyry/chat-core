import type { EmoteCandidate, EmoteProvider, ProviderStatus } from './emotes';

export interface ProviderResult {
  candidates: EmoteCandidate[];
  status: ProviderStatus;
}

export interface ProviderOptions {
  signal?: AbortSignal;
}

export const providerStatus = (
  provider: EmoteProvider,
  scope: 'channel' | 'global',
  candidates: EmoteCandidate[],
  error?: unknown,
): ProviderStatus => ({
  provider,
  scope,
  ok: error === undefined,
  count: candidates.length,
  ...(error === undefined ? {} : { error: error instanceof Error ? error.message : 'Provider request failed' }),
});
