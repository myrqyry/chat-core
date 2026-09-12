import { describe, expect, it } from 'vitest';
import {
  normalizeKickEvent,
  parseKickMessageContent,
  parseKickPusherFrame,
} from '../src/index';

describe('Kick protocol', () => {
  it('parses supported Pusher events and ignores control or malformed frames', () => {
    const frame = JSON.stringify({
      event: 'App\\Events\\ChatMessageEvent',
      data: JSON.stringify({
        id: 'message-1',
        chatroom_id: 42,
        content: 'hello',
        created_at: '2026-09-12T18:00:00Z',
        sender: { id: 7, username: 'viewer' },
      }),
    });

    expect(parseKickPusherFrame(frame)).toMatchObject({
      type: 'ChatMessage',
      data: { id: 'message-1', content: 'hello' },
    });
    expect(parseKickPusherFrame(JSON.stringify({ event: 'pusher:ping', data: '{}' }))).toBeNull();
    expect(parseKickPusherFrame(JSON.stringify({
      event: 'App\\Events\\ChatMessageEvent',
      data: JSON.stringify({ id: 'broken' }),
    }))).toBeNull();
  });
});

describe('Kick emotes', () => {
  it('turns native markers into display text plus native emote spans', () => {
    const parsed = parseKickMessageContent('yo [emote:37226:KEKW] wow');

    expect(parsed.text).toBe('yo KEKW wow');
    expect(parsed.nativeEmotes).toHaveLength(1);
    expect(parsed.nativeEmotes[0]).toMatchObject({
      id: '37226',
      start: 3,
      end: 6,
      provider: 'kick',
      emote: {
        id: '37226',
        code: 'KEKW',
        provider: 'kick',
        url: 'https://d2egosedh0nm8l.cloudfront.net/emotes/37226/fullsize',
      },
    });
  });
});

describe('Kick normalization', () => {
  it('normalizes messages, native emotes, badges, and replies', () => {
    const event = normalizeKickEvent({
      type: 'ChatMessage',
      data: {
        id: 'message-1',
        chatroom_id: 42,
        content: 'yo [emote:37226:KEKW]',
        created_at: '2026-09-12T18:00:00Z',
        sender: {
          id: 7,
          username: 'viewer',
          identity: {
            color: '#53fc18',
            badges: [{ type: 'subscriber', text: 'Subscriber', count: 3 }],
          },
        },
        metadata: {
          original_message: { id: 'parent-1', content: 'hey' },
        },
      },
    }, { channelName: 'example' });

    expect(event).toMatchObject({
      id: 'message-1',
      type: 'message',
      platform: 'kick',
      channelId: '42',
      channelName: 'example',
      user: {
        id: '7',
        username: 'viewer',
        roles: ['subscriber'],
        badgeRefs: [{ id: 'subscriber', provider: 'kick', version: '3' }],
      },
      message: {
        text: 'yo KEKW',
        replyToMessageId: 'parent-1',
      },
    });
    expect(event?.message?.fragments[1]).toMatchObject({
      type: 'emote',
      text: 'KEKW',
      emote: { id: '37226', provider: 'kick' },
    });
  });

  it('keeps Kick host/poll/pin semantics as system events instead of calling them raids', () => {
    expect(normalizeKickEvent({
      type: 'StreamHost',
      data: { host_username: 'hoster', number_viewers: 12 },
    }, { now: () => 123 })).toMatchObject({
      type: 'system',
      timestamp: 123,
      data: { kind: 'host', host_username: 'hoster', number_viewers: 12 },
    });
  });
});
