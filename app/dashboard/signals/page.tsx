import Link from 'next/link';
import '../page.css';
import { requireUser } from '../../../lib/auth';
import { fetchDashboardSnapshots } from '../../../lib/dashboardData';
import { buildSignals, filterRealSnapshots } from '../../../lib/dashboardSignals';

export const dynamic = 'force-dynamic';

export default async function SignalsPage() {
  await requireUser();
  const signals = buildSignals(filterRealSnapshots(await fetchDashboardSnapshots()), 0);

  return (
    <div className="dashboard details-page fade-in">
      <div className="details-header">
        <div>
          <h1>Recent Signals</h1>
          <p>
            The strongest current buy and arbitrage flags, ranked by spread magnitude and linked to eBay for review.
          </p>
        </div>
        <Link className="btn-retro blue" href="/dashboard">
          Back to Dashboard
        </Link>
      </div>

      <section className="retro-panel collections-panel">
        <div className="section-header">
          <h3>{signals.length} current signals</h3>
        </div>
        <div className="details-list">
          {signals.length ? (
            signals.map((signal) => (
              <article className="detail-item" key={signal.id}>
                <div className="detail-main">
                  <span className={`detail-label ${signal.tone}`}>{signal.label}</span>
                  <div className="detail-title">{signal.title}</div>
                  <div className="detail-reason">{signal.reason}</div>
                  <div className="detail-actions">
                    {signal.cardId ? (
                      <Link className="btn-retro blue small" href={`/dashboard?cardId=${encodeURIComponent(signal.cardId)}&range=1M`}>
                        View Chart
                      </Link>
                    ) : null}
                    <a className="btn-retro small" href={signal.ebayUrl} rel="noreferrer" target="_blank">
                      Open eBay
                    </a>
                  </div>
                </div>
                <div className={`detail-value ${signal.tone === 'arbitrage' ? 'alert-price highlight' : ''}`}>
                  {signal.value}
                </div>
              </article>
            ))
          ) : (
            <div className="search-empty text-muted">
              No current signals passed the stricter trust and spread filters.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
