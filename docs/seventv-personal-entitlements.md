# 7TV personal entitlements

`chat-core` keeps 7TV channel emotes and user-personal emotes as separate state.

## Why they are separate

7TV personal emotes are entitlements for a specific platform identity. They are not channel-wide candidates and should not be inserted into `fetchChannelEmotes()` or a shared channel emote map.

`connectSevenTvLive()` now tracks `entitlement.create`, `entitlement.delete`, and `entitlement.reset` dispatches for the active channel context. `EMOTE_SET` entitlements are loaded as `user`-scope candidates and kept per platform user id.

```ts
const sevenTv = await connectSevenTvLive({
  platform: 'twitch',
  platformUserId: broadcasterId,
});

const twitch = await connectTwitchChat({
  channel,
  accessToken,
  getEmotes: () => channelEmotes,
  getUserEmotes: (userId) => sevenTv.personalEmotes(userId),
  onEvent,
});
```

Sender-local emotes win over third-party channel/global text matches, while Twitch fragments explicitly marked as native remain authoritative.

The live connection also exposes:

- `entitlements(userId?)`
- `personalCandidates(userId)`
- `personalEmotes(userId)`
- `onEntitlementsChange`

The standalone `SevenTvEntitlementStore` can be used without opening a socket when an application already owns EventAPI delivery.

## Grant/revoke reconciliation

`SevenTvEntitlementStore.applyDispatches()` applies a batch to final state before loading or unloading emote sets. A revoke followed by an identical re-grant in the same batch therefore produces no false removal/reload transition.

## 7TV active-emote override flags

The current active-set flags preserved by `chat-core` are:

- zero-width: `1 << 0`
- pending: `1 << 8`
- override Twitch global: `1 << 16`
- override Twitch subscriber/channel: `1 << 17`
- override BetterTTV: `1 << 18`
- override FrankerFaceZ: `1 << 19`

The active zero-width bit remains distinct from base emote `data.flags` bit 8. A base recommendation never turns an emote into an overlay unless the active set enables zero-width.

`mergeCandidates()` honors explicit 7TV provider overrides before normal provider/scope scores. Without an override bit, Twitch continues to outrank 7TV under the default precedence table.

## Deliberate boundaries

This support does not add IndexedDB, extension state, DOM injection, or 7TV's browser-extension presence lifecycle to core. Applications remain responsible for persistence and UI behavior. Personal state is populated from entitlement dispatches observed by the EventAPI connection.
