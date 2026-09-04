# Chat-core emote foundation implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a framework-neutral local `@myrqyry/chat-core` package that
provides reliable, deterministic Twitch and third-party emote discovery for
`noita-chat` and `sketchy-chat`.

**Architecture:** Build the package as a sibling pnpm workspace member. Provider
adapters emit scoped candidates and provider status; one registry owns merging
and precedence. A shared network/cache coordinator handles timeout, retries,
consumer-local aborts, normalized channel identity, and persistent storage.
Each application migrates behind a small local adapter, preserving its current
rendering and message parsing boundaries.

**Tech Stack:** TypeScript 5.8, pnpm workspace, Vitest, browser `fetch`,
`localStorage`, and `sessionStorage` where available.

## Global Constraints

- `chat-core` must not import React, Rough.js, GSAP, React Three Fiber, Three.js,
  tmi.js, or application-specific settings.
- Provider adapters return scoped candidates; only the registry resolves
  collisions.
- Channel cache and in-flight identity is `channel.trim().toLowerCase()`.
- Aborting one consumer must not abort the shared underlying request.
- Version one must not implement reference-counted cancellation.
- Network and provider failures return safe partial results and status instead
  of crashing the caller.
- Preserve both applications' existing visual behavior during migration.
- Use pnpm commands and single-quoted, semicolon-terminated TypeScript.
- Every behavior change must have deterministic Vitest coverage.

---

### Task 1: Workspace and package skeleton

**Files:**
- Create: `/home/myrqyry/MQR/pnpm-workspace.yaml`
- Create: `/home/myrqyry/MQR/chat-core/package.json`
- Create: `/home/myrqyry/MQR/chat-core/tsconfig.json`
- Create: `/home/myrqyry/MQR/chat-core/src/index.ts`
- Modify: `/home/myrqyry/MQR/noita-chat/package.json`
- Modify: `/home/myrqyry/MQR/sketchy-chat/package.json`

**Interfaces:**
- Produces package name `@myrqyry/chat-core` and workspace dependency
  `workspace:*` for both applications.

- [ ] **Step 1: Add the workspace manifest**

Create `/home/myrqyry/MQR/pnpm-workspace.yaml` with:

```yaml
packages:
  - chat-core
  - noita-chat
  - sketchy-chat
```

- [ ] **Step 2: Add the package manifest and compiler settings**

Use a private package with `build`, `typecheck`, and `test` scripts. Export
`src/index.ts` through `main` and `types`, and enable strict TypeScript with an
ES module target compatible with both applications.

- [ ] **Step 3: Add workspace dependencies**

Add `"@myrqyry/chat-core": "workspace:*"` to the dependencies of both app
manifests. Do not remove existing application dependencies yet.

- [ ] **Step 4: Install and verify resolution**

Run `pnpm install` from `/home/myrqyry/MQR`.

Expected: the workspace links the package and both existing lockfiles remain
consistent.

- [ ] **Step 5: Verify repository boundaries**

Run `git -C /home/myrqyry/MQR/noita-chat status --short` and
`git -C /home/myrqyry/MQR/sketchy-chat status --short`.

Expected: package files are visible from the shared filesystem, while only
application files and workspace lockfile changes belong to the two Git
repositories. Do not commit without explicit user authorization; the sibling
package currently has no Git repository of its own.

### Task 2: Core types and candidate registry

**Files:**
- Create: `/home/myrqyry/MQR/chat-core/src/types/emotes.ts`
- Create: `/home/myrqyry/MQR/chat-core/src/emotes/registry.ts`
- Create: `/home/myrqyry/MQR/chat-core/tests/registry.test.ts`
- Modify: `/home/myrqyry/MQR/chat-core/src/index.ts`

**Interfaces:**
- `EmoteProvider`, `EmoteScope`, `Emote`, `EmoteCandidate`, `ProviderStatus`,
  `EmoteFetchResult`.
- `mergeCandidates(candidates: EmoteCandidate[]): EmoteSet`.

- [ ] **Step 1: Write precedence tests**

Cover custom over all candidates, native over channel third-party, channel
third-party over global third-party, 7TV over BTTV over FFZ within the same
scope, stable first-winner behavior for equal priority, and invalid URLs being
excluded.

- [ ] **Step 2: Implement typed candidate merging**

Keep `scope` on `EmoteCandidate`, use a single priority table in the registry,
strip `scope` from the returned `Emote`, and validate `http`, `https`, and
supported data URLs before insertion.

- [ ] **Step 3: Export the contracts**

Export only public types and `mergeCandidates` from `src/index.ts`.

- [ ] **Step 4: Run focused tests**

Run `pnpm --dir /home/myrqyry/MQR/chat-core test -- --run tests/registry.test.ts`.

Expected: all registry tests pass.

### Task 3: Network primitives

**Files:**
- Create: `/home/myrqyry/MQR/chat-core/src/network/fetch.ts`
- Create: `/home/myrqyry/MQR/chat-core/tests/fetch.test.ts`
- Modify: `/home/myrqyry/MQR/chat-core/src/index.ts`

