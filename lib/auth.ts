import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import prisma from './prisma';

const SESSION_COOKIE_NAME = 'pokemon_tracker_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

type SessionPayload = {
  userId: string;
  email: string;
  exp: number;
};

function getAuthSecret() {
  return process.env.AUTH_SECRET ?? 'dev-only-auth-secret-change-me';
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

export async function createSession(userId: string, email: string) {
  const expires = Date.now() + SESSION_TTL_MS;
  const value = createSessionValue({ userId, email, exp: expires });
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(expires),
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

  return prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      createdAt: true,
    },
  });
}

export async function requireUser(redirectTo = '/login') {
  const user = await getCurrentUser();
  if (!user) {
    redirect(redirectTo);
  }

  return user;
}
