# Chat core

`@myrqyry/chat-core` provides framework-neutral Twitch and third-party emote
discovery for the Noita and Sketchy overlays. It owns provider parsing,
precedence, bounded network requests, cache records, and shared in-flight
requests. Applications keep their own rendering and message parsing models.

## Use the loader

Use the convenience API when the application only needs the merged emote set:

```ts
import { fetchChannelEmotes } from '@myrqyry/chat-core';

const emotes = await fetchChannelEmotes('ExampleChannel');
```

Use the detailed API when the application needs provider health or cache state:

```ts
import { fetchChannelEmotesDetailed } from '@myrqyry/chat-core';

const result = await fetchChannelEmotesDetailed('ExampleChannel', {
  signal: connectionAbortController.signal,
});

if (!result.complete) {
  // Keep the application's last-known-good set during refresh.
}
```

Channel names are normalized with `trim().toLowerCase()` for cache and
in-flight request identity. A consumer abort only rejects that consumer's
promise; it does not cancel a request shared with other consumers.

A missing optional provider account is treated as an empty successful channel
result. Actual provider/network failures set `complete: false`. Degraded
results are returned to the current caller but are not cached, so a later
refresh can retry the failed provider instead of replaying the degraded result
for the full cache lifetime.

## Precedence

Provider adapters return scoped candidates. The registry resolves collisions in
this order:

1. Custom and native emotes.
2. Channel emotes over global emotes.
3. 7TV over BTTV over FFZ within the same scope.

The final `EmoteSet` contains no internal scope metadata. Applications must
retain a non-empty last-known-good set when a refresh reports `complete: false`.

## Development

Run these commands from the repository root:

```bash
pnpm typecheck
pnpm test
```

`chat-core` now lives in its own Git repository. The Noita and Sketchy overlays
currently consume a pinned Git commit of this package, so application dependency
pins must be advanced deliberately after a verified chat-core change lands.

## Next steps

Later shared work can cover normalized message contracts, zero-width clustering,
connection lifecycle, badges, paints, and processed-asset caching.