**Interfaces:**
- `fetchWithTimeout(url, options?, timeoutMs?, retries?): Promise<Response>`.
- `fetchJson<T>(url, options?, timeoutMs?, retries?): Promise<T>`.
- `isAbortError(error): boolean`.

- [ ] **Step 1: Write deterministic timeout, retry, and abort tests**

Use fake timers and mocked `fetch` to prove timeout rejection, retry only for
retryable failures, caller cancellation, and successful JSON parsing.

- [ ] **Step 2: Implement the shared fetch helper**

Compose the caller signal with an internal timeout controller, clean up timers
and listeners, retry a bounded number of times with small jitter, and preserve
abort errors without retrying them.

- [ ] **Step 3: Run focused tests**

Run `pnpm --dir /home/myrqyry/MQR/chat-core test -- --run tests/fetch.test.ts`.

Expected: all network tests pass without real network access.

### Task 4: Provider adapters

**Files:**
- Create: `/home/myrqyry/MQR/chat-core/src/emotes/twitch.ts`
- Create: `/home/myrqyry/MQR/chat-core/src/emotes/sevenTv.ts`
- Create: `/home/myrqyry/MQR/chat-core/src/emotes/bttv.ts`
- Create: `/home/myrqyry/MQR/chat-core/src/emotes/ffz.ts`
- Create: `/home/myrqyry/MQR/chat-core/src/types/providers.ts`
- Create: `/home/myrqyry/MQR/chat-core/tests/providers.test.ts`
- Modify: `/home/myrqyry/MQR/chat-core/src/index.ts`

**Interfaces:**
- `ProviderResult { candidates: EmoteCandidate[]; status: ProviderStatus }`.
- `fetchGlobalSevenTv`, `fetchChannelSevenTv`.
- `fetchGlobalBttv`, `fetchChannelBttv`.
- `fetchGlobalFfz`, `fetchChannelFfz`.
- `resolveTwitchUserId`.

- [ ] **Step 1: Write provider fixture tests**

Mock all provider responses and cover global plus channel records, malformed
records, invalid URLs, channel-ID resolution, 7TV alternate URLs, and the 7TV
zero-width bitmask. Assert adapters return candidates and status, never merged
maps.

- [ ] **Step 2: Implement provider parsing**

Port Noita's validated URL and alternate-format behavior. Add Sketchy's global
FFZ, BTTV, and 7TV endpoints. Keep scope explicit on every candidate and
record provider counts and errors in `ProviderStatus`.

- [ ] **Step 3: Run focused tests**

Run `pnpm --dir /home/myrqyry/MQR/chat-core test -- --run tests/providers.test.ts`.

Expected: all fixture tests pass with zero network access.

### Task 5: Fetch coordinator and detailed public API

**Files:**
- Create: `/home/myrqyry/MQR/chat-core/src/emotes/loader.ts`
- Create: `/home/myrqyry/MQR/chat-core/src/types/chat.ts`
- Create: `/home/myrqyry/MQR/chat-core/tests/loader.test.ts`
- Modify: `/home/myrqyry/MQR/chat-core/src/index.ts`

**Interfaces:**
- `EmoteFetchOptions { bypassCache?: boolean; signal?: AbortSignal }`.
- `fetchChannelEmotesDetailed(channel, options?): Promise<EmoteFetchResult>`.
- `fetchChannelEmotes(channel, options?): Promise<EmoteSet>`.

- [ ] **Step 1: Write coordinator tests first**

Cover normalized identity for whitespace and case variants, provider result
merging, `complete: false` on provider failure, `fromCache`, convenience API
projection, forced refresh, and independent consumer aborts over one shared
request.

- [ ] **Step 2: Implement the coordinator**

Start global requests in parallel with channel prerequisites, await all provider
results, merge candidates centrally, calculate completeness from provider
statuses, and expose the detailed result. Store one shared promise per
normalized channel with an internal request lifetime; wrap each caller in its
own abort race.

- [ ] **Step 3: Run focused tests**

Run `pnpm --dir /home/myrqyry/MQR/chat-core test -- --run tests/loader.test.ts`.

Expected: all coordinator tests pass.

### Task 6: Persistent cache

**Files:**
- Create: `/home/myrqyry/MQR/chat-core/src/emotes/cache.ts`
- Create: `/home/myrqyry/MQR/chat-core/tests/cache.test.ts`
- Modify: `/home/myrqyry/MQR/chat-core/src/emotes/loader.ts`

**Interfaces:**
- Internal versioned cache records containing `emotes`, `timestamp`, and
  provider status metadata.

- [ ] **Step 1: Write cache tests**

Cover fresh cache reads, expiry, forced refresh, malformed records, storage
failure fallback to memory, and preservation of alternate URLs.

- [ ] **Step 2: Implement cache behavior**

Use `localStorage` when available, fall back to a module-local memory map, keep
the cache version in one constant, and never let cache parse/storage failures
fail an emote request.

- [ ] **Step 3: Integrate and run tests**

Run `pnpm --dir /home/myrqyry/MQR/chat-core test -- --run tests/cache.test.ts tests/loader.test.ts`.

Expected: cache and coordinator tests pass together.

