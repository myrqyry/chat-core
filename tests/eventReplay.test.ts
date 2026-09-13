import { describe, expect, it } from 'vitest';
import {
  ChatEventRecorder,
  chatEventOrigin,
  createTestChatEvent,
  createTestMessageEvent,
  deserializeChatEvent,
  deserializeChatEvents,
  replayChatEvent,
  serializeChatEvent,
} from '../src/index';

describe('chat event test and replay helpers', () => {
  it('builds deterministic test events without wall-clock or random defaults', () => {
    expect(createTestChatEvent('raid')).toEqual({
      id: 'test:custom:raid',
      type: 'raid',
      platform: 'custom',
      timestamp: 0,
      origin: 'test',
    });

    const message = createTestMessageEvent({
      platform: 'twitch',
      channelId: 'channel-1',
      channelName: 'example',
      text: 'hello chat',
    });

    expect(message).toMatchObject({
      id: 'test-message',
      type: 'message',
      platform: 'twitch',
      timestamp: 0,
      origin: 'test',
      user: { id: 'test-user', username: 'test-user' },
      message: {
        id: 'test-message',
        text: 'hello chat',
        timestamp: 0,
        fragments: [{ type: 'text', text: 'hello chat' }],
      },
    });
  });

  it('marks replayed events explicitly and keeps message time aligned when overridden', () => {
    const source = createTestMessageEvent({ timestamp: 10, text: 'replay me' });
    const replay = replayChatEvent(source, { timestamp: 20, id: 'replayed-event' });

    expect(replay).toMatchObject({
      id: 'replayed-event',
      timestamp: 20,
      origin: 'replay',
      message: { timestamp: 20, text: 'replay me' },
    });
    expect(chatEventOrigin({ ...source, origin: undefined })).toBe('live');
    expect(chatEventOrigin(replay)).toBe('replay');
  });

  it('round-trips recorded events and retains only the ring-buffer tail', () => {
    const recorder = new ChatEventRecorder({ limit: 2 });
    recorder.record(createTestChatEvent('subscription', { id: 'one' }));
    recorder.record(createTestChatEvent('cheer', { id: 'two' }));
    recorder.record(createTestChatEvent('raid', { id: 'three' }));

    expect(recorder.size).toBe(2);
    expect(recorder.snapshot().map((event) => event.id)).toEqual(['two', 'three']);
    expect(deserializeChatEvents(recorder.serialize()).map((event) => event.id)).toEqual(['two', 'three']);

    recorder.clear();
    expect(recorder.size).toBe(0);
  });

  it('validates serialized event envelopes before returning them', () => {
    const event = createTestChatEvent('stream-online', {
      platform: 'twitch',
      channelId: '123',
    });
    expect(deserializeChatEvent(serializeChatEvent(event))).toEqual(event);

    expect(() => deserializeChatEvent(JSON.stringify({
      type: 'not-a-real-event',
      platform: 'twitch',
      timestamp: 0,
    }))).toThrow(TypeError);

    expect(() => deserializeChatEvents('{}')).toThrow(TypeError);
  });
});
