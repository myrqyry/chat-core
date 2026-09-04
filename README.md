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

## Precedence

Provider adapters return scoped candidates. The registry resolves collisions in
this order:

1. Custom and native emotes.
2. Channel emotes over global emotes.
3. 7TV over BTTV over FFZ within the same scope.

The final `EmoteSet` contains no internal scope metadata. Applications must
retain a non-empty last-known-good set when a refresh reports `complete: false`.

## Development

Run these commands from `/home/myrqyry/MQR/chat-core`:

```bash
pnpm typecheck
pnpm test -- --run
```

The package is a sibling workspace member. It is intentionally not a separate
Git repository; application repositories track their own integration changes.

## Next steps

Later shared work can cover normalized message contracts, zero-width clustering,
connection lifecycle, badges, paints, and processed-asset caching.
