# Chat core

`@myrqyry/chat-core` is the framework-neutral livestream chat substrate shared by
the Noita and Sketchy overlays. It owns native and third-party emote discovery,
message fragments, identity metadata, normalized chat events, platform
connection lifecycle, live provider state, capability planning, and deterministic
test/replay utilities while applications keep their own rendering models.

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

The live connection accepts Twitch or Kick platform user IDs, tracks active
emote-set reassignment through `user.update`, invalidates cached 7TV cosmetics
when relevant events arrive, and replays desired subscriptions after each fresh
HELLO rather than pretending EventAPI session resume is supported.

7TV has two different zero-width signals. Only the active-emote flag in the
current emote set means that the emote is actually configured as zero-width.
The base emote metadata's zero-width flag is only a recommendation and is not
used to force overlay behavior. Provider content metadata also preserves 7TV's
sexual, epilepsy, edgy, Twitch-disallowed, and listed flags without conflating
those flags with rendering behavior.

### Personal 7TV emotes and entitlements

Personal 7TV emotes are sender-specific entitlements, not channel-wide emotes.
`connectSevenTvLive()` tracks `entitlement.create`, `entitlement.delete`, and
`entitlement.reset` dispatches and keeps personal `EMOTE_SET` grants keyed by
platform user identity.

Wire the per-user map into Twitch normalization with `getUserEmotes`:

```ts
const sevenTv = await connectSevenTvLive({
  platform: 'twitch',
  platformUserId: broadcasterId,
});

const twitch = await connectTwitchChat({
  channel: 'ExampleChannel',
  accessToken: twitchUserAccessToken,
  getEmotes: () => channelEmotes,
  getUserEmotes: (userId) => sevenTv.personalEmotes(userId),
  onEvent: renderChatEvent,
});
```

Sender-local emotes win over shared third-party channel/global text matches,
while Twitch fragments explicitly marked as native stay authoritative. The live
7TV connection exposes `entitlements(userId?)`, `personalCandidates(userId)`,
and `personalEmotes(userId)`; applications that already own EventAPI delivery
can use `SevenTvEntitlementStore` directly instead.

7TV active-emote provider override flags are preserved for Twitch global,
Twitch subscriber/channel, BetterTTV, and FrankerFaceZ collisions. Explicit
7TV override flags are applied before the normal provider/scope score, while
the active zero-width flag remains independent from all override metadata.

See [7TV personal entitlements](docs/seventv-personal-entitlements.md) for the
state model, reconciliation behavior, and flag mapping.

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

Normalized Twitch messages retain more than display text. `ChatMessage.reply`
contains parent and thread-root context, Shared Chat provenance is exposed
through `ChatMessage.source`, GIF fragments become renderer-neutral `media`
fragments, and message traits preserve highlighted, first-message, emote-only,
and custom reward state.

Cheermotes can be enriched from Helix without an extra OAuth scope or client
secret. `connectTwitchChat()` can load them in the background, or consumers can
inject their own `cheermotes` / `getCheermotes` cache. The connection also
retains the EventSub subscription records created for the current session:

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

`planTwitchCapabilities()` is a pure permission/subscription planner. It knows
which EventSub types, versions, conditions, and OAuth scope groups belong to
capabilities such as chat, channel state, stream state, followers, and
moderation, without automatically requesting broader permissions or creating
subscriptions.

```ts
import { planTwitchCapabilities } from '@myrqyry/chat-core';

const plan = planTwitchCapabilities(
  ['chat', 'followers', 'moderation'],
  {
    broadcasterUserId: channelId,
    userId: connection.auth.userId,
    moderatorUserId: connection.auth.userId,
    grantedScopes: connection.auth.scopes,
  },
);

console.log(plan.ready);
console.log(plan.blocked);
console.log(plan.missingScopes);
```

Capabilities whose EventSub payloads are not normalized by `chat-core` remain
descriptive instead of silently becoming active runtime behavior.

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

## Kick chat

`connectKickChat()` provides a browser-native Kick transport without pulling
Node-oriented `ws` or Axios dependencies into the package. It normalizes Kick
messages, native emotes, replies, badges/roles, deletes, bans/timeouts,
subscriptions, and gifted subscriptions into the same `ChatEvent` contracts
used by Twitch. Host/pin/poll/unban payloads remain structured `system` events
instead of being mislabeled.

The Pusher lifecycle honors the negotiated `activity_timeout`, delays channel
subscription until the handshake arrives, and only resets reconnect backoff
after the connection becomes genuinely usable.

## Precedence

Provider adapters return scoped candidates. Normal precedence is resolved from
provider priority plus scope priority; user/channel candidates outrank global
candidates within otherwise comparable providers. By default Twitch/native
platform emotes outrank 7TV, which outranks BTTV, which outranks FFZ.

Two explicit exceptions are handled before the normal score:

1. Sender-local personal emotes are resolved before shared third-party text
   matches, while platform-native message fragments remain authoritative.
2. A 7TV active emote carrying the relevant provider override flag may replace
   the matching Twitch global/subscriber, BTTV, or FFZ candidate.

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

Later shared work can cover additional authenticated Twitch moderation event
normalizers, processed-asset caching, more platform adapters, a separate shared
connection/relay companion, and platform-specific write/send APIs without
forcing those concerns into read-only overlay consumers.
