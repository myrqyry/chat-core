# AGENTS.md — `src/platforms/twitch/`

EventSub WebSocket transport (`connectTwitchChat()`), not `tmi.js`. Needs runtime **user access token** with `user:read:chat`; never commit tokens.

## Subscriptions

- Default set: messages, deletes, notifications (subs/gifts/raids), settings, full clears, per-user clears. Duplicates suppressed by `message_id`. Server reconnect URLs = handoff (old socket lives until new welcome).
- `connection.subscriptions()` / `cheermotes()` / `onSubscriptionStateChange` expose session state; revocations drop from state.
- Cheermote enrichment from Helix needs no extra scope/secret; may load in background or via injected `cheermotes`/`getCheermotes`.

## Capabilities (`planTwitchCapabilities()`)

Pure planner: records EventSub type/version, condition shape, scope alternatives, whether Chatbus normalizes it. Un-normalized capabilities stay descriptive — never silently broaden permissions/runtime of a chat connection.

## Hype Train (opt-in)

`channel.hype_train.begin/progress/end` (EventSub v2, needs `channel:read:hype_train`; default chat needs only `user:read:chat`). All normalize to `type: 'hype-train'`; each notification stands alone — never assume `begin` precedes `progress`.

## Catalog

`fetchTwitchEmoteCatalog()` (global + broadcaster, no extra scope/secret). `resolveTwitchEmoteAsset()` picks supported static/animated × light/dark × scale with deterministic fallbacks. Normalized native emotes reuse this model via `Emote.images`.

Contracts: `docs/twitch-capabilities-and-replay.md`, `docs/chat-timeline-and-hype-train.md`.
