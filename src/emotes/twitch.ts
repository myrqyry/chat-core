import { fetchJson } from '../network/fetch';

export interface TwitchUserIdResolution {
  id: string | null;
  ok: boolean;
  error?: string;
}

const safeErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Twitch user lookup failed';

export async function resolveTwitchUserIdDetailed(
  channelName: string,
  signal?: AbortSignal,
): Promise<TwitchUserIdResolution> {
  try {
    const data = await fetchJson<Array<{ id?: string }>>(
      `https://api.ivr.fi/v2/twitch/user?login=${encodeURIComponent(channelName)}`,
      { signal },
    );
    return {
      id: data[0]?.id ? String(data[0].id) : null,
      ok: true,
    };
  } catch (error) {
    return {
      id: null,
      ok: false,
      error: safeErrorMessage(error),
    };
  }
}

export async function resolveTwitchUserId(channelName: string, signal?: AbortSignal): Promise<string | null> {
  return (await resolveTwitchUserIdDetailed(channelName, signal)).id;
}
