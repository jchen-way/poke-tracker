type GoogleUserInfo = {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
};

const GOOGLE_AUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

export function hasGoogleOauthCredentials() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function buildGoogleAuthUrl({
  state,
  origin,
}: {
  state: string;
  origin: string;
}) {
  const url = new URL(GOOGLE_AUTH_BASE);
  url.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID ?? '');
  url.searchParams.set('redirect_uri', getGoogleRedirectUri(origin));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('prompt', 'select_account');
  url.searchParams.set('state', state);
  return url.toString();
}

export function getGoogleRedirectUri(origin: string) {
  return process.env.GOOGLE_REDIRECT_URI?.trim() || `${origin}/api/auth/google/callback`;
}

export async function exchangeGoogleCode({
  code,
  origin,
}: {
  code: string;
  origin: string;
}) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
  }

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: getGoogleRedirectUri(origin),
    grant_type: 'authorization_code',
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Google token exchange failed with ${response.status}`);
  }

  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) {
    throw new Error('Google token response missing access_token');
  }

  return payload.access_token;
}

export async function fetchGoogleUserInfo(accessToken: string) {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Google userinfo request failed with ${response.status}`);
  }

  const payload = (await response.json()) as GoogleUserInfo;
  if (!payload.sub || !payload.email) {
    throw new Error('Google userinfo response missing required fields');
  }
  if (payload.email_verified === false) {
    throw new Error('Google account email is not verified');
  }

  return payload;
}
