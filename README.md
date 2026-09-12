# Chat core

`@myrqyry/chat-core` is the framework-neutral livestream chat substrate shared by
the Noita and Sketchy overlays. It owns native and third-party emote discovery,
message fragments, identity metadata, normalized chat events, and platform
connection lifecycle while applications keep their own rendering models.

## Emote loader

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

## Twitch EventSub chat

`connectTwitchChat()` uses Twitch's current EventSub WebSocket transport rather
than `tmi.js`. Supply a **user access token** with `user:read:chat` at runtime;
do not commit the token to an application bundle or repository.

```ts
import { connectTwitchChat } from '@myrqyry/chat-core';

const connection = await connectTwitchChat({
  channel: 'ExampleChannel',
  accessToken: twitchUserAccessToken,
  // clientId and userId are optional: chat-core validates the token and can
  // derive both. Supplying them adds mismatch checks.
  clientId: twitchClientId,
  userId: twitchUserId,
  onEvent: (event) => {
    renderChatEvent(event);
  },
  onStateChange: (state) => {
    console.log('twitch chat:', state);
  },
});

connection.close();
```

The default subscription set covers chat messages, message deletion, chat
notifications (subs/gifts/raids/etc.), chat settings, full chat clears, and
per-user message clears. EventSub duplicate deliveries are suppressed by
`message_id`. Server-directed reconnect URLs are handled as handoffs so the old
socket stays alive until Twitch welcomes the replacement connection.

Message normalization preserves Twitch native emotes, mentions, Cheermotes,
badges, replies, and useful message traits such as highlighted messages,
first-time user intros, emote-only messages, and custom reward IDs. Unrecognized
or richer Twitch payloads remain available in `raw` rather than being
misrepresented as another event type.

## Kick chat

`connectKickChat()` provides a browser-native Kick transport without pulling
Node-oriented `ws` or Axios dependencies into the package. It normalizes Kick
messages and native emotes into the same `ChatEvent` and `ChatMessage`
contracts used by Twitch.

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

`chat-core` lives in its own Git repository. The Noita and Sketchy overlays
consume pinned Git commits of this package, so application dependency pins must
be advanced deliberately after a verified chat-core change lands.

## Next steps

Later shared work can cover additional authenticated Twitch moderation events,
processed-asset caching, and platform-specific write/send APIs without forcing
those concerns into read-only overlay consumers.
