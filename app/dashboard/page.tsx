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
  ebayLowPrice: number | null;
  isSynthetic: boolean;
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

  const [trackedItems, trackedItemCount, searchResults] = await Promise.all([
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
  ]);

  const dashboardSnapshotTake = Math.min(
    Math.max(trackedItemCount * TREND_MIN_POINTS, 3000),
    12000,
  );

  const dashboardSnapshots = await prisma.priceSnapshot.findMany({
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
    take: dashboardSnapshotTake,
  });

  const fallbackCardId = trackedItems[0]?.cardId ?? searchResults[0]?.cardId ?? undefined;
  const activeCardId = resolvedSearchParams?.cardId ?? fallbackCardId;
  const activeItem =
    trackedItems.find((item) => item.cardId === activeCardId) ??
    searchResults.find((item) => item.cardId === activeCardId) ??
    trackedItems[0] ??
    searchResults[0];

  const series = activeCardId ? await getPriceSeriesForCard(activeCardId) : [];
  const chartData = filterSeriesByRange(series, activeRange);
  const realSnapshots = dashboardSnapshots.filter((snapshot) => !snapshot.isSynthetic);
  const metricSummary = buildMetricSummary(realSnapshots);
  const signals = buildSignals(realSnapshots);

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
                {metricSummary.trendLabel}
                {metricSummary.trendLabel === 'Flat' ? null : (
                  <>
                    {' '}
                    <span className={metricSummary.delta >= 0 ? 'trend-up' : 'trend-down'}>
                      {formatPercent(metricSummary.delta)}
                    </span>
                  </>
                )}
              </span>
            ) : (
              <>
                <span className="metric-value">Insufficient history</span>
                <span className="metric-subvalue">
                  Need at least {TREND_MIN_CARDS} cards with {TREND_MIN_POINTS}+ snapshots to estimate a market move.
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
            <span className="metric-subvalue">
              Based on {metricSummary.opportunityCoverage} cards with eBay low-listing matches.
            </span>
          </div>
        </div>

        <div className="metric-card retro-panel alert-card" id="metric-discrepancies">
          <div className="metric-icon" style={{ color: 'var(--color-trend-down)' }}>
            <AlertTriangle size={24} />
          </div>
          <div className="metric-content">
            <span className="metric-label">Price Discrepancies</span>
            <span className="metric-value">{metricSummary.discrepancies} High Priority</span>
            <span className="metric-subvalue">
              Based on {metricSummary.discrepancyCoverage} cards with both eBay and TCGplayer pricing.
            </span>
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
            <PriceChart data={chartData} />
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
  const discrepancies = latestByCard.filter(hasHighPriorityDiscrepancy).length;
  const opportunities = latestByCard.filter(hasBuyOpportunity).length;
  const trendCandidates = getTrendCandidates(snapshots);
  const delta =
    trendCandidates.length >= TREND_MIN_CARDS ? median(trendCandidates) : 0;

  return {
    delta,
    opportunities,
    discrepancies,
    opportunityCoverage: latestByCard.filter(
      (snapshot) => snapshot.fairValue != null && snapshot.ebayLowPrice != null,
    ).length,
    discrepancyCoverage: latestByCard.filter(
      (snapshot) => snapshot.tcgplayerPrice != null && snapshot.ebayPrice != null,
    ).length,
    hasTrend: trendCandidates.length >= TREND_MIN_CARDS,
    trendLabel: delta >= 2 ? 'Bullish' : delta <= -2 ? 'Cooling' : 'Flat',
  };
}

function buildSignals(
  snapshots: DashboardSnapshot[],
): Signal[] {
  return getLatestSnapshotsByCard(snapshots)
    .flatMap((snapshot) => {
      const title = `${snapshot.item.name} (${snapshot.item.setName})`;
      const signals: Signal[] = [];

      if (hasBuyOpportunity(snapshot)) {
        const fairValue = snapshot.fairValue ?? 0;
        const ebayPrice = snapshot.ebayLowPrice ?? 0;

        signals.push({
          id: `${snapshot.id}-buy`,
          label: 'BUY SIGNAL',
          tone: 'buy',
          title,
          reason: `Consensus value ${formatMoney(fairValue)} vs lowest eBay listing ${formatMoney(ebayPrice)}.`,
          value: formatMoney(fairValue - ebayPrice),
        });
      }

      if (hasArbitrageSpread(snapshot)) {
        const tcgPrice = snapshot.tcgplayerPrice ?? 0;
        const ebayPrice = snapshot.ebayPrice ?? 0;
        const delta = ((tcgPrice - ebayPrice) / Math.max(tcgPrice, ebayPrice)) * 100;

        signals.push({
          id: `${snapshot.id}-arb`,
          label: 'ARBITRAGE',
          tone: 'arbitrage',
          title,
          reason: `TCGplayer ${formatMoney(tcgPrice)} vs eBay ${formatMoney(ebayPrice)}.`,
          value: formatPercent(delta),
        });
      }

      return signals;
    })
    .sort((left, right) => {
      const leftValue = parseSignalValue(left.value);
      const rightValue = parseSignalValue(right.value);
      return rightValue - leftValue;
    })
    .slice(0, 5);
}

const TREND_MIN_POINTS = 3;
const TREND_MIN_CARDS = 5;
const TREND_MIN_PRICE = 5;
const TREND_MAX_CARDS = 60;

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
  const absoluteSpread =
    tcgPrice != null && ebayPrice != null ? Math.abs(tcgPrice - ebayPrice) : 0;

  return (
    tcgPrice != null &&
    ebayPrice != null &&
    absoluteSpread >= 0.75 &&
    Math.abs(tcgPrice - ebayPrice) / Math.max(tcgPrice, ebayPrice) >= 0.1
  );
}

function hasHighPriorityDiscrepancy(snapshot: DashboardSnapshot) {
  const tcgPrice = snapshot.tcgplayerPrice;
  const ebayPrice = snapshot.ebayPrice;
  const absoluteSpread =
    tcgPrice != null && ebayPrice != null ? Math.abs(tcgPrice - ebayPrice) : 0;

  return (
    tcgPrice != null &&
    ebayPrice != null &&
    absoluteSpread >= 1 &&
    Math.abs(tcgPrice - ebayPrice) / Math.max(tcgPrice, ebayPrice) >= 0.12
  );
}

function hasBuyOpportunity(snapshot: DashboardSnapshot) {
  const fairValue = snapshot.fairValue;
  const ebayPrice = snapshot.ebayLowPrice;

  if (fairValue == null || ebayPrice == null) {
    return false;
  }

  const spread = fairValue - ebayPrice;
  return spread >= 0.75 && fairValue > ebayPrice * 1.08;
}

function getTrendCandidates(snapshots: DashboardSnapshot[]) {
  const grouped = new Map<string, DashboardSnapshot[]>();
  const latestByCard = getLatestSnapshotsByCard(snapshots);
  const eligibleCardIds = new Set(
    latestByCard
      .filter((snapshot) => {
        const currentPrice = getSnapshotPrice(snapshot);
        return currentPrice != null && currentPrice >= TREND_MIN_PRICE;
      })
      .sort((left, right) => (getSnapshotPrice(right) ?? 0) - (getSnapshotPrice(left) ?? 0))
      .slice(0, TREND_MAX_CARDS)
      .map((snapshot) => snapshot.trackedItemId),
  );

  for (const snapshot of snapshots) {
    if (!eligibleCardIds.has(snapshot.trackedItemId)) {
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

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
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

function parseSignalValue(value: string) {
  return Number.parseFloat(value.replace(/[^0-9.-]/g, '')) || 0;
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
