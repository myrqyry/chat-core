# Chat core

`@myrqyry/chat-core` is the framework-neutral livestream chat substrate shared by
the Noita and Sketchy overlays. It owns native and third-party emote discovery,
message fragments, identity metadata, normalized chat events, platform
connection lifecycle, live provider state, capability planning, deterministic
test/replay utilities, and bounded chat timeline state while applications keep
their own rendering models.

## Emote loader

Use the convenience API when the application only needs the merged emote set:

```ts
import { fetchChannelEmotes } from '@myrqyry/chat-core';

const emotes = await fetchChannelEmotes('ExampleChannel');
```

Use the detailed API when the application needs provider health, cache state, or
the provider candidates needed to recompute precedence after a live update:

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

## Live 7TV updates

`connectSevenTvLive` keeps a channel's 7TV state current without polling. It
uses the 7TV V3 EventAPI heartbeat/session protocol, reconnects with backoff,
re-subscribes deterministically after each fresh HELLO, and applies
`emote_set.update` add/rename/remove changes incrementally.

```ts
import {
  connectSevenTvLive,
  fetchChannelEmotesDetailed,
  mergeCandidates,
  replaceSevenTvChannelCandidates,
} from '@myrqyry/chat-core';

const initial = await fetchChannelEmotesDetailed('ExampleChannel');
let candidates = initial.candidates ?? [];
let emotes = initial.emotes;

const live7tv = await connectSevenTvLive({
  platform: 'twitch',
  platformUserId: twitchUserId,
  cacheChannelName: 'ExampleChannel',
  onEmoteSetChange: (_sevenTvEmotes, info) => {
    candidates = replaceSevenTvChannelCandidates(candidates, info.candidates);
    emotes = mergeCandidates(candidates);
  },
});

// Later:
live7tv.close();
```

The live connection also invalidates cached 7TV user cosmetics when cosmetic or
entitlement events arrive. The connection accepts Twitch or Kick platform user
IDs, tracks active set reassignment through `user.update`, and re-subscribes
deterministically after reconnect instead of depending on unsupported session
resume behavior.

7TV has two different zero-width signals. Only the active-emote flag in the
current emote set means that the emote is actually configured as zero-width.
The base emote metadata's zero-width flag is only a recommendation and is not
used to force overlay behavior. Provider content metadata also preserves 7TV's
sexual, epilepsy, edgy, Twitch-disallowed, and listed flags without conflating
those flags with rendering behavior.

## Twitch EventSub chat

`connectTwitchChat()` uses Twitch's current EventSub WebSocket transport rather
than `tmi.js`. Supply a **user access token** with `user:read:chat` at runtime;
do not commit the token to an application bundle or repository.

```ts
import { connectTwitchChat } from '@myrqyry/chat-core';

const connection = await connectTwitchChat({
  channel: 'ExampleChannel',
  accessToken: twitchUserAccessToken,
  clientId: twitchClientId,
  userId: twitchUserId,
  onEvent: renderChatEvent,
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

### Rich Twitch message context

Normalized Twitch messages retain parent/thread reply context, Shared Chat
source provenance, badges, native emotes, mentions, Cheermotes, renderer-neutral
GIF/media fragments, and useful traits such as highlighted, first-message,
emote-only, and custom reward state.

Cheermotes can be enriched from Helix without a new OAuth scope or client
secret. `connectTwitchChat()` may load them in the background, or consumers can
inject their own `cheermotes` / `getCheermotes` cache. The connection also
retains the EventSub subscription records created for its current session:

```ts
console.log(connection.subscriptions());
console.log(connection.cheermotes());
```

Revocations remove the affected subscription from that state and can be
observed through `onSubscriptionStateChange`.

### Twitch native emote catalog and assets

The validated Twitch auth returned by `connectTwitchChat()` can also load
Twitch's global and broadcaster-created emote catalogs. These Helix endpoints do
not require an additional OAuth scope and do not require a client secret.

```ts
import {
  fetchTwitchEmoteCatalog,
  resolveTwitchEmoteAsset,
} from '@myrqyry/chat-core';

const catalog = await fetchTwitchEmoteCatalog(
  connection.auth,
  connection.channel.id,
);

const emote = catalog.emotes.Kappa;
const animatedDark2x = resolveTwitchEmoteAsset(
  catalog.entries.find((entry) => entry.name === emote.code)!,
  { animated: true, theme: 'dark', scale: 2 },
);
```

Catalog entries retain the formats, themes, and scales Twitch says are actually
available. `resolveTwitchEmoteAsset()` chooses a supported static/animated,
light/dark, and size variant with deterministic fallbacks. Normalized EventSub
native emotes use the same asset model and expose all known variants in
`Emote.images` instead of hard-coding presentation choices into the parser.

### Twitch capability planning

`planTwitchCapabilities()` is a pure permission/subscription planner. It records
EventSub type/version, condition shape, OAuth scope alternatives, and whether
`chat-core` currently normalizes that subscription.

```ts
import { planTwitchCapabilities } from '@myrqyry/chat-core';

