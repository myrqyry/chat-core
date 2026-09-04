# Chat-core emote foundation design

This design establishes a framework-neutral package for chat transport and
third-party emote discovery. The first implementation stage extracts the
reliable emote behavior shared by `noita-chat` and `sketchy-chat` without
coupling either application's renderer to the package.

## Goals

- Provide one local package at `/home/myrqyry/MQR/chat-core`.
- Export framework-neutral TypeScript types and functions.
- Support Twitch channel and global 7TV, BTTV, and FFZ emotes.
- Preserve deterministic provider precedence.
- Validate URLs before they enter an emote registry.
- Provide timeout, abort, retry, cache, and in-flight request deduplication.
- Let both applications consume the same registry without importing each
  other's rendering or platform code.

## Non-goals

- Particle simulation, materials, React Three Fiber, Rough.js, GSAP, or DOM
  rendering.
- Zero-width clustering and an `EmoteCluster` renderer in this first stage.
- Twitch or Kick connection lifecycle migration in this first stage.
- Badges, 7TV user paints, or processed image caching.
- A published npm package or remote registry.

## Package boundary

`chat-core` owns normalized emote metadata, provider adapters, network
utilities, registry merging, and cache coordination. It must not import React,
Twitch UI types, browser rendering libraries, or application-specific settings.

The first public surface is:

```ts
export type EmoteProvider = 'twitch' | 'twitch-cheer' | 'kick' | '7tv' | 'bttv' | 'ffz' | 'custom';

export interface Emote {
  code: string;
  id: string;
  url: string;
  altUrls?: string[];
  zeroWidth: boolean;
  provider: EmoteProvider;
}

export type EmoteSet = Record<string, Emote>;

export interface ProviderStatus {
  provider: EmoteProvider;
  scope: 'channel' | 'global';
  ok: boolean;
  count: number;
  error?: string;
}

export interface EmoteFetchResult {
  emotes: EmoteSet;
  providers: ProviderStatus[];
  fromCache: boolean;
  complete: boolean;
}

export interface EmoteFetchOptions {
  bypassCache?: boolean;
  signal?: AbortSignal;
}

export function fetchChannelEmotes(
  channelName: string,
  options?: EmoteFetchOptions,
): Promise<EmoteSet>;

export function fetchChannelEmotesDetailed(
  channelName: string,
  options?: EmoteFetchOptions,
): Promise<EmoteFetchResult>;
```

The exact module layout follows the requested structure, but consumers import
from the package entry point rather than internal files.

## Provider behavior

Provider adapters return `EmoteCandidate` values, not merged maps. Each
candidate carries an internal scope of `native`, `channel`, `global`, or
`custom`; the final exported `Emote` omits that implementation detail. The
registry merges candidates using one package-owned priority table. Custom and
native Twitch emotes win over channel third-party emotes; channel third-party
emotes win over global third-party emotes. 7TV, BTTV, and FFZ keep their
relative precedence as explicit constants rather than relying on request
completion order.

The 7TV adapter owns the modifier flag interpretation. It uses the provider's
zero-width bitmask, not an application-specific equality check. The adapter
also builds alternate image URLs from the provider file list and falls back to
the channel name when a Twitch-ID lookup is unavailable or rejected.

Global endpoints are fetched alongside channel prerequisites where possible:

- FFZ global set.
- BTTV global emote set.
- 7TV global emote set.

Malformed provider records and invalid URLs are skipped with package logging.
One provider failure must not discard successful results from other providers.

## Network and cache behavior

The package uses one fetch helper that composes caller abort signals with a
bounded timeout and bounded retry attempts. JSON requests build on that helper.
Channel results use versioned browser storage when available, with an in-memory
fallback when storage is unavailable. Concurrent requests for the same
normalized channel share one underlying promise; aborting one consumer must
not abort the shared request for other consumers.

The detailed API returns one `ProviderStatus` per attempted provider scope,
including success, count, and a safe error summary. `complete` is false when a
requested provider failed, even if other providers returned emotes. This gives
applications enough information to reject a degraded or empty refresh without
embedding last-known-good policy in the package. `fetchChannelEmotes()` is a
convenience wrapper that returns only `result.emotes`.

Channel names are trimmed and lowercased before cache lookup and in-flight
request coordination. The original channel string remains available to an
adapter when an upstream API requires it.

The shared in-flight operation uses its own internal request lifetime. Each
consumer races the shared promise against its own abort signal, so aborting one
consumer never aborts the shared request for other consumers. Version one does
not reference-count consumers to cancel the underlying operation when all
consumers disappear.

## Integration sequence

1. Add `chat-core` as a pnpm workspace package with strict TypeScript output.
2. Port Noita's provider and network behavior into the package.
3. Add Sketchy's global provider adapters and deterministic precedence tests.
4. Switch both applications to consume the package while retaining temporary
   application adapters at their existing boundaries.
5. Verify both applications independently before removing duplicated loaders.

Each migration is a separate implementation plan and must keep the existing
overlay behavior working during the transition.

## Testing

The package tests must cover:

- Provider collision precedence, including custom and native emotes.
- Global and channel provider records.
- 7TV zero-width bitmask handling.
- Invalid records and malformed provider responses.
- Timeout and abort behavior.
- In-flight deduplication with independent consumer cancellation.
- Cache round trips and forced refreshes.
- Alternate URL construction.

The application test suites remain responsible for their own rendering and
message parsing behavior until later stages migrate normalized messages and
zero-width clustering.

## Next steps

Create the implementation plan for the emote foundation as a standalone,
testable package. Do not begin zero-width clustering or connection lifecycle
work until both applications consume this package successfully.
