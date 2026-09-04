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

  it('uses provider precedence within a scope', () => {
    const result = mergeCandidates([
      candidate({ provider: 'ffz', scope: 'channel', id: 'ffz' }),
      candidate({ provider: 'bttv', scope: 'channel', id: 'bttv' }),
      candidate({ provider: '7tv', scope: 'channel', id: '7tv' }),
    ]);

    expect(result.Kappa.id).toBe('7tv');
  });

  it('keeps the first candidate when scores tie', () => {
    const result = mergeCandidates([
      candidate({ id: 'first', provider: 'ffz', scope: 'channel' }),
      candidate({ id: 'second', provider: 'ffz', scope: 'channel' }),
    ]);

    expect(result.Kappa.id).toBe('first');
  });

  it('skips invalid candidates', () => {
    const result = mergeCandidates([
      candidate({ code: '', id: 'empty' }),
      candidate({ id: 'bad', url: 'javascript:alert(1)' }),
    ]);

    expect(result).toEqual({});
  });
});