const plan = planTwitchCapabilities(
  ['chat', 'followers', 'moderation'],
  {
    broadcasterUserId: channelId,
    userId: connection.auth.userId,
    scopes: connection.auth.scopes,
  },
);

for (const capability of plan.capabilities) {
  console.log(capability.id, capability.ready, capability.partial);
}
console.log(plan.missingScopeRequirements);
console.log(plan.suggestedScopes);
```

Capabilities whose EventSub payloads are not normalized by `chat-core` remain
descriptive instead of silently broadening the permissions or runtime behavior
of ordinary chat connections.

### Opt-in Hype Train events

Hype Train begin/progress/end are supported through Twitch's official EventSub
v2 subscriptions. They are intentionally opt-in and require
`channel:read:hype_train`; default chat still only needs `user:read:chat`.

```ts
import {
  DEFAULT_TWITCH_CHAT_SUBSCRIPTIONS,
  connectTwitchChat,
} from '@myrqyry/chat-core';

const connection = await connectTwitchChat({
  channel: 'ExampleChannel',
  accessToken: tokenWithChatAndHypeTrainScopes,
  subscriptions: [
    ...DEFAULT_TWITCH_CHAT_SUBSCRIPTIONS,
    'channel.hype_train.begin',
    'channel.hype_train.progress',
    'channel.hype_train.end',
  ],
  onEvent: (event) => {
    if (event.type === 'hype-train') {
      console.log(event.data);
    }
  },
});
```

All three phases normalize to `type: 'hype-train'` with structured level,
progress, goal, contribution, timing, train type, and shared-train metadata when
Twitch supplies it. Each notification is independently meaningful; consumers
must not assume `begin` always arrives before `progress`.

## Test, record, and replay normalized events

The testing helpers make overlay bugs reproducible without imposing a storage
backend on consumers.

```ts
import {
  ChatEventRecorder,
  createTestMessageEvent,
  replayChatEvent,
  serializeChatEvents,
  deserializeChatEvents,
} from '@myrqyry/chat-core';

const recorder = new ChatEventRecorder({ limit: 200 });
recorder.record(realEvent);

const fixture = createTestMessageEvent({ text: 'hello overlay' });
const replayed = replayChatEvent(fixture, { timestamp: Date.now() });

const saved = serializeChatEvents(recorder.snapshot(), 2);
const restored = deserializeChatEvents(saved);
```

`origin` distinguishes `live`, `test`, and `replay` events. Deserialization
structurally validates the typed event/message/user/emote surface before
narrowing input to `ChatEvent`; provider-specific `data` and `raw` remain
intentionally application-defined.

## Deterministic chat timeline

`ChatTimeline` reduces normalized events into bounded visible-chat state. The
default limit is 100 entries, entries stay timestamp-sorted, and moderation
mutations mark existing message entries deleted without destroying the
historical record.

```ts
import { ChatTimeline } from '@myrqyry/chat-core';

const timeline = new ChatTimeline({ limit: 100 });

timeline.apply(event);
render(timeline.visibleEvents());

const bootstrap = timeline.snapshot({ includeDeleted: true });
// Later, after loading application-owned storage:
timeline.restore(bootstrap);
```

`message-delete`, timeout/ban events, full chat clears, and per-user clears are
scoped by platform/channel and applied to prior message entries. Pure
`reduceChatTimeline()` and `reduceChatEvents()` helpers are available for apps
that prefer reducer-style state ownership.

This composes directly with recorder/replay: captured events can be replayed
through the same reducer to reproduce the visible overlay state that existed
when a bug occurred.

## Kick chat

`connectKickChat()` provides a browser-native Kick transport without pulling
Node-oriented `ws` or Axios dependencies into the package. It normalizes Kick
messages, native emotes, replies, badges/roles, deletes, bans/timeouts,
subscriptions, and gifted subscriptions into the same normalized contracts
used by Twitch. Host/pin/poll/unban payloads remain structured `system` events
instead of being mislabeled.

The Pusher lifecycle honors the negotiated `activity_timeout`, waits for the
handshake before subscribing, and only resets reconnect backoff after the
connection becomes genuinely usable.

## Precedence

Provider adapters return scoped candidates. The registry resolves normal
collisions using provider priority plus scope priority: native/platform emotes
rank above third-party providers, channel emotes outrank globals, and 7TV ranks
above BTTV above FFZ within comparable third-party scopes.

The final `EmoteSet` contains no internal scope metadata. Applications should
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

Later shared work can cover personal 7TV emote entitlements and provider
override semantics, additional authenticated Twitch moderation event
normalizers, processed-asset caching, more platform adapters, a separate shared
connection/relay companion, and platform-specific write/send APIs without
forcing those concerns into read-only overlay consumers.
