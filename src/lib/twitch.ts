type TwitchTokenState = {
  value: string;
  expiresAt: number;
};

type TwitchTokenResponse = {
  access_token: string;
  expires_in: number;
  token_type: string;
};

type TwitchGame = {
  id: string;
  name: string;
  box_art_url: string;
};

type TwitchGamesResponse = {
  data: TwitchGame[];
};

export type TwitchClip = {
  id: string;
  url: string;
  embed_url: string;
  broadcaster_id: string;
  broadcaster_name: string;
  creator_id: string;
  creator_name: string;
  video_id: string;
  game_id: string;
  language: string;
  title: string;
  view_count: number;
  created_at: string;
  thumbnail_url: string;
  duration: number;
};

type TwitchClipsResponse = {
  data: TwitchClip[];
};

export type TwitchVideo = {
  id: string;
  user_id: string;
  user_login: string;
  user_name: string;
  title: string;
  description: string;
  created_at: string;
  published_at: string;
  url: string;
  thumbnail_url: string;
  viewable: string;
  view_count: number;
  language: string;
  type: string;
  duration: string;
};

type TwitchVideosResponse = {
  data: TwitchVideo[];
};

type TwitchSearchChannel = {
  id: string;
  broadcaster_login: string;
  display_name: string;
  game_name: string;
  is_live: boolean;
};

type TwitchSearchChannelsResponse = {
  data: TwitchSearchChannel[];
};

let tokenState: TwitchTokenState | null = null;

function getCredentials() {
  const clientId = process.env.TWITCH_CLIENT_ID ?? process.env.TWITCH_CLIENT;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET ?? process.env.TWITCH_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Missing Twitch credentials (TWITCH_CLIENT_ID/TWITCH_CLIENT_SECRET or TWITCH_CLIENT/TWITCH_SECRET)");
  }

  return { clientId, clientSecret };
}

export async function getTwitchAppToken(): Promise<{ token: string; clientId: string }> {
  const { clientId, clientSecret } = getCredentials();
  const now = Date.now();

  if (tokenState && tokenState.expiresAt > now + 60_000) {
    return { token: tokenState.value, clientId };
  }

  const response = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`,
    { method: "POST", cache: "no-store" }
  );

  if (!response.ok) {
    throw new Error(`Failed to get Twitch token (${response.status})`);
  }

  const payload = (await response.json()) as TwitchTokenResponse;
  tokenState = {
    value: payload.access_token,
    expiresAt: now + payload.expires_in * 1000
  };

  return { token: payload.access_token, clientId };
}

async function twitchGet<T>(path: string): Promise<T> {
  const { token, clientId } = await getTwitchAppToken();
  const response = await fetch(`https://api.twitch.tv/helix${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Client-Id": clientId
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Twitch API error (${response.status})`);
  }

  return (await response.json()) as T;
}

export async function findGameIdByName(name: string): Promise<string | null> {
  const payload = await twitchGet<TwitchGamesResponse>(`/games?name=${encodeURIComponent(name)}`);
  return payload.data[0]?.id ?? null;
}

export async function getClipsByGameId(gameId: string, first = 20): Promise<TwitchClip[]> {
  const capped = Math.max(1, Math.min(first, 40));
  const startedAt = new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString();
  const payload = await twitchGet<TwitchClipsResponse>(`/clips?game_id=${encodeURIComponent(gameId)}&first=${capped}&started_at=${encodeURIComponent(startedAt)}`);
  return payload.data;
}

export async function findBroadcasterIdByLogin(login: string): Promise<string | null> {
  type TwitchUser = { id: string; login: string; display_name: string };
  type TwitchUsersResponse = { data: TwitchUser[] };
  const payload = await twitchGet<TwitchUsersResponse>(`/users?login=${encodeURIComponent(login)}`);
  return payload.data[0]?.id ?? null;
}

export async function getClipsByBroadcasterId(broadcasterId: string, first = 20): Promise<TwitchClip[]> {
  const capped = Math.max(1, Math.min(first, 40));
  const startedAt = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString();
  const payload = await twitchGet<TwitchClipsResponse>(`/clips?broadcaster_id=${encodeURIComponent(broadcasterId)}&first=${capped}&started_at=${encodeURIComponent(startedAt)}`);
  return payload.data;
}

export async function searchChannelsByName(query: string, first = 8): Promise<TwitchSearchChannel[]> {
  const cleaned = query.trim();
  if (!cleaned) return [];
  const capped = Math.max(1, Math.min(first, 20));
  const payload = await twitchGet<TwitchSearchChannelsResponse>(
    `/search/channels?query=${encodeURIComponent(cleaned)}&first=${capped}`
  );
  return payload.data;
}

export function parseTwitchDurationToSeconds(duration: string): number {
  const regex = /(\d+)([hms])/g;
  let total = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(duration)) !== null) {
    const value = Number(match[1]);
    const unit = match[2];
    if (unit === "h") total += value * 3600;
    if (unit === "m") total += value * 60;
    if (unit === "s") total += value;
  }

  return total;
}

export async function getVideosByUserId(userId: string, first = 8): Promise<TwitchVideo[]> {
  const capped = Math.max(1, Math.min(first, 20));
  const payload = await twitchGet<TwitchVideosResponse>(
    `/videos?user_id=${encodeURIComponent(userId)}&type=archive&first=${capped}`
  );
  return payload.data;
}
