import { describe, expect, it } from 'vitest';
import { mergeCandidates } from '../src/emotes/registry';
import type { EmoteCandidate } from '../src/types/emotes';

const candidate = (overrides: Partial<EmoteCandidate>): EmoteCandidate => ({
  code: 'Kappa',
  id: 'default',
  url: 'https://example.com/emote.png',
  zeroWidth: false,
  provider: 'ffz',
  scope: 'global',
  ...overrides,
});

describe('mergeCandidates', () => {
  it('prefers custom and native candidates over third-party candidates', () => {
    const result = mergeCandidates([
      candidate({ id: 'global', scope: 'global' }),
      candidate({ id: 'channel', scope: 'channel' }),
      candidate({ id: 'native', provider: 'twitch', scope: 'native' }),
      candidate({ id: 'custom', provider: 'custom', scope: 'custom' }),
    ]);

    expect(result.Kappa.id).toBe('custom');
    expect(result.Kappa).not.toHaveProperty('scope');
  });

  it('uses provider precedence within the same scope', () => {
    const result = mergeCandidates([
      candidate({ provider: 'ffz', scope: 'channel', id: 'ffz' }),
      candidate({ provider: 'bttv', scope: 'channel', id: 'bttv' }),
      candidate({ provider: '7tv', scope: 'channel', id: '7tv' }),
    ]);

    expect(result.Kappa.id).toBe('7tv');
  });

  it('prefers a channel emote over a higher-priority global provider', () => {
    const result = mergeCandidates([
      candidate({ provider: '7tv', scope: 'global', id: '7tv-global' }),
      candidate({ provider: 'ffz', scope: 'channel', id: 'ffz-channel' }),
    ]);

    expect(result.Kappa.id).toBe('ffz-channel');
  });

  it('prefers a sender-local user emote over channel and global emotes', () => {
    const result = mergeCandidates([
      candidate({ provider: '7tv', scope: 'global', id: '7tv-global' }),
      candidate({ provider: '7tv', scope: 'channel', id: '7tv-channel' }),
      candidate({ provider: 'ffz', scope: 'user', id: 'ffz-user' }),
    ]);

    expect(result.Kappa.id).toBe('ffz-user');
  });

  it('honors an explicit 7TV provider override before normal scope precedence', () => {
    const result = mergeCandidates([
      candidate({ provider: 'twitch', scope: 'channel', id: 'twitch-sub' }),
      candidate({
        provider: '7tv',
        scope: 'global',
        id: '7tv-override',
        overrides: { twitchSubscriber: true },
      }),
    ]);

    expect(result.Kappa.id).toBe('7tv-override');
  });

  it('keeps the first candidate when scope and provider priority tie', () => {
    const result = mergeCandidates([
      candidate({ id: 'first', provider: 'ffz', scope: 'channel' }),
      candidate({ id: 'second', provider: 'ffz', scope: 'channel' }),
    ]);

    expect(result.Kappa.id).toBe('first');
  });

  it('applies custom scope priority before custom provider priority', () => {
    const result = mergeCandidates([
      candidate({ id: 'ffz-channel', provider: 'ffz', scope: 'channel' }),
      candidate({ id: '7tv-global', provider: '7tv', scope: 'global' }),
    ], {
      providerPriority: { '7tv': 10_000 },
      scopePriority: { channel: 100, global: 10 },
    });

    expect(result.Kappa.id).toBe('ffz-channel');
  });

  it('skips invalid candidates', () => {
    const result = mergeCandidates([
      candidate({ code: '', id: 'empty' }),
      candidate({ id: 'bad', url: 'javascript:alert(1)' }),
    ]);

    expect(result).toEqual({});
  });
});
