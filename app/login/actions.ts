'use server';

import { redirect } from 'next/navigation';
import prisma from '../../lib/prisma';
import { createSession, hashPassword, verifyPassword, clearSession } from '../../lib/auth';

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

  const user = await prisma.user.findUnique({ where: { email } });
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

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    redirect('/register?error=exists');
  }

  const user = await prisma.user.create({
    data: {
      email,
      password: hashPassword(password),
    },
  });

  await createSession(user.id, user.email);
  redirect('/dashboard');
}

export async function logoutAction() {
  await clearSession();
  redirect('/');
}
