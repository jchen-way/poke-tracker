import Link from 'next/link';
import '../page.css';
import { requireUser } from '../../../lib/auth';
import { fetchDashboardSnapshots } from '../../../lib/dashboardData';
import {
  filterRealSnapshots,
  formatMoney,
  getLatestSnapshotsByCard,
  hasBuyOpportunity,
} from '../../../lib/dashboardSignals';
import { buildEbaySearchUrl } from '../../../lib/ebaySearch';
import { buildTcgplayerSearchUrl } from '../../../lib/tcgplayerSearch';

export const dynamic = 'force-dynamic';

export default async function OpportunitiesPage() {
  await requireUser();
  const snapshots = filterRealSnapshots(await fetchDashboardSnapshots());
  const opportunities = getLatestSnapshotsByCard(snapshots)
    .filter(hasBuyOpportunity)
    .map((snapshot) => {
      const fairValue = snapshot.fairValue ?? 0;
      const ebayLowPrice = snapshot.ebayLowPrice ?? 0;
      const ebayMedianPrice = snapshot.ebayPrice ?? 0;
      return {
        id: snapshot.id,
        title: `${snapshot.item.name} (${snapshot.item.setName})`,
        cardId: snapshot.item.cardId ?? null,
        value: fairValue - ebayLowPrice,
        reason: `Consensus ${formatMoney(fairValue)} vs matched eBay listing ${formatMoney(ebayLowPrice)} with eBay median ${formatMoney(ebayMedianPrice)}.`,
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
    .sort((left, right) => right.value - left.value);

  return (
    <div className="dashboard details-page fade-in">
      <div className="details-header">
        <div>
          <h1>Active Opportunities</h1>
          <p>
            Cards where the current eBay floor looks materially below the stricter consensus value.
          </p>
        </div>
        <Link className="btn-retro blue" href="/dashboard">
          Back to Dashboard
        </Link>
      </div>

      <section className="retro-panel collections-panel">
        <div className="section-header">
          <h3>{opportunities.length} live opportunities</h3>
        </div>
        <div className="details-list">
          {opportunities.length ? (
            opportunities.map((opportunity) => (
              <article className="detail-item" key={opportunity.id}>
                <div className="detail-main">
                  <span className="detail-label buy">Buy Signal</span>
                  <div className="detail-title">{opportunity.title}</div>
                  <div className="detail-reason">{opportunity.reason}</div>
                  <div className="detail-actions">
                    {opportunity.cardId ? (
                      <Link className="btn-retro blue small" href={`/dashboard?cardId=${encodeURIComponent(opportunity.cardId)}&range=1M`}>
                        View Chart
                      </Link>
                    ) : null}
                    <a className="btn-retro small" href={opportunity.ebayUrl} rel="noreferrer" target="_blank">
                      Open eBay
                    </a>
                    <a className="btn-retro small" href={opportunity.tcgplayerUrl} rel="noreferrer" target="_blank">
                      Check TCGplayer
                    </a>
                  </div>
                </div>
                <div className="detail-value">{formatMoney(opportunity.value)}</div>
              </article>
            ))
          ) : (
            <div className="search-empty text-muted">
              No current opportunities matched the stricter buy-signal rules.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
