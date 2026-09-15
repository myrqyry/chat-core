# AGENTS.md — `src/seventv/`

`connectSevenTvLive()` keeps channel 7TV state current without polling: V3 EventAPI heartbeat/session, backoff reconnects, deterministic re-subscribe after each fresh HELLO (no session resume), incremental `emote_set.update` add/rename/remove.

## Wiring

```ts
const live7tv = await connectSevenTvLive({ platform, platformUserId, cacheChannelName, onEmoteSetChange });
candidates = replaceSevenTvChannelCandidates(candidates, info.candidates);
emotes = mergeCandidates(candidates);
```

Tracks active emote-set reassignment via `user.update`; invalidates cached cosmetics on relevant events. Accepts Twitch or Kick user IDs. Always `live7tv.close()`.

## Entitlements (personal emotes)

Sender-specific, not channel-wide. Tracks `entitlement.create/delete/reset`, keyed by platform user identity. Feed into Twitch via `getUserEmotes: (id) => sevenTv.personalEmotes(id)`; exposes `entitlements()`, `personalCandidates()`, `personalEmotes()`. Headless apps can use `SevenTvEntitlementStore` directly.

## Flags

- Zero-width: only the active-emote flag in the current set means overlay; base-metadata flag is a recommendation, never forces behavior.
- Preserve 7TV content flags (sexual, epilepsy, edgy, Twitch-disallowed, listed) without affecting rendering.
- Active-emote provider override flags survive for Twitch global/subscriber, BTTV, FFZ collisions (see `src/emotes/AGENTS.md`).

Contract: `docs/seventv-personal-entitlements.md`.
