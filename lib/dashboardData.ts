import prisma from './prisma';
import { TREND_MIN_POINTS, type DashboardSnapshot } from './dashboardSignals';

export async function fetchDashboardSnapshots() {
  const trackedItemCount = await prisma.trackedItem.count({
    where: {
      type: 'CARD',
    },
  });
  const snapshotTake = Math.min(
    Math.max(trackedItemCount * TREND_MIN_POINTS, 3000),
    12000,
  );

  const latestSnapshots = await prisma.priceSnapshot.findMany({
    where: {
      item: {
        type: 'CARD',
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
    orderBy: [
      { trackedItemId: 'asc' },
      { date: 'desc' },
    ],
    distinct: ['trackedItemId'],
  });

  const recentSnapshots = await prisma.priceSnapshot.findMany({
    where: {
      item: {
        type: 'CARD',
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

  const seenSnapshotIds = new Set(latestSnapshots.map((snapshot) => snapshot.id));
  const combinedSnapshots = [
    ...latestSnapshots,
    ...recentSnapshots.filter((snapshot) => !seenSnapshotIds.has(snapshot.id)),
  ];

  return combinedSnapshots as DashboardSnapshot[];
}
