import Link from 'next/link';
import '../dashboard/page.css';
import './page.css';
import { requireUser } from '../../lib/auth';
import prisma from '../../lib/prisma';
import { normalizeCardImageUrl } from '../../lib/cardImages';
import { addToWatchlistAction, removeFromWatchlistAction } from '../watchlist/actions';

export const dynamic = 'force-dynamic';

type SearchParams = {
  q?: string;
  set?: string;
  minPrice?: string;
  maxPrice?: string;
  sort?: string;
  page?: string;
};

const PAGE_SIZE = 99;

type CollectionItem = {
  id: string;
  cardId: string | null;
  name: string;
  setName: string;
  number: string | null;
  imageUrl: string | null;
  latestPrice: number | null;
  latestDate: Date | null;
};

export default async function CollectionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const resolvedSearchParams = await searchParams;
  const query = resolvedSearchParams.q?.trim() ?? '';
  const selectedSet = resolvedSearchParams.set?.trim() ?? '';
  const minPrice = parseNumber(resolvedSearchParams.minPrice);
  const maxPrice = parseNumber(resolvedSearchParams.maxPrice);
  const sort = resolvedSearchParams.sort ?? 'updated';
  const currentPage = parsePage(resolvedSearchParams.page);

  const [trackedItems, watchlistItems] = await Promise.all([
    prisma.trackedItem.findMany({
      where: {
        type: 'CARD',
      },
      include: {
        prices: {
          orderBy: { date: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.watchlistItem.findMany({
      where: { userId: user.id },
      select: { trackedItemId: true },
    }),
  ]);

  const watchlistIds = new Set(watchlistItems.map((entry) => entry.trackedItemId));

  const allItems: CollectionItem[] = trackedItems.map((item) => {
    const latest = item.prices[0];
    return {
      id: item.id,
      cardId: item.cardId,
      name: item.name,
      setName: item.setName,
      number: item.number,
      imageUrl: item.imageUrl,
      latestPrice: latest?.fairValue ?? latest?.tcgplayerPrice ?? latest?.ebayPrice ?? null,
      latestDate: latest?.date ?? null,
    };
  });

  const availableSets = Array.from(new Set(allItems.map((item) => item.setName))).sort((a, b) =>
    a.localeCompare(b),
  );

  const filteredItems = allItems
    .filter((item) => {
      if (
        query &&
        ![item.name, item.setName, item.cardId ?? '', item.number ?? '']
          .join(' ')
          .toLowerCase()
          .includes(query.toLowerCase())
      ) {
        return false;
      }

      if (selectedSet && item.setName !== selectedSet) {
        return false;
      }

      if (minPrice != null && (item.latestPrice == null || item.latestPrice < minPrice)) {
        return false;
      }

      if (maxPrice != null && (item.latestPrice == null || item.latestPrice > maxPrice)) {
        return false;
      }

      return true;
    })
    .sort((left, right) => sortItems(left, right, sort));

  const pricedItems = filteredItems.filter((item) => item.latestPrice != null);
  const avgPrice =
    pricedItems.length > 0
      ? pricedItems.reduce((sum, item) => sum + (item.latestPrice ?? 0), 0) / pricedItems.length
      : null;
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const paginatedItems = filteredItems.slice(pageStart, pageStart + PAGE_SIZE);
  const pageEnd = filteredItems.length === 0 ? 0 : pageStart + paginatedItems.length;

  return (
    <div className="dashboard fade-in collections-page">
      <header className="dashboard-header collections-header">
        <div className="header-title">
          <h1>Collections</h1>
          <p className="subtitle">Filter by set, price range, and search terms to find the cards you care about.</p>
        </div>
      </header>

      <section className="collections-summary">
        <div className="metric-card retro-panel">
          <div className="metric-content">
            <span className="metric-label">Visible Cards</span>
            <span className="metric-value">{filteredItems.length}</span>
          </div>
        </div>
        <div className="metric-card retro-panel">
          <div className="metric-content">
            <span className="metric-label">Sets In View</span>
            <span className="metric-value">{new Set(filteredItems.map((item) => item.setName)).size}</span>
          </div>
        </div>
        <div className="metric-card retro-panel">
          <div className="metric-content">
            <span className="metric-label">Average Price</span>
            <span className="metric-value">{avgPrice != null ? formatMoney(avgPrice) : 'No price yet'}</span>
          </div>
        </div>
      </section>

      <section className="retro-panel collections-filters">
        <form className="filter-grid" action="/collections" method="get">
          <label className="filter-field">
            <span>Search</span>
            <input name="q" type="search" defaultValue={query} placeholder="Name, set, card id" />
          </label>
          <label className="filter-field">
            <span>Set</span>
            <select name="set" defaultValue={selectedSet}>
              <option value="">All sets</option>
              {availableSets.map((setName) => (
                <option key={setName} value={setName}>
                  {setName}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-field">
            <span>Min Price</span>
            <input name="minPrice" type="number" min="0" step="0.01" defaultValue={resolvedSearchParams.minPrice ?? ''} placeholder="0.00" />
          </label>
          <label className="filter-field">
            <span>Max Price</span>
            <input name="maxPrice" type="number" min="0" step="0.01" defaultValue={resolvedSearchParams.maxPrice ?? ''} placeholder="100.00" />
          </label>
          <label className="filter-field">
            <span>Sort</span>
            <select name="sort" defaultValue={sort}>
              <option value="updated">Recently updated</option>
              <option value="price-desc">Price: high to low</option>
              <option value="price-asc">Price: low to high</option>
              <option value="name">Name A-Z</option>
              <option value="set">Set A-Z</option>
            </select>
          </label>
          <div className="filter-actions">
            <button type="submit" className="btn-retro blue">
              Apply Filters
            </button>
            <a href="/collections" className="btn-retro clear">
              Reset
            </a>
          </div>
        </form>
      </section>

      <section className="collections-grid">
        {paginatedItems.length ? (
          paginatedItems.map((item) => (
            <div key={item.id} className="collection-card retro-panel">
              <div className="collection-art">
                <Link href={`/dashboard?cardId=${encodeURIComponent(item.cardId ?? '')}&range=1M`} className="collection-art-link">
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
                      <Link href={`/dashboard?cardId=${encodeURIComponent(item.cardId ?? '')}&range=1M`} className="collection-title-link">
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
                  <span className="collection-badge">{item.setName}</span>
                  <span className="collection-badge muted">
                    {item.latestDate ? `Updated ${formatDate(item.latestDate)}` : 'No snapshot yet'}
                  </span>
                </div>
                <div className="collection-actions">
                  <Link
                    href={`/dashboard?cardId=${encodeURIComponent(item.cardId ?? '')}&range=1M`}
                    className="btn-retro btn-inline"
                  >
                    View Chart
                  </Link>
                  {watchlistIds.has(item.id) ? (
                    <form action={removeFromWatchlistAction}>
                      <input type="hidden" name="trackedItemId" value={item.id} />
                      <input type="hidden" name="redirectTo" value={buildCollectionsRedirect(resolvedSearchParams)} />
                      <button type="submit" className="btn-retro clear btn-inline">
                        Remove from Watchlist
                      </button>
                    </form>
                  ) : (
                    <form action={addToWatchlistAction}>
                      <input type="hidden" name="trackedItemId" value={item.id} />
                      <input type="hidden" name="redirectTo" value={buildCollectionsRedirect(resolvedSearchParams)} />
                      <button type="submit" className="btn-retro blue btn-inline">
                        Add to Watchlist
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="retro-panel collections-empty">
            <strong>No cards matched these filters.</strong>
            <span className="text-muted">Try widening the price bounds or clearing the set filter.</span>
          </div>
        )}
      </section>

      {filteredItems.length ? (
        <section className="collections-pagination retro-panel">
          <div className="pagination-summary text-muted">
            Showing {pageStart + 1}-{pageEnd} of {filteredItems.length} cards
          </div>
          <div className="pagination-controls">
            <Link
              href={buildCollectionsPageHref(resolvedSearchParams, safePage - 1)}
              className={`btn-retro clear pagination-btn ${safePage <= 1 ? 'disabled' : ''}`}
              aria-disabled={safePage <= 1}
              tabIndex={safePage <= 1 ? -1 : undefined}
            >
              Previous
            </Link>
            <span className="pagination-page">
              Page {safePage} of {totalPages}
            </span>
            <Link
              href={buildCollectionsPageHref(resolvedSearchParams, safePage + 1)}
              className={`btn-retro clear pagination-btn ${safePage >= totalPages ? 'disabled' : ''}`}
              aria-disabled={safePage >= totalPages}
              tabIndex={safePage >= totalPages ? -1 : undefined}
            >
              Next
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function buildCollectionsRedirect(searchParams: SearchParams) {
  const url = new URLSearchParams();
  if (searchParams.q) url.set('q', searchParams.q);
  if (searchParams.set) url.set('set', searchParams.set);
  if (searchParams.minPrice) url.set('minPrice', searchParams.minPrice);
  if (searchParams.maxPrice) url.set('maxPrice', searchParams.maxPrice);
  if (searchParams.sort) url.set('sort', searchParams.sort);
  if (searchParams.page && searchParams.page !== '1') url.set('page', searchParams.page);
  const query = url.toString();
  return query ? `/collections?${query}` : '/collections';
}

function buildCollectionsPageHref(searchParams: SearchParams, page: number) {
  const url = new URLSearchParams();
  if (searchParams.q) url.set('q', searchParams.q);
  if (searchParams.set) url.set('set', searchParams.set);
  if (searchParams.minPrice) url.set('minPrice', searchParams.minPrice);
  if (searchParams.maxPrice) url.set('maxPrice', searchParams.maxPrice);
  if (searchParams.sort) url.set('sort', searchParams.sort);
  if (page > 1) url.set('page', String(page));
  const query = url.toString();
  return query ? `/collections?${query}` : '/collections';
}

function parseNumber(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePage(value: string | undefined) {
  if (!value) return 1;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return 1;
  }
  return parsed;
}

function sortItems(left: CollectionItem, right: CollectionItem, sort: string) {
  switch (sort) {
    case 'price-desc':
      return (right.latestPrice ?? -1) - (left.latestPrice ?? -1);
    case 'price-asc':
      return (left.latestPrice ?? Number.MAX_SAFE_INTEGER) - (right.latestPrice ?? Number.MAX_SAFE_INTEGER);
    case 'name':
      return left.name.localeCompare(right.name);
    case 'set':
      return left.setName.localeCompare(right.setName) || left.name.localeCompare(right.name);
    case 'updated':
    default:
      return (right.latestDate?.getTime() ?? 0) - (left.latestDate?.getTime() ?? 0);
  }
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}
