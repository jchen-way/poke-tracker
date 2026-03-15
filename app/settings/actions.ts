'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import prisma from '../../lib/prisma';
import { hashPassword, requireUser, verifyPassword } from '../../lib/auth';

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim();
}

export async function updateProfileAction(formData: FormData) {
  const user = await requireUser('/login');
  const displayName = getString(formData, 'displayName');
  const emailNotificationsEnabled = formData.get('emailNotificationsEnabled') === 'on';

  await prisma.user.update({
    where: { id: user.id },
    data: {
      displayName: displayName || null,
      emailNotificationsEnabled,
    },
  });

  revalidatePath('/', 'layout');
  redirect('/settings?saved=profile');
}

export async function updatePasswordAction(formData: FormData) {
  const user = await requireUser('/login');
  const currentPassword = getString(formData, 'currentPassword');
  const newPassword = getString(formData, 'newPassword');
  const confirmPassword = getString(formData, 'confirmPassword');

  if (!newPassword || newPassword.length < 8) {
    redirect('/settings?error=password');
  }

  if (newPassword !== confirmPassword) {
    redirect('/settings?error=match');
  }

  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      password: true,
      authProvider: true,
    },
  });

  if (!fullUser) {
    redirect('/login');
  }

  if (fullUser.password) {
    if (!currentPassword || !verifyPassword(currentPassword, fullUser.password)) {
      redirect('/settings?error=current-password');
    }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashPassword(newPassword),
      authProvider:
        fullUser.authProvider === 'credentials' ? fullUser.authProvider : 'google+credentials',
    },
  });

  revalidatePath('/', 'layout');
  redirect('/settings?saved=password');
}
