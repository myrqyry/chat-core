import { describe, expect, it } from 'vitest';
import {
  ChatTimeline,
  createTestChatEvent,
  createTestMessageEvent,
  reduceChatEvents,
} from '../src/index';

describe('ChatTimeline', () => {
  it('keeps deterministic timestamp order and trims the oldest entries by time', () => {
    const entries = reduceChatEvents([
      createTestMessageEvent({ messageId: 'late', timestamp: 30 }),
      createTestMessageEvent({ messageId: 'early', timestamp: 10 }),
      createTestMessageEvent({ messageId: 'middle', timestamp: 20 }),
    ], { limit: 2 });

    expect(entries.map((entry) => entry.event.message?.id)).toEqual(['middle', 'late']);
  });

  it('marks message deletions without destroying the captured event', () => {
    const timeline = new ChatTimeline();
    timeline.apply(createTestMessageEvent({
      platform: 'twitch',
      channelId: 'channel-1',
      messageId: 'message-1',
      timestamp: 10,
    }));
    timeline.apply(createTestChatEvent('message-delete', {
      id: 'delete-event',
      platform: 'twitch',
      channelId: 'channel-1',
      timestamp: 20,
      data: { messageId: 'message-1' },
    }));

    expect(timeline.snapshot()).toMatchObject([{
      deleted: true,
      event: { message: { id: 'message-1' } },
      deletion: {
        reason: 'message-delete',
        timestamp: 20,
        eventId: 'delete-event',
      },
    }]);
    expect(timeline.visibleEvents()).toEqual([]);
  });

  it('scopes timeout and ban removals by platform, channel, and target user', () => {
    const timeline = new ChatTimeline();
    timeline.applyMany([
      createTestMessageEvent({
        platform: 'twitch', channelId: 'one', messageId: 'target', userId: 'user-1', username: 'same',
      }),
      createTestMessageEvent({
        platform: 'twitch', channelId: 'one', messageId: 'other-user', userId: 'user-2', username: 'other',
      }),
      createTestMessageEvent({
        platform: 'twitch', channelId: 'two', messageId: 'other-channel', userId: 'user-1', username: 'same',
      }),
      createTestMessageEvent({
        platform: 'kick', channelId: 'one', messageId: 'other-platform', userId: 'user-1', username: 'same',
      }),
    ]);

    timeline.apply(createTestChatEvent('user-timeout', {
      platform: 'twitch',
      channelId: 'one',
      timestamp: 100,
      user: { platform: 'twitch', id: 'user-1', username: 'same' },
    }));

    const states = Object.fromEntries(timeline.snapshot().map((entry) => [entry.event.message?.id, entry.deleted]));
    expect(states).toEqual({
      target: true,
      'other-user': false,
      'other-channel': false,
      'other-platform': false,
    });

    timeline.apply(createTestChatEvent('user-ban', {
      platform: 'twitch',
      channelId: 'one',
      timestamp: 110,
      data: { targetUsername: 'other' },
    }));
    expect(timeline.visibleEvents().map((event) => event.message?.id).sort()).toEqual([
      'other-channel',
      'other-platform',
    ]);
  });

  it('applies Twitch user clears and whole-chat clears to existing message state', () => {
    const timeline = new ChatTimeline();
    timeline.applyMany([
      createTestMessageEvent({
        platform: 'twitch', channelId: 'channel-1', messageId: 'one', userId: 'user-1', timestamp: 1,
      }),
      createTestMessageEvent({
        platform: 'twitch', channelId: 'channel-1', messageId: 'two', userId: 'user-2', timestamp: 2,
      }),
      createTestChatEvent('subscription', {
        platform: 'twitch', channelId: 'channel-1', id: 'sub', timestamp: 3,
      }),
    ]);

    timeline.apply(createTestChatEvent('system', {
      platform: 'twitch',
      channelId: 'channel-1',
      timestamp: 4,
      data: { kind: 'chat-clear-user', targetUserId: 'user-1' },
    }));
    expect(timeline.snapshot().find((entry) => entry.event.message?.id === 'one')?.deletion?.reason)
      .toBe('chat-clear-user');
    expect(timeline.snapshot().find((entry) => entry.event.message?.id === 'two')?.deleted).toBe(false);

    timeline.apply(createTestChatEvent('system', {
      platform: 'twitch',
      channelId: 'channel-1',
      timestamp: 5,
      data: { kind: 'chat-clear' },
    }));

    expect(timeline.snapshot().filter((entry) => entry.event.message).every((entry) => entry.deleted)).toBe(true);
    expect(timeline.snapshot().find((entry) => entry.event.id === 'sub')?.deleted).toBe(false);
  });

  it('restores bounded state and supports channel-scoped bootstrap snapshots', () => {
    const source = new ChatTimeline({ limit: 4 });
    source.applyMany([
      createTestMessageEvent({ platform: 'twitch', channelId: 'a', messageId: 'a2', timestamp: 20 }),
      createTestMessageEvent({ platform: 'kick', channelId: 'b', messageId: 'b1', timestamp: 10 }),
      createTestMessageEvent({ platform: 'twitch', channelId: 'a', messageId: 'a1', timestamp: 15 }),
    ]);
    source.apply(createTestChatEvent('message-delete', {
      platform: 'twitch', channelId: 'a', timestamp: 25, data: { messageId: 'a1' },
    }));

    const restored = new ChatTimeline({ limit: 2 });
    restored.restore(source.snapshot());

    expect(restored.snapshot().map((entry) => entry.event.message?.id)).toEqual(['a1', 'a2']);
    expect(restored.snapshot({
      includeDeleted: false,
      platform: 'twitch',
      channelId: 'a',
    }).map((entry) => entry.event.message?.id)).toEqual(['a2']);
  });
});
