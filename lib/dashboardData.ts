import prisma from './prisma';
import { TREND_MIN_POINTS, type DashboardSnapshot } from './dashboardSignals';

export async function fetchDashboardSnapshots() {
  const trackedItemCount = await prisma.trackedItem.count();
  const snapshotTake = Math.min(
    Math.max(trackedItemCount * TREND_MIN_POINTS, 3000),
    12000,
  );

  const snapshots = await prisma.priceSnapshot.findMany({
    where: {
      item: {
        cardId: {
          not: null,
        },
      },
    },
    include: {
      item: {
        select: {
          name: true,
          setName: true,
          number: true,
          cardId: true,
        },
      },
    },
    orderBy: { date: 'desc' },
    take: snapshotTake,
  });

  return snapshots as DashboardSnapshot[];
}
