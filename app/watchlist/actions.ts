'use server';

import { redirect } from 'next/navigation';
import prisma from '../../lib/prisma';
import { requireUser } from '../../lib/auth';

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim();
}

export async function addToWatchlistAction(formData: FormData) {
  const user = await requireUser('/login');
  const trackedItemId = getString(formData, 'trackedItemId');
  const redirectTo = getString(formData, 'redirectTo') || '/watchlist';

  if (!trackedItemId) {
    redirect(redirectTo);
  }

  await prisma.watchlistItem.upsert({
    where: {
      userId_trackedItemId: {
        userId: user.id,
        trackedItemId,
      },
    },
    update: {},
    create: {
      userId: user.id,
      trackedItemId,
    },
  });

  redirect(redirectTo);
}

export async function removeFromWatchlistAction(formData: FormData) {
  const user = await requireUser('/login');
  const trackedItemId = getString(formData, 'trackedItemId');
  const redirectTo = getString(formData, 'redirectTo') || '/watchlist';

  if (!trackedItemId) {
    redirect(redirectTo);
  }

  await prisma.watchlistItem.deleteMany({
    where: {
      userId: user.id,
      trackedItemId,
    },
  });

  redirect(redirectTo);
}
