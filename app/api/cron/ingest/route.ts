import { NextResponse } from 'next/server';
import { syncPokemonMarketData } from '../../../../lib/dataIngestion';

export async function GET(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const requestSecret = request.headers.get('x-cron-secret');
      if (requestSecret !== cronSecret) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
      }
    }

    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const discoverLimitParam = searchParams.get('discoverLimit');
    const historyDaysParam = searchParams.get('historyDays');
    const historyPointsParam = searchParams.get('historyPoints');
    const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
    const discoverLimit = discoverLimitParam
      ? Number.parseInt(discoverLimitParam, 10)
      : undefined;
    const historyDays = historyDaysParam
      ? Number.parseInt(historyDaysParam, 10)
      : undefined;
    const historyPoints = historyPointsParam
      ? Number.parseInt(historyPointsParam, 10)
      : undefined;

    const results = await syncPokemonMarketData({
      limit: Number.isFinite(limit) && (limit as number) > 0 ? limit : undefined,
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
    });
    return NextResponse.json({ success: true, count: results.length, data: results });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown ingest error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
