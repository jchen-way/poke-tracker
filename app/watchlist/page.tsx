import Link from 'next/link';
import '../dashboard/page.css';
import '../collections/page.css';
import { requireUser } from '../../lib/auth';
import prisma from '../../lib/prisma';
import { normalizeCardImageUrl } from '../../lib/cardImages';
import { buildTrackedItemChartHref } from '../../lib/trackedItemLinks';
import { addToWatchlistAction, removeFromWatchlistAction } from './actions';

export const dynamic = 'force-dynamic';

type SearchParams = {
  q?: string;
};

type WatchlistDisplayItem = {
  id: string;
  cardId: string | null;
  name: string;
  setName: string;
  number: string | null;
  type: string;
  imageUrl: string | null;
  latestPrice: number | null;
};

export default async function WatchlistPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const resolvedSearchParams = await searchParams;
  const query = resolvedSearchParams.q?.trim() ?? '';

  const [watchlistEntries, searchCandidates] = await Promise.all([
    prisma.watchlistItem.findMany({
      where: { userId: user.id },
      include: {
        item: {
          include: {
            prices: {
              orderBy: { date: 'desc' },
              take: 1,
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.trackedItem.findMany({
      where: query
        ? {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { setName: { contains: query, mode: 'insensitive' } },
              { cardId: { contains: query, mode: 'insensitive' } },
              { number: { contains: query, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { updatedAt: 'desc' },
      take: 18,
      include: {
        prices: {
          orderBy: { date: 'desc' },
          take: 1,
        },
      },
    }),
  ]);

  const watchedIds = new Set(watchlistEntries.map((entry) => entry.trackedItemId));
  const watchlistItems = watchlistEntries.map((entry) => mapTrackedItem(entry.item));

  return (
    <div className="dashboard fade-in collections-page">
      <header className="dashboard-header collections-header">
        <div className="header-title">
          <h1>Watchlist</h1>
          <p className="subtitle">
            Watchlisted cards and ETBs are prioritized first in the refresh queue for more frequent checks.
          </p>
        </div>
      </header>

      <section className="collections-summary">
        <div className="metric-card retro-panel">
          <div className="metric-content">
            <span className="metric-label">Watched Items</span>
            <span className="metric-value">{watchlistItems.length}</span>
          </div>
        </div>
        <div className="metric-card retro-panel">
          <div className="metric-content">
            <span className="metric-label">Refresh Priority</span>
            <span className="metric-value">Highest</span>
          </div>
        </div>
        <div className="metric-card retro-panel">
          <div className="metric-content">
            <span className="metric-label">Current Cadence</span>
            <span className="metric-value">Every 3 Hours</span>
          </div>
        </div>
      </section>

      <section className="retro-panel collections-filters">
        <form className="filter-grid" action="/watchlist" method="get">
          <label className="filter-field">
            <span>Search Catalog</span>
            <input name="q" type="search" defaultValue={query} placeholder="Name, set, or tracked id" />
          </label>
          <div className="filter-actions">
            <button type="submit" className="btn-retro blue">
              Search
            </button>
            <a href="/watchlist" className="btn-retro clear">
              Reset
            </a>
          </div>
        </form>
      </section>

      <section className="retro-panel collections-filters">
        <div className="section-header">
          <h3>Your Priority Items</h3>
        </div>
        <div className="collections-grid">
          {watchlistItems.length ? (
            watchlistItems.map((item) => <WatchlistCard key={item.id} item={item} query={query} watched={true} />)
          ) : (
            <div className="retro-panel collections-empty">
              <strong>No watchlist items yet.</strong>
              <span className="text-muted">Search below and add cards or ETBs you want checked most often.</span>
            </div>
          )}
        </div>
      </section>

      <section className="retro-panel collections-filters">
        <div className="section-header">
          <h3>{query ? 'Search Results' : 'Recently Updated Items'}</h3>
        </div>
        <div className="collections-grid">
          {searchCandidates.length ? (
            searchCandidates.map((item) => (
              <WatchlistCard
                key={item.id}
                item={mapTrackedItem(item)}
                query={query}
                watched={watchedIds.has(item.id)}
              />
            ))
          ) : (
            <div className="retro-panel collections-empty">
              <strong>No items matched that search.</strong>
              <span className="text-muted">Try a broader product name or set name.</span>
            </div>
          )}
        </div>
      </section>

    </div>
  );
}

function WatchlistCard({
  item,
  query,
  watched,
}: {
  item: WatchlistDisplayItem;
  query: string;
  watched: boolean;
}) {
  const href = buildTrackedItemChartHref(item);

  return (
    <div className="collection-card retro-panel">
      <div className="collection-art">
        <Link href={href} className="collection-art-link">
          {normalizeCardImageUrl(item.imageUrl) ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={normalizeCardImageUrl(item.imageUrl) ?? ''} alt={item.name} />
              <div className="collection-art-preview" aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={normalizeCardImageUrl(item.imageUrl) ?? ''} alt="" />
              </div>
            </>
          ) : (
            <div className="collection-art-placeholder">{item.name.slice(0, 1)}</div>
          )}
        </Link>
      </div>
      <div className="collection-card-body">
        <div className="collection-card-top">
          <div>
            <h3>
              <Link href={href} className="collection-title-link">
                {item.name}
              </Link>
            </h3>
            <p className="text-muted">
              {item.setName}
              {item.type === 'CARD' && item.number ? ` #${item.number}` : ''}
            </p>
          </div>
          <div className="collection-price-block">
            <span className="collection-card-id">{item.type === 'ETB' ? 'ETB' : item.cardId}</span>
            <strong>{item.latestPrice != null ? formatMoney(item.latestPrice) : 'No price yet'}</strong>
          </div>
        </div>
        <div className="collection-meta-row">
          <span className="collection-badge">{item.type === 'ETB' ? 'Elite Trainer Box' : 'Priority Refresh'}</span>
        </div>
        <div className="collection-actions">
          {watched ? (
            <form action={removeFromWatchlistAction}>
              <input type="hidden" name="trackedItemId" value={item.id} />
              <input type="hidden" name="redirectTo" value={query ? `/watchlist?q=${encodeURIComponent(query)}` : '/watchlist'} />
              <button type="submit" className="btn-retro clear btn-inline">
                {item.type === 'ETB' ? 'Remove ETB' : 'Remove'}
              </button>
            </form>
          ) : (
            <form action={addToWatchlistAction}>
              <input type="hidden" name="trackedItemId" value={item.id} />
              <input type="hidden" name="redirectTo" value={query ? `/watchlist?q=${encodeURIComponent(query)}` : '/watchlist'} />
              <button type="submit" className="btn-retro blue btn-inline">
                Add to Watchlist
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function mapTrackedItem(item: {
  id: string;
  cardId: string | null;
  name: string;
  setName: string;
  number: string | null;
  type: string;
  imageUrl: string | null;
  prices: Array<{
    fairValue: number | null;
    tcgplayerPrice: number | null;
    ebayPrice: number | null;
  }>;
}) {
  return {
    id: item.id,
    cardId: item.cardId,
    name: item.name,
    setName: item.setName,
    number: item.number,
    type: item.type,
    imageUrl: item.imageUrl,
    latestPrice:
      item.prices[0]?.fairValue ??
      item.prices[0]?.tcgplayerPrice ??
      item.prices[0]?.ebayPrice ??
      null,
  };
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}
