import Link from 'next/link';
import '../dashboard/page.css';
import '../collections/page.css';
import { requireUser } from '../../lib/auth';
import prisma from '../../lib/prisma';
import { normalizeCardImageUrl } from '../../lib/cardImages';
import { buildEbayEtbSearchUrl } from '../../lib/ebaySearch';
import { buildTrackedItemChartHref } from '../../lib/trackedItemLinks';
import { fetchKnownEtbs } from '../../lib/etbCatalog';
import { addKnownEtbToWatchlistAction } from './actions';
import { removeFromWatchlistAction } from '../watchlist/actions';

export const dynamic = 'force-dynamic';

type SearchParams = {
  q?: string;
  minPrice?: string;
  maxPrice?: string;
  sort?: string;
  page?: string;
};

type DisplayEtb = {
  id: string | null;
  trackedId: string;
  name: string;
  setName: string;
  type: 'ETB';
  imageUrl: string | null;
  latestPrice: number | null;
  latestDate: Date | null;
  isWatchlisted: boolean;
  isTracked: boolean;
  priceLabel: string;
};

export default async function EtbsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const resolvedSearchParams = await searchParams;
  const query = resolvedSearchParams.q?.trim() ?? '';
  const minPrice = parseNumber(resolvedSearchParams.minPrice);
  const maxPrice = parseNumber(resolvedSearchParams.maxPrice);
  const sort = resolvedSearchParams.sort ?? 'updated';
  const page = parsePage(resolvedSearchParams.page);
  const pageSize = 99;

  const [knownCatalog, trackedEtbs, watchlistItems] = await Promise.all([
    fetchKnownEtbs(query),
    prisma.trackedItem.findMany({
      where: { type: 'ETB' },
      include: {
        prices: {
          orderBy: { date: 'desc' },
          take: 1,
        },
      },
      orderBy: [
        { watchlistEntries: { _count: 'desc' } },
        { updatedAt: 'desc' },
      ],
    }),
    prisma.watchlistItem.findMany({
      where: { userId: user.id },
      select: { trackedItemId: true },
    }),
  ]);

  const trackedByCardId = new Map(
    trackedEtbs
      .filter((item): item is typeof item & { cardId: string } => Boolean(item.cardId))
      .map((item) => [item.cardId, item]),
  );
  const watchlistIds = new Set(watchlistItems.map((entry) => entry.trackedItemId));

  const allEtbs = knownCatalog
    .map<DisplayEtb>((catalogItem) => {
      const tracked = trackedByCardId.get(catalogItem.trackedId) ?? null;
      const latestSnapshot = tracked?.prices[0] ?? null;
      const snapshotPrice =
        latestSnapshot?.fairValue ??
        latestSnapshot?.ebayPrice ??
        latestSnapshot?.ebayLowPrice ??
        null;

      return {
        id: tracked?.id ?? null,
        trackedId: catalogItem.trackedId,
        name: tracked?.name ?? catalogItem.name,
        setName: tracked?.setName ?? catalogItem.setName,
        type: 'ETB',
        imageUrl: tracked?.imageUrl ?? catalogItem.imageUrl ?? null,
        latestPrice:
          snapshotPrice ??
          catalogItem.ebayMedianPrice ??
          catalogItem.ebayLowPrice ??
          null,
        latestDate: latestSnapshot?.date ?? null,
        isTracked: Boolean(tracked),
        isWatchlisted: tracked ? watchlistIds.has(tracked.id) : false,
        priceLabel: snapshotPrice != null ? 'Latest Snapshot' : 'eBay Median',
      };
    });

  const displayEtbs = allEtbs
    .filter((item) => {
      if (minPrice != null && (item.latestPrice == null || item.latestPrice < minPrice)) {
        return false;
      }

      if (maxPrice != null && (item.latestPrice == null || item.latestPrice > maxPrice)) {
        return false;
      }

      return true;
    })
    .sort((left, right) => sortEtbs(left, right, sort));

  const pricedEtbs = displayEtbs.filter((item) => item.latestPrice != null);
  const averagePrice =
    pricedEtbs.length > 0
      ? pricedEtbs.reduce((sum, item) => sum + (item.latestPrice ?? 0), 0) / pricedEtbs.length
      : null;
  const totalItems = displayEtbs.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const pagedEtbs = displayEtbs.slice(startIndex, endIndex);

  return (
    <div className="dashboard fade-in collections-page">
      <header className="dashboard-header collections-header">
        <div className="header-title">
          <h1>ETBs</h1>
          <p className="subtitle">
            Browse validated Elite Trainer Boxes, watchlist the ones you care about, and open the main dashboard for charting when they have pricing.
          </p>
        </div>
      </header>

      <section className="collections-summary">
        <div className="metric-card retro-panel">
          <div className="metric-content">
            <span className="metric-label">Validated ETBs</span>
            <span className="metric-value">{displayEtbs.length}</span>
          </div>
        </div>
        <div className="metric-card retro-panel">
          <div className="metric-content">
            <span className="metric-label">Watchlisted</span>
            <span className="metric-value">{displayEtbs.filter((item) => item.isWatchlisted).length}</span>
          </div>
        </div>
        <div className="metric-card retro-panel">
          <div className="metric-content">
            <span className="metric-label">Average ETB Price</span>
            <span className="metric-value">{averagePrice != null ? formatMoney(averagePrice) : 'No price yet'}</span>
          </div>
        </div>
      </section>

      <section className="retro-panel collections-filters">
        <form className="filter-grid etb-filter-grid" action="/etbs" method="get">
          <label className="filter-field">
            <span>Search</span>
            <input name="q" type="search" defaultValue={query} placeholder="ETB name or set" />
          </label>
          <label className="filter-field">
            <span>Min Price</span>
            <input name="minPrice" type="number" min="0" step="0.01" defaultValue={resolvedSearchParams.minPrice ?? ''} placeholder="0.00" />
          </label>
          <label className="filter-field">
            <span>Max Price</span>
            <input name="maxPrice" type="number" min="0" step="0.01" defaultValue={resolvedSearchParams.maxPrice ?? ''} placeholder="200.00" />
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
            <a href="/etbs" className="btn-retro clear">
              Reset
            </a>
          </div>
        </form>
      </section>

      <section className="collections-grid">
        {pagedEtbs.length ? (
          pagedEtbs.map((item) => (
            <div key={item.trackedId} className="collection-card retro-panel">
              <div className="collection-art">
                {normalizeCardImageUrl(item.imageUrl) ? (
                  <div className="collection-art-link">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={normalizeCardImageUrl(item.imageUrl) ?? ''} alt={item.name} />
                    <div className="collection-art-preview" aria-hidden="true">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={normalizeCardImageUrl(item.imageUrl) ?? ''} alt="" />
                    </div>
                  </div>
                ) : (
                  <div className="collection-art-placeholder">ETB</div>
                )}
              </div>
              <div className="collection-card-body">
                <div className="collection-card-top">
                  <div>
                    <h3>{item.name}</h3>
                    <p className="text-muted">{item.setName}</p>
                  </div>
                  <div className="collection-price-block">
                    <span className="collection-card-id">ETB</span>
                    <strong>{item.latestPrice != null ? formatMoney(item.latestPrice) : 'No price yet'}</strong>
                    {item.latestPrice != null ? (
                      <span className="collection-price-caption">{item.priceLabel}</span>
                    ) : null}
                  </div>
                </div>
                <div className="collection-meta-row">
                  <span className="collection-badge">Elite Trainer Box</span>
                  <span className="collection-badge muted">
                    {item.latestDate
                      ? `Updated ${formatDate(item.latestDate)}`
                      : item.isTracked
                        ? 'Waiting for first refresh'
                        : 'Validated eBay listing'}
                  </span>
                </div>
                <div className="collection-actions">
                  {item.isTracked ? (
                    <Link href={buildTrackedItemChartHref({ id: item.id!, type: 'ETB' })} className="btn-retro btn-inline">
                      View Chart
                    </Link>
                  ) : null}
                  <a
                    href={buildEbayEtbSearchUrl({
                      name: item.name,
                      setName: item.setName,
                    })}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-retro clear btn-inline"
                  >
                    Open eBay
                  </a>
                  {item.isWatchlisted && item.id ? (
                    <form action={removeFromWatchlistAction}>
                      <input type="hidden" name="trackedItemId" value={item.id} />
                      <input type="hidden" name="redirectTo" value={buildEtbRedirect(resolvedSearchParams)} />
                      <button type="submit" className="btn-retro clear btn-inline">
                        Remove from Watchlist
                      </button>
                    </form>
                  ) : (
                    <form action={addKnownEtbToWatchlistAction}>
                      <input type="hidden" name="trackedId" value={item.trackedId} />
                      <input type="hidden" name="redirectTo" value={buildEtbRedirect(resolvedSearchParams)} />
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
            <strong>No ETBs matched that search.</strong>
            <span className="text-muted">Only background-validated ETBs are shown here.</span>
          </div>
        )}
      </section>

      {displayEtbs.length ? (
        <section className="retro-panel collections-pagination">
          <div className="pagination-summary">
            Showing {startIndex + 1}-{endIndex} of {totalItems} ETBs
          </div>
          <div className="pagination-controls">
            <a
              href={buildEtbRedirect(resolvedSearchParams, Math.max(1, currentPage - 1))}
              className={`btn-retro btn-inline pagination-btn${currentPage === 1 ? ' disabled' : ''}`}
            >
              Previous
            </a>
            <span className="pagination-page">
              Page {currentPage} of {totalPages}
            </span>
            <a
              href={buildEtbRedirect(resolvedSearchParams, Math.min(totalPages, currentPage + 1))}
              className={`btn-retro btn-inline pagination-btn${currentPage === totalPages ? ' disabled' : ''}`}
            >
              Next
            </a>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function sortEtbs(left: DisplayEtb, right: DisplayEtb, sort: string) {
  switch (sort) {
    case 'price-desc':
      return (right.latestPrice ?? -1) - (left.latestPrice ?? -1);
    case 'price-asc':
      return (left.latestPrice ?? Number.MAX_SAFE_INTEGER) - (right.latestPrice ?? Number.MAX_SAFE_INTEGER);
    case 'name':
      return left.name.localeCompare(right.name);
    case 'set':
      return left.setName.localeCompare(right.setName);
    case 'updated':
    default:
      return (right.latestDate?.getTime() ?? 0) - (left.latestDate?.getTime() ?? 0);
  }
}

function parseNumber(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function buildEtbRedirect(searchParams: SearchParams, page?: number) {
  const next = new URLSearchParams();
  if (searchParams.q) next.set('q', searchParams.q);
  if (searchParams.minPrice) next.set('minPrice', searchParams.minPrice);
  if (searchParams.maxPrice) next.set('maxPrice', searchParams.maxPrice);
  if (searchParams.sort) next.set('sort', searchParams.sort);
  if (page && page > 1) next.set('page', String(page));
  const suffix = next.toString();
  return suffix ? `/etbs?${suffix}` : '/etbs';
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}
