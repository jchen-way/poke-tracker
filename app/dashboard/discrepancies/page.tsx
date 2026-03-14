import Link from 'next/link';
import '../page.css';
import { requireUser } from '../../../lib/auth';
import { fetchDashboardSnapshots } from '../../../lib/dashboardData';
import {
  filterRealSnapshots,
  formatMoney,
  formatPercent,
  getLatestSnapshotsByCard,
  hasHighPriorityDiscrepancy,
} from '../../../lib/dashboardSignals';
import { buildEbaySearchUrl } from '../../../lib/ebaySearch';
import { buildTcgplayerSearchUrl } from '../../../lib/tcgplayerSearch';

export const dynamic = 'force-dynamic';

export default async function DiscrepanciesPage() {
  await requireUser();
  const snapshots = filterRealSnapshots(await fetchDashboardSnapshots());
  const discrepancies = getLatestSnapshotsByCard(snapshots)
    .filter(hasHighPriorityDiscrepancy)
    .map((snapshot) => {
      const tcgplayerPrice = snapshot.tcgplayerPrice ?? 0;
      const ebayLowPrice = snapshot.ebayLowPrice ?? 0;
      const spread = tcgplayerPrice - ebayLowPrice;
      const delta = (Math.abs(spread) / Math.max(tcgplayerPrice, ebayLowPrice)) * 100;

      return {
        id: snapshot.id,
        title: `${snapshot.item.name} (${snapshot.item.setName})`,
        cardId: snapshot.item.cardId ?? null,
        reason: `TCGplayer ${formatMoney(tcgplayerPrice)} vs matched eBay listing ${formatMoney(ebayLowPrice)}.`,
        value: formatPercent(delta),
        spreadValue: spread,
        tcgplayerUrl: buildTcgplayerSearchUrl({
          name: snapshot.item.name,
          setName: snapshot.item.setName,
          localId: snapshot.item.number ?? null,
        }),
        ebayUrl:
          snapshot.ebayLowListingUrl ??
          buildEbaySearchUrl({
            name: snapshot.item.name,
            setName: snapshot.item.setName,
            localId: snapshot.item.number ?? null,
          }),
      };
    })
    .sort((left, right) => Math.abs(right.spreadValue) - Math.abs(left.spreadValue));

  return (
    <div className="dashboard details-page fade-in">
      <div className="details-header">
        <div>
          <h1>Price Discrepancies</h1>
          <p>
            Cards where a matched eBay listing and TCGplayer are far enough apart to deserve manual review.
          </p>
        </div>
        <Link className="btn-retro blue" href="/dashboard">
          Back to Dashboard
        </Link>
      </div>

      <section className="retro-panel collections-panel">
        <div className="section-header">
          <h3>{discrepancies.length} high-priority discrepancies</h3>
        </div>
        <div className="details-list">
          {discrepancies.length ? (
            discrepancies.map((discrepancy) => (
              <article className="detail-item" key={discrepancy.id}>
                <div className="detail-main">
                  <span className="detail-label discrepancy">Discrepancy</span>
                  <div className="detail-title">{discrepancy.title}</div>
                  <div className="detail-reason">{discrepancy.reason}</div>
                  <div className="detail-actions">
                    {discrepancy.cardId ? (
                      <Link className="btn-retro blue small" href={`/dashboard?cardId=${encodeURIComponent(discrepancy.cardId)}&range=1M`}>
                        View Chart
                      </Link>
                    ) : null}
                    <a className="btn-retro small" href={discrepancy.ebayUrl} rel="noreferrer" target="_blank">
                      Open eBay
                    </a>
                    <a className="btn-retro small" href={discrepancy.tcgplayerUrl} rel="noreferrer" target="_blank">
                      Check TCGplayer
                    </a>
                  </div>
                </div>
                <div className="detail-value">{discrepancy.value}</div>
              </article>
            ))
          ) : (
            <div className="search-empty text-muted">
              No current discrepancies met the stricter cross-market review threshold.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
