import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applySevenTvEmoteSetDispatch,
  createSevenTvEventSocket,
  fetchSevenTvChannelSnapshot,
  mergeCandidates,
  replaceSevenTvChannelCandidates,
  sevenTvCandidateFromActiveEmote,
} from '../src/index';

class MockWebSocket {
  static OPEN = 1;
  static instances: MockWebSocket[] = [];

  readonly url: string;
  readonly sent: string[] = [];
  readyState = 0;
  closeCount = 0;

  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closeCount += 1;
    this.readyState = 3;
  }

  emitOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.({} as Event);
  }

  emitMessage(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent<unknown>);
  }

  emitClose(code = 1006): void {
    this.readyState = 3;
    this.onclose?.({ code } as CloseEvent);
  }
}

const activeEmote = (overrides: Record<string, unknown> = {}) => ({
  id: 'emote-1',
  name: 'OldName',
  flags: 0,
  data: {
    name: 'BaseName',
    flags: 1 << 8,
    animated: false,
    owner: { display_name: 'owner' },
    host: {
      url: '//cdn.7tv.app/emote/emote-1',
      files: [{ name: '4x.webp', width: 128, height: 128, format: 'WEBP' }],
    },
  },
  ...overrides,
});

describe('7TV emote semantics', () => {
  it('does not force recommended base-emote zero-width unless the active set enables it', () => {
    const recommendedOnly = sevenTvCandidateFromActiveEmote(activeEmote());
    const activeZeroWidth = sevenTvCandidateFromActiveEmote(activeEmote({ flags: 1 }));

    expect(recommendedOnly).toMatchObject({ zeroWidth: false });
    expect(recommendedOnly?.modifier).toBeUndefined();
    expect(activeZeroWidth).toMatchObject({ zeroWidth: true, modifier: 'overlay' });
  });

  it('preserves full emote data when a live rename dispatch only contains partial values', () => {
    const initial = sevenTvCandidateFromActiveEmote(activeEmote());
    expect(initial).not.toBeNull();
    const { scope: _scope, ...initialEmote } = initial!;

    const result = applySevenTvEmoteSetDispatch({ OldName: initialEmote }, {
      type: 'emote_set.update',
      body: {
        id: 'set-1',
        updated: [{
          key: 'emotes',
          old_value: { id: 'emote-1', name: 'OldName' },
          value: { id: 'emote-1', name: 'NewName', flags: 1 },
        }],
      },
    });

    expect(result).toMatchObject({ changed: true, removed: ['OldName'] });
    expect(result.emotes.OldName).toBeUndefined();
    expect(result.emotes.NewName).toMatchObject({
      id: 'emote-1',
      zeroWidth: true,
      provider: '7tv',
      ownerName: 'owner',
    });
    expect(result.emotes.NewName.url).toContain('/4x.webp');
  });

  it('restores lower-priority provider candidates after a live 7TV removal', () => {
    const bttv = {
      id: 'bttv-1', code: 'Same', url: 'https://example.com/bttv.webp', zeroWidth: false,
      provider: 'bttv' as const, scope: 'channel' as const,
    };
    const sevenTv = {
      id: '7tv-1', code: 'Same', url: 'https://example.com/7tv.webp', zeroWidth: false,
      provider: '7tv' as const, scope: 'channel' as const,
    };

    const initial = [bttv, sevenTv];
    expect(mergeCandidates(initial).Same.provider).toBe('7tv');

    const replaced = replaceSevenTvChannelCandidates(initial, []);
    expect(mergeCandidates(replaced).Same.provider).toBe('bttv');
  });
});

describe('7TV channel snapshot metadata', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('retains the 7TV user id and active emote-set id needed for live subscriptions', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/users/twitch/123')) {
        return new Response(JSON.stringify({
          user: { id: 'seven-user' },
          emote_set: { id: 'set-1' },
        }), { status: 200 });
      }
      if (url.includes('/emote-sets/set-1')) {
        return new Response(JSON.stringify({ emotes: [activeEmote()] }), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchSevenTvChannelSnapshot('twitch', '123')).resolves.toMatchObject({
      found: true,
      sevenTvUserId: 'seven-user',
      emoteSetId: 'set-1',
      status: { ok: true, count: 1 },
    });
  });
});

describe('7TV EventAPI lifecycle', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', MockWebSocket);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('waits for HELLO, installs subscriptions, and closes after three missed heartbeats', () => {
    const states: string[] = [];
    const handle = createSevenTvEventSocket({
      subscriptions: [{ type: 'emote_set.update', condition: { object_id: 'set-1' } }],
      onStateChange: (state) => states.push(state),
    });
    const ws = MockWebSocket.instances[0];

    ws.emitOpen();
    expect(states).toEqual(['connecting']);
    expect(ws.sent).toEqual([]);

    ws.emitMessage({
      op: 1,
      d: { heartbeat_interval: 10_000, session_id: 'session-a', subscription_limit: 100 },
    });
    expect(states.at(-1)).toBe('connected');
    expect(JSON.parse(ws.sent[0])).toMatchObject({
      op: 35,
      d: { type: 'emote_set.update', condition: { object_id: 'set-1' } },
    });

    vi.advanceTimersByTime(31_000);
    expect(ws.closeCount).toBe(1);
    handle.close();
  });

  it('re-subscribes after a dropped session without resetting backoff on bare socket open', () => {
    const handle = createSevenTvEventSocket({
      subscriptions: [{ type: 'emote_set.update', condition: { object_id: 'set-1' } }],
    });
    const first = MockWebSocket.instances[0];
    first.emitOpen();
    first.emitMessage({
      op: 1,
      d: { heartbeat_interval: 25_000, session_id: 'session-a', subscription_limit: 100 },
    });

    first.emitMessage({ op: 4, d: { reason: 'restart' } });
    expect(first.closeCount).toBe(1);
    first.emitClose(1000);

    vi.advanceTimersByTime(1_000);
    expect(MockWebSocket.instances).toHaveLength(2);

    const second = MockWebSocket.instances[1];
    second.emitOpen();
    expect(second.sent).toEqual([]);
    second.emitMessage({
      op: 1,
      d: { heartbeat_interval: 25_000, session_id: 'session-b', subscription_limit: 100 },
    });

    expect(second.sent).toHaveLength(1);
    expect(JSON.parse(second.sent[0])).toMatchObject({
      op: 35,
      d: { type: 'emote_set.update', condition: { object_id: 'set-1' } },
    });

    handle.close();
  });

  it('keeps exponential backoff across sockets that never reach HELLO', () => {
    const handle = createSevenTvEventSocket();

    const first = MockWebSocket.instances[0];
    first.emitOpen();
    first.emitClose(1006);
    vi.advanceTimersByTime(999);
    expect(MockWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances).toHaveLength(2);

    const second = MockWebSocket.instances[1];
    second.emitOpen();
    second.emitClose(1006);
    vi.advanceTimersByTime(1_999);
    expect(MockWebSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances).toHaveLength(3);

    handle.close();
  });
});
