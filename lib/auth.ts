import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import prisma from './prisma';

const SESSION_COOKIE_NAME = 'pokemon_tracker_session';
const GOOGLE_STATE_COOKIE_NAME = 'pokemon_tracker_google_state';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const GOOGLE_STATE_TTL_MS = 1000 * 60 * 10;

type SessionPayload = {
  userId: string;
  email: string;
  exp: number;
};

type CurrentUser = {
  id: string;
  email: string;
  displayName: string | null;
  emailNotificationsEnabled: boolean;
  authProvider: string;
  createdAt: Date;
};

function getAuthSecret() {
  const secret = process.env.AUTH_SECRET?.trim();
  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Missing AUTH_SECRET in production');
  }

  return 'dev-only-auth-secret-change-me';
}

function toBase64Url(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function fromBase64Url(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function signPayload(payload: string) {
  return createHmac('sha256', getAuthSecret()).update(payload).digest('base64url');
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [salt, originalHash] = storedHash.split(':');
  if (!salt || !originalHash) {
    return false;
  }

  const derivedHash = scryptSync(password, salt, 64).toString('hex');
  return safeEqual(
    Buffer.from(originalHash, 'hex').toString('base64'),
    Buffer.from(derivedHash, 'hex').toString('base64'),
  );
}

function createSessionValue(payload: SessionPayload) {
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function parseSessionValue(value: string): SessionPayload | null {
  const [encodedPayload, signature] = value.split('.');
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signPayload(encodedPayload);
  if (!safeEqual(signature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload)) as SessionPayload;
    if (!payload.userId || !payload.email || !payload.exp || payload.exp < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function isTransientDatabaseError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    error.name === 'PrismaClientInitializationError' ||
    message.includes("can't reach database server") ||
    message.includes('connection') ||
    message.includes('timeout') ||
    message.includes('timed out')
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withDatabaseRetry<T>(
  operation: () => Promise<T>,
  label: string,
  retries = 2,
) {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientDatabaseError(error) || attempt === retries) {
        throw error;
      }

      const delayMs = 150 * (attempt + 1);
      console.warn(`[Auth] transient database error during ${label}, retrying in ${delayMs}ms`);
      await sleep(delayMs);
    }
  }

  throw lastError;
}

export async function createSession(userId: string, email: string) {
  const expires = Date.now() + SESSION_TTL_MS;
  const value = createSessionCookieValue(userId, email, expires);
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, value, {
    ...getSessionCookieOptions(expires),
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function getSession() {
  const cookieStore = await cookies();
  const sessionValue = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionValue) {
    return null;
  }

  return parseSessionValue(sessionValue);
}

export async function getCurrentUser() {
  const session = await getSession();
  if (!session) {
    return null;
  }

  try {
    return await withDatabaseRetry(
      () =>
        prisma.user.findUnique({
          where: { id: session.userId },
          select: {
            id: true,
            email: true,
            displayName: true,
            emailNotificationsEnabled: true,
            authProvider: true,
            createdAt: true,
          },
        }),
      'getCurrentUser',
    );
  } catch (error) {
    if (!isTransientDatabaseError(error)) {
      throw error;
    }

    console.warn('[Auth] database unavailable during getCurrentUser, using session fallback');

    const fallbackUser: CurrentUser = {
      id: session.userId,
      email: session.email,
      displayName: null,
      emailNotificationsEnabled: true,
      authProvider: 'credentials',
      createdAt: new Date(0),
    };

    return fallbackUser;
  }
}

export async function requireUser(redirectTo = '/login') {
  const user = await getCurrentUser();
  if (!user) {
    redirect(redirectTo);
  }

  return user;
}

export function createGoogleOauthState() {
  return randomBytes(24).toString('base64url');
}

export async function storeGoogleOauthState(state: string) {
  const cookieStore = await cookies();
  cookieStore.set(GOOGLE_STATE_COOKIE_NAME, state, {
    ...getGoogleStateCookieOptions(),
  });
}

export async function consumeGoogleOauthState(expectedState: string) {
  const cookieStore = await cookies();
  const storedState = cookieStore.get(GOOGLE_STATE_COOKIE_NAME)?.value ?? null;
  cookieStore.delete(GOOGLE_STATE_COOKIE_NAME);

  if (!storedState || !expectedState) {
    return false;
  }

  return safeEqual(storedState, expectedState);
}

export function createSessionCookieValue(userId: string, email: string, expires = Date.now() + SESSION_TTL_MS) {
  return createSessionValue({ userId, email, exp: expires });
}

export function getSessionCookieOptions(expires = Date.now() + SESSION_TTL_MS) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(expires),
  };
}

export function getGoogleStateCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(Date.now() + GOOGLE_STATE_TTL_MS),
  };
}

export function getGoogleStateCookieName() {
  return GOOGLE_STATE_COOKIE_NAME;
}

export function getSessionCookieName() {
  return SESSION_COOKIE_NAME;
}
