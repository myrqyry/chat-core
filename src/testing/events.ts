import type {
  ChatEvent,
  ChatEventOrigin,
  ChatEventType,
  ChatFragment,
  ChatMessage,
  ChatPlatform,
  ChatUser,
} from '../types/chat';

const CHAT_EVENT_TYPES: ReadonlySet<string> = new Set<ChatEventType>([
  'message',
  'message-delete',
  'user-timeout',
  'user-ban',
  'subscription',
  'gift-subscription',
  'cheer',
  'raid',
  'reward-redemption',
  'room-state',
  'stream-online',
  'stream-offline',
  'system',
]);

const CHAT_PLATFORMS: ReadonlySet<string> = new Set<ChatPlatform>([
  'twitch',
  'kick',
  'youtube',
  'custom',
]);

const CHAT_EVENT_ORIGINS: ReadonlySet<string> = new Set<ChatEventOrigin>([
  'live',
  'replay',
  'test',
]);

export interface TestMessageEventOptions {
  platform?: ChatPlatform;
  channelId?: string;
  channelName?: string;
  timestamp?: number;
  eventId?: string;
  messageId?: string;
  userId?: string;
  username?: string;
  displayName?: string;
  text?: string;
  fragments?: ChatFragment[];
  data?: unknown;
  raw?: unknown;
}

export interface ChatEventRecorderOptions {
  limit?: number;
}

export const chatEventOrigin = (event: ChatEvent): ChatEventOrigin => event.origin ?? 'live';

export function createTestChatEvent<T = unknown>(
  type: ChatEventType,
  overrides: Partial<Omit<ChatEvent<T>, 'type' | 'origin'>> = {},
): ChatEvent<T> {
  const platform = overrides.platform ?? 'custom';
  const timestamp = overrides.timestamp ?? 0;
  return {
    ...overrides,
    id: overrides.id ?? `test:${platform}:${type}`,
    type,
    platform,
    timestamp,
    origin: 'test',
  };
}

export function createTestMessageEvent(options: TestMessageEventOptions = {}): ChatEvent {
  const platform = options.platform ?? 'custom';
  const timestamp = options.timestamp ?? 0;
  const text = options.text ?? 'Test message';
  const user: ChatUser = {
    platform,
    id: options.userId ?? 'test-user',
    username: options.username ?? 'test-user',
    displayName: options.displayName ?? 'Test User',
  };
  const messageId = options.messageId ?? 'test-message';
  const message: ChatMessage = {
    id: messageId,
    platform,
    channelId: options.channelId,
    channelName: options.channelName,
    user,
    text,
    fragments: options.fragments ?? [{ type: 'text', text }],
    timestamp,
  };

  return createTestChatEvent('message', {
    id: options.eventId ?? messageId,
    platform,
    channelId: options.channelId,
    channelName: options.channelName,
    timestamp,
    user,
    message,
    data: options.data,
    raw: options.raw,
  });
}

export function replayChatEvent<T = unknown>(
  event: ChatEvent<T>,
  overrides: Partial<Omit<ChatEvent<T>, 'origin'>> = {},
): ChatEvent<T> {
  const timestamp = overrides.timestamp ?? event.timestamp;
  const message = overrides.message ?? (event.message ? {
    ...event.message,
    ...(overrides.timestamp !== undefined ? { timestamp } : {}),
  } : undefined);

  return {
    ...event,
    ...overrides,
    timestamp,
    ...(message ? { message } : {}),
    origin: 'replay',
  };
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

export function isChatEvent(value: unknown): value is ChatEvent {
  const event = asRecord(value);
  if (!event) return false;
  if (typeof event.type !== 'string' || !CHAT_EVENT_TYPES.has(event.type)) return false;
  if (typeof event.platform !== 'string' || !CHAT_PLATFORMS.has(event.platform)) return false;
  if (typeof event.timestamp !== 'number' || !Number.isFinite(event.timestamp)) return false;
  if (event.origin !== undefined && (
    typeof event.origin !== 'string' || !CHAT_EVENT_ORIGINS.has(event.origin)
  )) return false;
  if (event.id !== undefined && typeof event.id !== 'string') return false;
  return true;
}

export function serializeChatEvent(event: ChatEvent, space?: number): string {
  return JSON.stringify(event, null, space);
}

export function deserializeChatEvent(serialized: string): ChatEvent {
  const value: unknown = JSON.parse(serialized);
  if (!isChatEvent(value)) throw new TypeError('Serialized value is not a valid ChatEvent');
  return value;
}

export function serializeChatEvents(events: readonly ChatEvent[], space?: number): string {
  return JSON.stringify(events, null, space);
}

export function deserializeChatEvents(serialized: string): ChatEvent[] {
  const value: unknown = JSON.parse(serialized);
  if (!Array.isArray(value) || !value.every(isChatEvent)) {
    throw new TypeError('Serialized value is not a valid ChatEvent array');
  }
  return value;
}

export class ChatEventRecorder {
  readonly limit: number;
  private readonly buffer: ChatEvent[] = [];

  constructor(options: ChatEventRecorderOptions = {}) {
    const limit = options.limit ?? 200;
    if (!Number.isInteger(limit) || limit < 1) {
      throw new RangeError('ChatEventRecorder limit must be a positive integer');
    }
    this.limit = limit;
  }

  get size(): number {
    return this.buffer.length;
  }

  record<T>(event: ChatEvent<T>): ChatEvent<T> {
    this.buffer.push(event as ChatEvent);
    if (this.buffer.length > this.limit) {
      this.buffer.splice(0, this.buffer.length - this.limit);
    }
    return event;
  }

  snapshot(): ChatEvent[] {
    return [...this.buffer];
  }

  clear(): void {
    this.buffer.length = 0;
  }

  serialize(space?: number): string {
    return serializeChatEvents(this.buffer, space);
  }
}
