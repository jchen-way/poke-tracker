import { NextResponse } from 'next/server';
import prisma from '../../../../lib/prisma';
import { normalizeCardImageUrl } from '../../../../lib/cardImages';

export async function GET() {
  try {
    const items = await prisma.trackedItem.findMany({
      where: {
        imageUrl: {
          not: null,
        },
      },
      select: {
        id: true,
        imageUrl: true,
      },
    });

    const updates = items
      .map((item) => {
        const normalized = normalizeCardImageUrl(item.imageUrl);
        return normalized && normalized !== item.imageUrl
          ? { id: item.id, imageUrl: normalized }
          : null;
      })
      .filter((item): item is { id: string; imageUrl: string } => Boolean(item));

    if (!updates.length) {
      return NextResponse.json({ success: true, count: 0 });
    }

    await prisma.$transaction(
      updates.map((item) =>
        prisma.trackedItem.update({
          where: { id: item.id },
          data: { imageUrl: item.imageUrl },
        }),
      ),
    );

    return NextResponse.json({ success: true, count: updates.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown normalize-images error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
