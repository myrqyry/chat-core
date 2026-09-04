import { fetchJson } from '../network/fetch';

export async function resolveTwitchUserId(channelName: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const data = await fetchJson<Array<{ id?: string }>>(
      `https://api.ivr.fi/v2/twitch/user?login=${encodeURIComponent(channelName)}`,
      { signal },
    );
    return data[0]?.id ? String(data[0].id) : null;
  } catch {
    return null;
  }
}
