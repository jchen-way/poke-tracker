import { NextResponse } from 'next/server';
import prisma from '../../../../../lib/prisma';
import {
  consumeGoogleOauthState,
  createSessionCookieValue,
  getGoogleStateCookieName,
  getSessionCookieName,
  getSessionCookieOptions,
} from '../../../../../lib/auth';
import { exchangeGoogleCode, fetchGoogleUserInfo, hasGoogleOauthCredentials } from '../../../../../lib/googleAuth';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code') ?? '';
  const state = url.searchParams.get('state') ?? '';

  if (!hasGoogleOauthCredentials()) {
    return NextResponse.redirect(new URL('/login?error=google-config', request.url));
  }

  const stateValid = await consumeGoogleOauthState(state);
  if (!stateValid || !code) {
    return NextResponse.redirect(new URL('/login?error=google-auth', request.url));
  }

  try {
    const accessToken = await exchangeGoogleCode({
      code,
      origin: url.origin,
    });
    const profile = await fetchGoogleUserInfo(accessToken);
    const email = profile.email.toLowerCase();

    const existingByGoogle = await prisma.user.findUnique({
      where: { googleId: profile.sub },
    });
    const existingByEmail =
      existingByGoogle ??
      (await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          password: true,
          authProvider: true,
        },
      }));

    const user = existingByEmail
      ? await prisma.user.update({
          where: { id: existingByEmail.id },
          data: {
            googleId: profile.sub,
            authProvider:
              existingByEmail.password && existingByEmail.authProvider !== 'google+credentials'
                ? 'google+credentials'
                : existingByEmail.authProvider || 'google',
            displayName: profile.name ?? undefined,
          },
        })
      : await prisma.user.create({
          data: {
            email,
            googleId: profile.sub,
            authProvider: 'google',
            displayName: profile.name ?? null,
          },
        });

    const response = NextResponse.redirect(new URL('/dashboard', request.url));
    response.cookies.set(
      getSessionCookieName(),
      createSessionCookieValue(user.id, user.email),
      getSessionCookieOptions(),
    );
    response.cookies.delete(getGoogleStateCookieName());

    return response;
  } catch {
    return NextResponse.redirect(new URL('/login?error=google-auth', request.url));
  }
}
