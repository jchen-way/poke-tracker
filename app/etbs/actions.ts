'use server';

import { redirect } from 'next/navigation';
import prisma from '../../lib/prisma';
import { requireUser } from '../../lib/auth';
import { ensureEtbDisplayName } from '../../lib/etbTracking';
import { findKnownEtbByTrackedId } from '../../lib/etbCatalog';

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim();
}

export async function addKnownEtbToWatchlistAction(formData: FormData) {
  const user = await requireUser('/login');
  const trackedId = getString(formData, 'trackedId');
  const redirectTo = getString(formData, 'redirectTo') || '/etbs';

  const knownEtb = trackedId ? await findKnownEtbByTrackedId(trackedId) : null;
  if (!knownEtb) {
    redirect(redirectTo);
  }

  const trackedEtb = await prisma.trackedItem.upsert({
    where: { cardId: knownEtb.trackedId },
    update: {
      name: ensureEtbDisplayName(knownEtb.name),
      setName: knownEtb.setName,
      number: null,
      type: 'ETB',
      imageUrl: knownEtb.imageUrl ?? undefined,
    },
    create: {
      cardId: knownEtb.trackedId,
      name: ensureEtbDisplayName(knownEtb.name),
      setName: knownEtb.setName,
      number: null,
      type: 'ETB',
      imageUrl: knownEtb.imageUrl ?? undefined,
    },
  });

  await prisma.watchlistItem.upsert({
    where: {
      userId_trackedItemId: {
        userId: user.id,
        trackedItemId: trackedEtb.id,
      },
    },
    update: {},
    create: {
      userId: user.id,
      trackedItemId: trackedEtb.id,
    },
  });

  redirect(redirectTo);
}
