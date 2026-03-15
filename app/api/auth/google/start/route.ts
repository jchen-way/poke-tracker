import { NextResponse } from 'next/server';
import {
  createGoogleOauthState,
  getGoogleStateCookieName,
  getGoogleStateCookieOptions,
} from '../../../../../lib/auth';
import { buildGoogleAuthUrl, hasGoogleOauthCredentials } from '../../../../../lib/googleAuth';

export async function GET(request: Request) {
  if (!hasGoogleOauthCredentials()) {
    return NextResponse.redirect(new URL('/login?error=google-config', request.url));
  }

  const url = new URL(request.url);
  const origin = url.origin;
  const state = createGoogleOauthState();
  const response = NextResponse.redirect(
    buildGoogleAuthUrl({
      state,
      origin,
    }),
  );
  response.cookies.set(getGoogleStateCookieName(), state, getGoogleStateCookieOptions());

  return response;
}
