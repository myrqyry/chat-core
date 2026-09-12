import { describe, expect, it } from 'vitest';
import {
  normalizeTwitchEventSubNotification,
  parseTwitchEventSubFrame,
} from '../src/index';

const noticeEnvelope = (noticeType: string) => parseTwitchEventSubFrame(JSON.stringify({
  metadata: {
    message_id: `delivery-${noticeType}`,
    message_type: 'notification',
    message_timestamp: '2026-09-12T20:00:00Z',
    subscription_type: 'channel.chat.notification',
  },
  payload: {
    subscription: { type: 'channel.chat.notification' },
    event: {
      broadcaster_user_id: '10',
      broadcaster_user_login: 'streamer',
      notice_type: noticeType,
    },
  },
}));

describe('Twitch Codex review regressions', () => {
  it('keeps third-party modifiers attached across Twitch fragment boundaries', () => {
    const envelope = parseTwitchEventSubFrame(JSON.stringify({
      metadata: {
        message_id: 'delivery-overlay',
        message_type: 'notification',
        message_timestamp: '2026-09-12T20:00:00Z',
        subscription_type: 'channel.chat.message',
      },
      payload: {
        subscription: { type: 'channel.chat.message' },
        event: {
          broadcaster_user_id: '10',
          broadcaster_user_login: 'streamer',
          chatter_user_id: '20',
          chatter_user_login: 'viewer',
          chatter_user_name: 'Viewer',
          message_id: 'overlay-message',
          message: {
            text: 'Kappa Hat',
            fragments: [
              {
                type: 'emote',
                text: 'Kappa',
                emote: { id: '25', emote_set_id: '0', owner_id: '0', format: ['static'] },
              },
              { type: 'text', text: ' Hat' },
            ],
          },
          color: '#00FF7F',
          badges: [],
          message_type: 'text',
        },
      },
    }));

    expect(envelope).not.toBeNull();
    const event = normalizeTwitchEventSubNotification(envelope!, {
      emotes: {
        Hat: {
          id: 'hat-1',
          code: 'Hat',
          url: 'https://example.com/hat.webp',
          zeroWidth: true,
          modifier: 'overlay',
          provider: '7tv',
        },
      },
    });

    expect(event?.message?.fragments).toEqual([
      expect.objectContaining({
        type: 'emote',
        text: 'Kappa',
        overlays: [expect.objectContaining({ id: 'hat-1', code: 'Hat', provider: '7tv' })],
      }),
    ]);
  });

  it('classifies paid upgrades as subscriptions while real gifts remain gifts', () => {
    for (const noticeType of [
      'gift_paid_upgrade',
      'prime_paid_upgrade',
      'shared_chat_gift_paid_upgrade',
      'shared_chat_prime_paid_upgrade',
    ]) {
      const envelope = noticeEnvelope(noticeType);
      expect(envelope).not.toBeNull();
      expect(normalizeTwitchEventSubNotification(envelope!)).toMatchObject({
        type: 'subscription',
        data: { noticeType },
      });
    }

    for (const noticeType of [
      'sub_gift',
      'pay_it_forward',
      'shared_chat_sub_gift',
      'shared_chat_pay_it_forward',
    ]) {
      const envelope = noticeEnvelope(noticeType);
      expect(envelope).not.toBeNull();
      expect(normalizeTwitchEventSubNotification(envelope!)).toMatchObject({
        type: 'gift-subscription',
        data: { noticeType },
      });
    }
  });
});