### Task 7: Noita migration adapter

**Files:**
- Modify: `/home/myrqyry/MQR/noita-chat/services/emoteService.ts`
- Modify: `/home/myrqyry/MQR/noita-chat/tests/emoteService.test.ts`
- Modify: `/home/myrqyry/MQR/noita-chat/types.ts`

- [ ] **Step 1: Add a compatibility adapter test**

Prove Noita's existing `fetchChannelEmotes(channel, bypassCache, signal)` call
shape receives the shared `EmoteSet`, preserves custom-emote precedence and
7TV alternate URLs, and keeps existing parser behavior unchanged.

- [ ] **Step 2: Replace duplicated provider fetching**

Import the shared detailed API through `@myrqyry/chat-core`. Keep only Noita's
application-specific custom-emote construction and message parsing locally.
Map the legacy boolean argument to `bypassCache` and preserve the existing
consumer-local abort semantics.

- [ ] **Step 3: Protect last-known-good refresh**

At the Noita refresh boundary, replace the active set only when the detailed
result is non-empty and not degraded according to the existing refresh policy.
Do not alter particle or parser code.

- [ ] **Step 4: Run Noita gates**

Run `pnpm --dir /home/myrqyry/MQR/noita-chat type-check` and
`pnpm --dir /home/myrqyry/MQR/noita-chat test -- --run`.

Expected: type-check clean and all tests pass.

### Task 8: Sketchy migration adapter

**Files:**
- Modify: `/home/myrqyry/MQR/sketchy-chat/utils/emoteLoader.ts`
- Modify: `/home/myrqyry/MQR/sketchy-chat/types.ts`
- Modify: relevant Sketchy loader tests, creating them if absent

- [ ] **Step 1: Add adapter regression tests**

Prove Sketchy receives global and channel FFZ, BTTV, and 7TV emotes, uses the
shared precedence rules, recognizes the shared 7TV zero-width interpretation,
and retains its `EmoteMap` shape for `chatParser.tsx`.

- [ ] **Step 2: Replace the loader internals**

Call `fetchChannelEmotesDetailed` from the shared package, map final emotes to
Sketchy's `EmoteEntry`, and retain only the local shape conversion. Reject a
degraded empty refresh in the owning refresh hook so the active map remains
last-known-good.

- [ ] **Step 3: Apply useful TMI configuration only if required by the existing hook**

Set `skipMembership`, `skipUpdatingEmotesets`, reduced message logging, and
capped reconnect backoff only where the current connection setup has a direct
configuration point. Do not migrate connection lifecycle in this stage.

- [ ] **Step 4: Run Sketchy gates**

Run `pnpm --dir /home/myrqyry/MQR/sketchy-chat typecheck` and
`pnpm --dir /home/myrqyry/MQR/sketchy-chat test -- --run`.

Expected: type-check clean and all tests pass.

### Task 9: Remove duplicated provider implementations

**Files:**
- Modify: `/home/myrqyry/MQR/noita-chat/services/emoteService.ts`
- Modify: `/home/myrqyry/MQR/sketchy-chat/utils/emoteLoader.ts`
- Modify: associated tests and local guidance only where references become stale

- [ ] **Step 1: Search for remaining provider endpoints**

Search both applications for `api.frankerfacez.com`, `api.betterttv.net`,
`7tv.io`, and `api.ivr.fi`.

Expected: only intentional adapter calls or test fixtures remain.

- [ ] **Step 2: Delete obsolete loader code**

Remove duplicated provider parsing, precedence constants, and direct network
fetches only after both application migrations pass their gates.

- [ ] **Step 3: Run full verification**

Run `pnpm --dir /home/myrqyry/MQR/chat-core typecheck`,
`pnpm --dir /home/myrqyry/MQR/chat-core test -- --run`,
`pnpm --dir /home/myrqyry/MQR/noita-chat type-check`,
`pnpm --dir /home/myrqyry/MQR/noita-chat test -- --run`,
`pnpm --dir /home/myrqyry/MQR/noita-chat build`,
`pnpm --dir /home/myrqyry/MQR/sketchy-chat typecheck`,
`pnpm --dir /home/myrqyry/MQR/sketchy-chat test -- --run`, and
`pnpm --dir /home/myrqyry/MQR/sketchy-chat build`.

Expected: every command succeeds and both overlays still consume their native
rendering models.

### Task 10: Final review and migration boundary record

**Files:**
- Modify: `/home/myrqyry/MQR/chat-core/README.md`
- Modify: `/home/myrqyry/MQR/noita-chat/SESSION-STATE.md`

- [ ] **Step 1: Document package usage**

Add a short README showing the public import, detailed result handling, and
the rule that applications retain last-known-good refresh policy.

- [ ] **Step 2: Record verified state**

Record the package path, workspace dependency, migrated applications, and
remaining later-stage work: normalized messages, zero-width clustering,
connection lifecycle, badges, paints, and processed-asset caching.

- [ ] **Step 3: Review the complete diff**

Confirm no renderer dependency entered `chat-core`, no provider precedence is
duplicated in either application, and all verification commands passed.
