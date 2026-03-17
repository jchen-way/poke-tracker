'use server';

import { Prisma } from '@prisma/client';
import { redirect } from 'next/navigation';
import prisma from '../../lib/prisma';
import { createSession, hashPassword, verifyPassword, clearSession, withDatabaseRetry } from '../../lib/auth';

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim();
}

function validatePassword(password: string) {
  return password.length >= 8;
}

export async function loginAction(formData: FormData) {
  const email = getString(formData, 'email').toLowerCase();
  const password = getString(formData, 'password');

  if (!email || !password) {
    redirect('/login?error=missing');
  }

  const user = await withDatabaseRetry(
    () => prisma.user.findUnique({ where: { email } }),
    'loginAction.findUserByEmail',
  );
  if (user?.authProvider === 'google' && !user.password) {
    redirect('/login?error=google');
  }
  if (!user || !verifyPassword(password, user.password)) {
    redirect('/login?error=invalid');
  }

  await createSession(user.id, user.email);
  redirect('/dashboard');
}

export async function registerAction(formData: FormData) {
  const email = getString(formData, 'email').toLowerCase();
  const password = getString(formData, 'password');
  const confirmPassword = getString(formData, 'confirmPassword');

  if (!email || !password || !confirmPassword) {
    redirect('/register?error=missing');
  }

  if (!validatePassword(password)) {
    redirect('/register?error=password');
  }

  if (password !== confirmPassword) {
    redirect('/register?error=match');
  }

  const existingUser = await withDatabaseRetry(
    () => prisma.user.findUnique({ where: { email } }),
    'registerAction.findUserByEmail',
  );
  if (existingUser) {
    redirect('/register?error=exists');
  }

  let user;
  try {
    user = await prisma.user.create({
      data: {
        email,
        password: hashPassword(password),
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      redirect('/register?error=exists');
    }
    throw error;
  }

  await createSession(user.id, user.email);
  redirect('/dashboard');
}

export async function logoutAction() {
  await clearSession();
  redirect('/');
}
