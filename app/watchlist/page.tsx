import Link from 'next/link';
import '../dashboard/page.css';
import '../collections/page.css';
import { requireUser } from '../../lib/auth';
import prisma from '../../lib/prisma';
import { normalizeCardImageUrl } from '../../lib/cardImages';
import { addToWatchlistAction, removeFromWatchlistAction } from './actions';

export const dynamic = 'force-dynamic';

type SearchParams = {
  q?: string;
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
  const watchlistCards = watchlistEntries.map((entry) => ({
    id: entry.item.id,
    cardId: entry.item.cardId,
    name: entry.item.name,
    setName: entry.item.setName,
    number: entry.item.number,
    imageUrl: entry.item.imageUrl,
    latestPrice:
      entry.item.prices[0]?.fairValue ??
      entry.item.prices[0]?.tcgplayerPrice ??
      entry.item.prices[0]?.ebayPrice ??
      null,
  }));

  return (
    <div className="dashboard fade-in collections-page">
      <header className="dashboard-header collections-header">
        <div className="header-title">
          <h1>Watchlist</h1>
          <p className="subtitle">
            Cards on your watchlist are prioritized first in the refresh queue for more frequent checks.
          </p>
        </div>
      </header>

      <section className="collections-summary">
        <div className="metric-card retro-panel">
          <div className="metric-content">
            <span className="metric-label">Watched Cards</span>
            <span className="metric-value">{watchlistCards.length}</span>
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
            <input name="q" type="search" defaultValue={query} placeholder="Name, set, card id" />
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
          <h3>Your Priority Cards</h3>
        </div>
        <div className="collections-grid">
          {watchlistCards.length ? (
            watchlistCards.map((item) => (
              <div key={item.id} className="collection-card retro-panel">
                <div className="collection-art">
                  <Link
                    href={`/dashboard?cardId=${encodeURIComponent(item.cardId ?? '')}&range=1M`}
                    className="collection-art-link"
                  >
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
                        <Link
                          href={`/dashboard?cardId=${encodeURIComponent(item.cardId ?? '')}&range=1M`}
                          className="collection-title-link"
                        >
                          {item.name}
                        </Link>
                      </h3>
                      <p className="text-muted">
                        {item.setName}
                        {item.number ? ` #${item.number}` : ''}
                      </p>
                    </div>
                    <div className="collection-price-block">
                      <span className="collection-card-id">{item.cardId}</span>
                      <strong>{item.latestPrice != null ? formatMoney(item.latestPrice) : 'No price yet'}</strong>
                    </div>
                  </div>
                  <div className="collection-meta-row">
                    <span className="collection-badge">Priority Refresh</span>
                  </div>
                  <div className="collection-actions">
                    <form action={removeFromWatchlistAction}>
                      <input type="hidden" name="trackedItemId" value={item.id} />
                      <input type="hidden" name="redirectTo" value={query ? `/watchlist?q=${encodeURIComponent(query)}` : '/watchlist'} />
                      <button type="submit" className="btn-retro clear btn-inline">
                        Remove
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="retro-panel collections-empty">
              <strong>No watchlist cards yet.</strong>
              <span className="text-muted">Search below and add cards you want checked most often.</span>
            </div>
          )}
        </div>
      </section>

      <section className="retro-panel collections-filters">
        <div className="section-header">
          <h3>{query ? 'Search Results' : 'Recently Updated Cards'}</h3>
        </div>
        <div className="collections-grid">
          {searchCandidates.length ? (
            searchCandidates.map((item) => {
              const latest = item.prices[0];
              const latestPrice = latest?.fairValue ?? latest?.tcgplayerPrice ?? latest?.ebayPrice ?? null;

              return (
                <div key={item.id} className="collection-card retro-panel">
                  <div className="collection-art">
                    <Link
                      href={`/dashboard?cardId=${encodeURIComponent(item.cardId ?? '')}&range=1M`}
                      className="collection-art-link"
                    >
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
                          <Link
                            href={`/dashboard?cardId=${encodeURIComponent(item.cardId ?? '')}&range=1M`}
                            className="collection-title-link"
                          >
                            {item.name}
                          </Link>
                        </h3>
                        <p className="text-muted">
                          {item.setName}
                          {item.number ? ` #${item.number}` : ''}
                        </p>
                      </div>
                      <div className="collection-price-block">
                        <span className="collection-card-id">{item.cardId}</span>
                        <strong>{latestPrice != null ? formatMoney(latestPrice) : 'No price yet'}</strong>
                      </div>
                    </div>
                    <div className="collection-actions">
                      {watchedIds.has(item.id) ? (
                        <form action={removeFromWatchlistAction}>
                          <input type="hidden" name="trackedItemId" value={item.id} />
                          <input type="hidden" name="redirectTo" value={query ? `/watchlist?q=${encodeURIComponent(query)}` : '/watchlist'} />
                          <button type="submit" className="btn-retro clear btn-inline">
                            Remove from Watchlist
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
            })
          ) : (
            <div className="retro-panel collections-empty">
              <strong>No cards matched that search.</strong>
              <span className="text-muted">Try a broader set name or card name.</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}
