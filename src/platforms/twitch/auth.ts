import { fetchJson } from '../../network/fetch';
import type { TwitchAuth, TwitchResolvedChannel, TwitchTokenValidation } from './types';

const normalizeToken = (token: string): string => token.trim().replace(/^oauth:/iu, '');

export async function validateTwitchUserAccessToken(
  accessToken: string,
  signal?: AbortSignal,
): Promise<TwitchAuth> {
  const token = normalizeToken(accessToken);
  if (!token) throw new Error('Twitch access token must not be empty');

  const validation = await fetchJson<TwitchTokenValidation>(
    'https://id.twitch.tv/oauth2/validate',
    { headers: { Authorization: `OAuth ${token}` }, signal },
  );

  if (!validation.client_id || !validation.user_id) {
    throw new Error('Twitch token validation did not return a client_id and user_id');
  }

  return {
    clientId: validation.client_id,
    accessToken: token,
    userId: validation.user_id,
    login: validation.login,
    scopes: validation.scopes ?? [],
    expiresIn: validation.expires_in,
  };
}

export async function resolveTwitchEventSubAuth(
  accessToken: string,
  options: { clientId?: string; userId?: string; signal?: AbortSignal } = {},
): Promise<TwitchAuth> {
  const validated = await validateTwitchUserAccessToken(accessToken, options.signal);

  if (options.clientId && options.clientId !== validated.clientId) {
    throw new Error('Twitch client ID does not match the supplied user access token');
  }
  if (options.userId && options.userId !== validated.userId) {
    throw new Error('Twitch user ID does not match the supplied user access token');
  }
  if (!validated.scopes?.includes('user:read:chat')) {
    throw new Error('Twitch user access token is missing required scope: user:read:chat');
  }

  return validated;
}

export async function resolveTwitchChannel(
  channelName: string,
  auth: TwitchAuth,
  signal?: AbortSignal,
): Promise<TwitchResolvedChannel> {
  const login = channelName.trim().replace(/^#/u, '').toLowerCase();
  if (!login) throw new Error('Twitch channel name must not be empty');

  const data = await fetchJson<{ data?: Array<{ id?: string; login?: string; display_name?: string }> }>(
    `https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`,
    {
      headers: {
        'Client-Id': auth.clientId,
        Authorization: `Bearer ${auth.accessToken}`,
      },
      signal,
    },
  );

  const user = data.data?.[0];
  if (!user?.id || !user.login) throw new Error(`Twitch channel not found: ${channelName}`);
  return { id: user.id, login: user.login, displayName: user.display_name };
}
