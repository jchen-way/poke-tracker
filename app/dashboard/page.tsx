import Link from 'next/link';
import { Activity, BellRing, TrendingUp, AlertTriangle } from 'lucide-react';
import './page.css';
import PriceChart from '../components/PriceChart';
import CardSearch from '../components/CardSearch';
import { getPriceSeriesForCard } from '../../lib/dataIngestion';
import { requireUser } from '../../lib/auth';
import { fetchDashboardSnapshots } from '../../lib/dashboardData';
import {
  buildMetricSummary,
  buildSignals,
  filterRealSnapshots,
  formatPercent,
  TREND_MIN_CARDS,
  TREND_MIN_POINTS,
  type DashboardSnapshot,
} from '../../lib/dashboardSignals';
import prisma from '../../lib/prisma';

export const dynamic = 'force-dynamic';

type SearchParams = {
  cardId?: string;
  range?: string;
  q?: string;
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

  const dashboardSnapshots = await fetchDashboardSnapshots();

  const fallbackCardId = trackedItems[0]?.cardId ?? searchResults[0]?.cardId ?? undefined;
  const activeCardId = resolvedSearchParams?.cardId ?? fallbackCardId;
  const activeItem =
    trackedItems.find((item) => item.cardId === activeCardId) ??
    searchResults.find((item) => item.cardId === activeCardId) ??
    trackedItems[0] ??
    searchResults[0];

  const series = activeCardId ? await getPriceSeriesForCard(activeCardId) : [];
  const chartData = filterSeriesByRange(series, activeRange);
  const realSnapshots = filterRealSnapshots(dashboardSnapshots as DashboardSnapshot[]);
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
        <Link className="metric-card retro-panel metric-link" id="metric-market-trend" href="/dashboard/signals">
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
        </Link>

        <Link className="metric-card retro-panel metric-link" id="metric-opportunities" href="/dashboard/opportunities">
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
        </Link>

        <Link className="metric-card retro-panel alert-card metric-link" id="metric-discrepancies" href="/dashboard/discrepancies">
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
        </Link>
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
                <a
                  className="alert-item"
                  href={signal.ebayUrl}
                  key={signal.id}
                  rel="noreferrer"
                  target="_blank"
                >
                  <div className={`alert-indicator ${signal.tone}`}></div>
                  <div className="alert-details">
                    <strong>{signal.label}</strong>
                    <span>{signal.title}</span>
                    <span className="alert-reason text-muted">{signal.reason}</span>
                  </div>
                  <div className={`alert-price ${signal.tone === 'arbitrage' ? 'highlight' : ''}`}>
                    {signal.value}
                  </div>
                </a>
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

function mapSearchItem(item: SearchItem) {
  return {
    id: item.id,
    cardId: item.cardId,
    name: item.name,
    setName: item.setName,
    number: item.number,
  };
}
