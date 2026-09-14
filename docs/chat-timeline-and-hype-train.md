# Chat timeline state and Twitch Hype Train

`Chatbus` can keep a deterministic, bounded view of renderable chat events without imposing a UI, persistence layer, or relay server.

## ChatTimeline

```ts
import { ChatTimeline } from '@myrqyry/chatbus';

const timeline = new ChatTimeline({ limit: 100 });

connection.onEvent = (event) => {
  timeline.apply(event);
  render(timeline.visibleEvents());
};
```

`ChatTimeline` stores normalized `ChatEvent`s in timestamp order. It understands the moderation/lifecycle events that change already-visible chat state:

- `message-delete` marks the matching message deleted.
- `user-timeout` and `user-ban` mark matching messages from that user in the same platform/channel.
- Twitch `chat-clear-user` system events mark that user's existing messages deleted.
- Twitch `chat-clear` system events mark all existing messages in that channel deleted.

Deleted entries remain in `snapshot()` with deletion metadata so applications can animate removals, inspect moderation history, or reproduce bugs. `visibleEvents()` returns the non-deleted feed.

`reduceChatTimeline()` and `reduceChatEvents()` expose the same behavior as pure reducer functions. `restore()` accepts a previous timeline snapshot, sorts it deterministically by timestamp, and reapplies the configured bound.

The default limit is 100 entries. No state is written to disk; applications choose whether and where to persist snapshots.

## Twitch Hype Train

Hype Train support uses Twitch's official EventSub WebSocket subscriptions and is opt-in. It is not added to the default chat subscription set.

```ts
import {
  DEFAULT_TWITCH_CHAT_SUBSCRIPTIONS,
  TWITCH_HYPE_TRAIN_SUBSCRIPTIONS,
  connectTwitchChat,
} from '@myrqyry/chatbus';

const connection = await connectTwitchChat({
  channel: 'example',
  accessToken,
  subscriptions: [
    ...DEFAULT_TWITCH_CHAT_SUBSCRIPTIONS,
    ...TWITCH_HYPE_TRAIN_SUBSCRIPTIONS,
  ],
  onEvent(event) {
    if (event.type === 'hype-train') {
      console.log(event.data);
    }
  },
});
```

The token must include `channel:read:hype_train` when any Hype Train subscription is requested. Ordinary `connectTwitchChat()` usage keeps the existing default chat subscriptions and does not require that scope.

The three subscriptions are:

- `channel.hype_train.begin` v2
- `channel.hype_train.progress` v2
- `channel.hype_train.end` v2

All normalize to `ChatEvent<HypeTrainData>` with `type: 'hype-train'` and a `phase` of `begin`, `progress`, or `end`. Progress/goal, contributions, shared-train participants, timing, train type, and all-time-high fields are preserved when Twitch supplies them.

Do not assume phase delivery order. Twitch documents that a progress notification can arrive before the corresponding begin notification, so each normalized Hype Train event is independently usable.
