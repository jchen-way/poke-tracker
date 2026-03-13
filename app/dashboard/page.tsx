import Link from 'next/link';
import { Activity, BellRing, TrendingUp, AlertTriangle } from 'lucide-react';
import './page.css';
import PriceChart from '../components/PriceChart';
import CardSearch from '../components/CardSearch';
import { getPriceSeriesForCard } from '../../lib/dataIngestion';
import { requireUser } from '../../lib/auth';
import prisma from '../../lib/prisma';

export const dynamic = 'force-dynamic';

type SearchParams = {
  cardId?: string;
  range?: string;
  q?: string;
};

type Signal = {
  id: string;
  label: 'BUY SIGNAL' | 'ARBITRAGE';
  tone: 'buy' | 'arbitrage';
  title: string;
  reason: string;
  value: string;
};

type DashboardSnapshot = {
  id: string;
  trackedItemId: string;
  date: Date;
  fairValue: number | null;
  tcgplayerPrice: number | null;
  ebayPrice: number | null;
  item: {
    name: string;
    setName: string;
  };
};

type SearchItem = {
  id: string;
  cardId: string | null;
  name: string;
  setName: string;
  number: string | null;
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireUser();
  const resolvedSearchParams = await searchParams;
  const activeRange = resolvedSearchParams?.range ?? '1M';
  const searchQuery = resolvedSearchParams?.q?.trim() ?? '';

  const [trackedItems, trackedItemCount, searchResults, dashboardSnapshots] = await Promise.all([
    prisma.trackedItem.findMany({
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.trackedItem.count(),
    prisma.trackedItem.findMany({
      where: searchQuery
        ? {
            OR: [
              { name: { contains: searchQuery, mode: 'insensitive' } },
              { setName: { contains: searchQuery, mode: 'insensitive' } },
              { cardId: { contains: searchQuery, mode: 'insensitive' } },
            ],
          }
        : undefined,
      take: 8,
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.priceSnapshot.findMany({
      where: {
        item: {
          cardId: {
            not: null,
          },
        },
      },
      include: {
        item: true,
      },
      orderBy: { date: 'desc' },
      take: 1500,
    }),
  ]);

  const fallbackCardId = trackedItems[0]?.cardId ?? searchResults[0]?.cardId ?? undefined;
  const activeCardId = resolvedSearchParams?.cardId ?? fallbackCardId;
  const activeItem =
    trackedItems.find((item) => item.cardId === activeCardId) ??
    searchResults.find((item) => item.cardId === activeCardId) ??
    trackedItems[0] ??
    searchResults[0];

  const series = activeCardId ? await getPriceSeriesForCard(activeCardId) : [];
  const chartData = filterSeriesByRange(series, activeRange);
  const metricSummary = buildMetricSummary(dashboardSnapshots);
  const signals = buildSignals(dashboardSnapshots);

  return (
    <div className="dashboard fade-in">
      <header className="dashboard-header">
        <div className="header-title">
          <h1>
            PokeTracker <span className="text-gradient">Pro</span>
          </h1>
          <p className="subtitle">Live card pricing, recent moves, and collection coverage from your database.</p>
        </div>

        <div className="header-actions">
          <Link href="/collections" className="btn-retro blue">
            View Collection
          </Link>
          <button className="btn-icon hover-scale" aria-label="Notifications" id="btn-notifications">
            <BellRing size={20} />
            {metricSummary.discrepancies > 0 ? <span className="badge-pulse"></span> : null}
          </button>
        </div>
      </header>

      <div className="metrics-grid">
        <div className="metric-card retro-panel" id="metric-market-trend">
          <div className="metric-icon" style={{ color: 'var(--color-accent-cyan)' }}>
            <Activity size={24} />
          </div>
          <div className="metric-content">
            <span className="metric-label">Market Trend</span>
            {metricSummary.hasTrend ? (
              <span className="metric-value">
                {metricSummary.trendLabel}{' '}
                <span className={metricSummary.delta >= 0 ? 'trend-up' : 'trend-down'}>
                  {formatPercent(metricSummary.delta)}
                </span>
              </span>
            ) : (
              <>
                <span className="metric-value">Insufficient history</span>
                <span className="metric-subvalue">
                  Need at least {TREND_MIN_CARDS} cards with {TREND_MIN_POINTS}+ snapshots across {TREND_WINDOW_DAYS} days.
                </span>
              </>
            )}
          </div>
        </div>

        <div className="metric-card retro-panel" id="metric-opportunities">
          <div className="metric-icon" style={{ color: 'var(--color-accent-gold)' }}>
            <TrendingUp size={24} />
          </div>
          <div className="metric-content">
            <span className="metric-label">Active Opportunities</span>
            <span className="metric-value">{metricSummary.opportunities} Cards</span>
          </div>
        </div>

        <div className="metric-card retro-panel alert-card" id="metric-discrepancies">
          <div className="metric-icon" style={{ color: 'var(--color-trend-down)' }}>
            <AlertTriangle size={24} />
          </div>
          <div className="metric-content">
            <span className="metric-label">Price Discrepancies</span>
            <span className="metric-value">{metricSummary.discrepancies} High Priority</span>
          </div>
        </div>
      </div>

      <div className="main-content-grid">
        <section className="chart-section retro-panel" id="main-chart-panel">
          <div className="section-header">
            <div className="chart-header-main">
              <div>
                <h2>{activeItem?.name ?? 'Search for a card'}</h2>
                <p className="chart-subtitle text-muted">
                  {activeItem?.setName ?? 'Use the search bar to load a tracked card from your database.'}
                </p>
              </div>
              <div className="chart-controls">
                {['1W', '1M', 'YTD'].map((range) => (
                  <Link
                    key={range}
                    href={`/dashboard?cardId=${encodeURIComponent(activeCardId ?? '')}&range=${range}${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ''}`}
                    className={`chip ${activeRange === range ? 'active' : ''}`}
                  >
                    {range}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className="search-row">
            <CardSearch
              range={activeRange}
              initialQuery={searchQuery}
              activeCardId={activeCardId ?? null}
              items={trackedItems.map(mapSearchItem)}
            />
            <div className="tracked-summary text-muted">
              {trackedItemCount} tracked now
            </div>
          </div>

          {searchQuery ? (
            <div className="search-results">
              {searchResults.length ? (
                searchResults.map((item) => (
                  <Link
                    key={item.id}
                    href={`/dashboard?cardId=${encodeURIComponent(item.cardId ?? '')}&range=${activeRange}&q=${encodeURIComponent(searchQuery)}`}
                    className={`search-result ${item.cardId === activeCardId ? 'active' : ''}`}
                  >
                    <span>{item.name}</span>
                    <span className="text-muted">
                      {item.setName}
                      {item.number ? ` #${item.number}` : ''}
                    </span>
                  </Link>
                ))
              ) : (
                <div className="search-empty text-muted">No tracked cards matched that search yet.</div>
              )}
            </div>
          ) : null}

          <div className="chart-container-placeholder">
            <PriceChart data={chartData} range={activeRange} />
          </div>

          <div className="technical-indicators">
            <div className="indicator">
              <span className="indicator-dot" style={{ backgroundColor: 'var(--color-accent-gold)' }}></span>
              EMA 8
            </div>
            <div className="indicator">
              <span className="indicator-dot" style={{ backgroundColor: 'var(--color-accent-cyan)' }}></span>
              EMA 20
            </div>
            <div className="indicator">
              <span className="indicator-dot" style={{ backgroundColor: 'var(--color-accent-magenta)' }}></span>
              EMA 50
            </div>
          </div>
        </section>

        <aside className="alerts-sidebar retro-panel" id="recent-alerts-panel">
          <div className="section-header">
            <h3>Recent Signals</h3>
          </div>
          <div className="alerts-list">
            {signals.length ? (
              signals.map((signal) => (
                <div className="alert-item" key={signal.id}>
                  <div className={`alert-indicator ${signal.tone}`}></div>
                  <div className="alert-details">
                    <strong>{signal.label}</strong>
                    <span>{signal.title}</span>
                    <span className="alert-reason text-muted">{signal.reason}</span>
                  </div>
                  <div className={`alert-price ${signal.tone === 'arbitrage' ? 'highlight' : ''}`}>
                    {signal.value}
                  </div>
                </div>
              ))
            ) : (
              <div className="search-empty text-muted">No signals yet. Ingest more history to generate meaningful trends.</div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function filterSeriesByRange(
  series: Awaited<ReturnType<typeof getPriceSeriesForCard>>,
  activeRange: string,
) {
  if (series.length <= 1) {
    return series;
  }

  const lastDate = new Date(series[series.length - 1].date);
  const daysForRange: Record<string, number> = {
    '1D': 1,
    '1W': 7,
    '1M': 30,
  };

  if (activeRange === 'YTD') {
    const yearStart = new Date(lastDate.getFullYear(), 0, 1);
    return series.filter((point) => new Date(point.date) >= yearStart);
  }

  const days = daysForRange[activeRange];
  if (!days) {
    return series;
  }

  const cutoff = new Date(lastDate);
  cutoff.setDate(cutoff.getDate() - days + 1);
  return series.filter((point) => new Date(point.date) >= cutoff);
}

function buildMetricSummary(
  snapshots: DashboardSnapshot[],
) {
  const latestByCard = getLatestSnapshotsByCard(snapshots);
  const discrepancies = latestByCard.filter(hasArbitrageSpread).length;
  const opportunities = discrepancies;
  const trendCandidates = getTrendCandidates(snapshots);
  const delta =
    trendCandidates.length >= TREND_MIN_CARDS
      ? trendCandidates.reduce((sum, move) => sum + move, 0) / trendCandidates.length
      : 0;

  return {
    delta,
    opportunities,
    discrepancies,
    hasTrend: trendCandidates.length >= TREND_MIN_CARDS,
    trendLabel: delta >= 2 ? 'Bullish' : delta <= -2 ? 'Cooling' : 'Flat',
  };
}

function buildSignals(
  snapshots: DashboardSnapshot[],
): Signal[] {
  return getLatestSnapshotsByCard(snapshots)
    .filter(hasArbitrageSpread)
    .map((snapshot) => {
      const tcgPrice = snapshot.tcgplayerPrice ?? 0;
      const ebayPrice = snapshot.ebayPrice ?? 0;
      const delta = ((tcgPrice - ebayPrice) / Math.max(tcgPrice, ebayPrice)) * 100;

      return {
        id: `${snapshot.id}-arb`,
        label: 'ARBITRAGE' as const,
        tone: 'arbitrage' as const,
        title: `${snapshot.item.name} (${snapshot.item.setName})`,
        reason: `TCGplayer ${formatMoney(tcgPrice)} vs eBay ${formatMoney(ebayPrice)}.`,
        value: formatPercent(delta),
      };
    })
    .slice(0, 5);
}

const TREND_WINDOW_DAYS = 30;
const TREND_MIN_POINTS = 3;
const TREND_MIN_CARDS = 5;

function getLatestSnapshotsByCard(snapshots: DashboardSnapshot[]) {
  const latestByCard = new Map<string, DashboardSnapshot>();

  for (const snapshot of snapshots) {
    if (!latestByCard.has(snapshot.trackedItemId)) {
      latestByCard.set(snapshot.trackedItemId, snapshot);
    }
  }

  return Array.from(latestByCard.values());
}

function hasArbitrageSpread(snapshot: DashboardSnapshot) {
  const tcgPrice = snapshot.tcgplayerPrice;
  const ebayPrice = snapshot.ebayPrice;

  return (
    tcgPrice != null &&
    ebayPrice != null &&
    Math.abs(tcgPrice - ebayPrice) / Math.max(tcgPrice, ebayPrice) >= 0.12
  );
}

function getTrendCandidates(snapshots: DashboardSnapshot[]) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - TREND_WINDOW_DAYS);

  const grouped = new Map<string, DashboardSnapshot[]>();

  for (const snapshot of snapshots) {
    if (snapshot.date < cutoff) {
      continue;
    }

    const group = grouped.get(snapshot.trackedItemId) ?? [];
    group.push(snapshot);
    grouped.set(snapshot.trackedItemId, group);
  }

  const moves: number[] = [];

  for (const cardSnapshots of grouped.values()) {
    const ordered = [...cardSnapshots].sort((left, right) => left.date.getTime() - right.date.getTime());
    if (ordered.length < TREND_MIN_POINTS) {
      continue;
    }

    const firstPrice = getSnapshotPrice(ordered[0]);
    const lastPrice = getSnapshotPrice(ordered[ordered.length - 1]);
    if (firstPrice == null || lastPrice == null || firstPrice === 0) {
      continue;
    }

    moves.push(((lastPrice - firstPrice) / firstPrice) * 100);
  }

  return moves;
}

function getSnapshotPrice(snapshot: DashboardSnapshot) {
  return snapshot.fairValue ?? snapshot.tcgplayerPrice ?? snapshot.ebayPrice;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

function formatPercent(value: number) {
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(1)}%`;
}

function mapSearchItem(item: SearchItem) {
  return {
    id: item.id,
    cardId: item.cardId,
    name: item.name,
    setName: item.setName,
    number: item.number,
  };
}
