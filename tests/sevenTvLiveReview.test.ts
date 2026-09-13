import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectSevenTvLive } from '../src/seventv/live';

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
}

const activeEmote = (id: string, name: string) => ({
  id,
  name,
  flags: 0,
  data: {
    name,
    flags: 0,
    animated: false,
    owner: { display_name: 'owner' },
    host: {
      url: `//cdn.7tv.app/emote/${id}`,
      files: [{ name: '4x.webp', width: 128, height: 128, format: 'WEBP' }],
    },
  },
});

describe('7TV live snapshot safety', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('rejects startup before opening EventAPI when the initial emote-set snapshot fails', async () => {
    const onError = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/users/twitch/123')) {
        return new Response(JSON.stringify({
          user: { id: 'seven-user' },
          emote_set: { id: 'set-1' },
        }), { status: 200 });
      }
      if (url.includes('/emote-sets/set-1')) {
        return new Response('{}', { status: 503 });
      }
      return new Response('{}', { status: 404 });
    }));

    await expect(connectSevenTvLive({
      platform: 'twitch',
      platformUserId: '123',
      onError,
    })).rejects.toThrow(/503/u);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(MockWebSocket.instances).toHaveLength(0);
  });

  it('refreshes and re-subscribes when a connection update carries emote_set_id', async () => {
    let userLookupCount = 0;
    const onEmoteSetChange = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/users/twitch/123')) {
        userLookupCount += 1;
        const setId = userLookupCount === 1 ? 'set-1' : 'set-2';
        return new Response(JSON.stringify({
          user: { id: 'seven-user' },
          emote_set: { id: setId },
        }), { status: 200 });
      }
      if (url.includes('/emote-sets/set-1')) {
        return new Response(JSON.stringify({ emotes: [activeEmote('emote-1', 'OldSet')] }), { status: 200 });
      }
      if (url.includes('/emote-sets/set-2')) {
        return new Response(JSON.stringify({ emotes: [activeEmote('emote-2', 'NewSet')] }), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    }));

    const connection = await connectSevenTvLive({
      platform: 'twitch',
      platformUserId: '123',
      onEmoteSetChange,
    });
    expect(connection.emoteSetId).toBe('set-1');
    expect(connection.emotes().OldSet).toBeDefined();

    const socket = MockWebSocket.instances[0];
    socket.emitOpen();
    socket.emitMessage({
      op: 1,
      d: { heartbeat_interval: 25_000, session_id: 'session-1', subscription_limit: 100 },
    });
    socket.emitMessage({
      op: 0,
      d: {
        type: 'user.update',
        body: {
          id: 'seven-user',
          updated: [{
            key: 'connections',
            type: 'update',
            old_value: [{ key: 'emote_set_id', value: 'set-1' }],
            value: [{ key: 'emote_set_id', value: 'set-2' }],
          }],
        },
      },
    });

    await vi.waitFor(() => {
      expect(connection.emoteSetId).toBe('set-2');
    });
    expect(connection.emotes().OldSet).toBeUndefined();
    expect(connection.emotes().NewSet).toBeDefined();
    expect(onEmoteSetChange).toHaveBeenCalledWith(
      expect.objectContaining({ NewSet: expect.any(Object) }),
      expect.objectContaining({ reason: 'reassigned', emoteSetId: 'set-2' }),
    );

    connection.close();
  });
});
