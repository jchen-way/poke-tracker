import { NextResponse } from 'next/server';
import { syncPokemonMarketData } from '../../../../lib/dataIngestion';
import { sendNewSignalEmails } from '../../../../lib/emailNotifications';

export async function GET(request: Request) {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();

  try {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const requestSecret = request.headers.get('x-cron-secret');
      if (requestSecret !== cronSecret) {
        console.warn('[Ingest Cron] unauthorized', {
          requestId,
          source: request.headers.get('user-agent') ?? 'unknown',
        });
        return NextResponse.json(
          { success: false, error: 'Unauthorized', requestId },
          { status: 401 },
        );
      }
    }

    const { searchParams } = new URL(request.url);
    const source = searchParams.get('source') ?? 'manual';
    const job = searchParams.get('job') ?? 'unspecified';
    const limitParam = searchParams.get('limit');
    const discoverLimitParam = searchParams.get('discoverLimit');
    const etbLimitParam = searchParams.get('etbLimit');
    const historyDaysParam = searchParams.get('historyDays');
    const historyPointsParam = searchParams.get('historyPoints');
    const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
    const discoverLimit = discoverLimitParam
      ? Number.parseInt(discoverLimitParam, 10)
      : undefined;
    const etbLimit = etbLimitParam ? Number.parseInt(etbLimitParam, 10) : undefined;
    const historyDays = historyDaysParam
      ? Number.parseInt(historyDaysParam, 10)
      : undefined;
    const historyPoints = historyPointsParam
      ? Number.parseInt(historyPointsParam, 10)
      : undefined;
    const normalizedOptions = {
      limit: Number.isFinite(limit) && (limit as number) > 0 ? limit : undefined,
      etbLimit: Number.isFinite(etbLimit) && (etbLimit as number) >= 0 ? etbLimit : undefined,
      discoverLimit:
        Number.isFinite(discoverLimit) && (discoverLimit as number) > 0
          ? discoverLimit
          : undefined,
      historyDays:
        Number.isFinite(historyDays) && (historyDays as number) > 0
          ? historyDays
          : undefined,
      historyPoints:
        Number.isFinite(historyPoints) && (historyPoints as number) > 1
          ? historyPoints
          : undefined,
    };

    console.info('[Ingest Cron] start', {
      requestId,
      source,
      job,
      options: normalizedOptions,
    });

    const results = await syncPokemonMarketData(normalizedOptions);
    const summary = summarizeResults(results);
    let notifications:
      | Awaited<ReturnType<typeof sendNewSignalEmails>>
      | { configured: boolean; error: string; usersChecked: number; usersSkipped: number; emailsSent: number; signalsSent: number };

    try {
      notifications = await sendNewSignalEmails();
    } catch (notificationError) {
      const message =
        notificationError instanceof Error
          ? notificationError.message
          : 'Unknown notification error';
      console.error('[Ingest Cron] notification failure', {
        requestId,
        error: message,
      });
      notifications = {
        configured: true,
        error: message,
        usersChecked: 0,
        usersSkipped: 0,
        emailsSent: 0,
        signalsSent: 0,
      };
    }
    const durationMs = Date.now() - startedAt;

    console.info('[Ingest Cron] success', {
      requestId,
      source,
      job,
      durationMs,
      count: results.length,
      summary,
      notifications,
    });

    return NextResponse.json({
      success: true,
      requestId,
      source,
      job,
      durationMs,
      count: results.length,
      summary,
      notifications,
      data: results,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown ingest error';
    const durationMs = Date.now() - startedAt;

    console.error('[Ingest Cron] failure', {
      requestId,
      durationMs,
      error: message,
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      { success: false, error: message, requestId, durationMs },
      { status: 500 },
    );
  }
}

function summarizeResults(
  results: Array<{ type?: string | null; cardId?: string | null; newPriceId?: string | null }>,
) {
  let cardsUpdated = 0;
  let etbsUpdated = 0;

  for (const result of results) {
    if (result.type === 'ETB') {
      etbsUpdated += 1;
    } else {
      cardsUpdated += 1;
    }
  }

  return {
    cardsUpdated,
    etbsUpdated,
  };
}
