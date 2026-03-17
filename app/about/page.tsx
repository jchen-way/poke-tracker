import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  BellRing,
  Boxes,
  ChartCandlestick,
  Eye,
  Radar,
  SearchCheck,
} from 'lucide-react';
import { getCurrentUser } from '../../lib/auth';
import CursorAura from '../components/CursorAura';
import PointerTilt from '../components/PointerTilt';

export const metadata: Metadata = {
  title: 'About',
  description:
    'Learn how PokeTracker helps Pokemon TCG collectors and deal hunters track cards, ETBs, watchlists, and pricing signals faster.',
  alternates: {
    canonical: '/about',
  },
  openGraph: {
    title: 'About PokeTracker',
    description:
      'Learn how PokeTracker helps Pokemon TCG collectors and deal hunters track cards, ETBs, watchlists, and pricing signals faster.',
    url: '/about',
  },
};

const proofHighlights = [
  { title: 'Watchlists first', label: 'Priority items stay in front of the queue.' },
  { title: 'Cards + ETBs', label: 'Singles and sealed product live in one workflow.' },
  { title: 'Review faster', label: 'Signals lead directly into listing checks.' },
];

const capabilities = [
  {
    title: 'Spot the gap',
    copy: 'See discrepancies, spreads, and watchlist priorities without doing the same search ten times.',
    icon: Radar,
  },
  {
    title: 'Validate fast',
    copy: 'Jump straight into eBay and TCGplayer checks when something actually looks actionable.',
    icon: SearchCheck,
  },
  {
    title: 'Track the stuff that matters',
    copy: 'Cards, ETBs, watchlists, and dashboard history stay connected instead of living in separate tools.',
    icon: Boxes,
  },
];

const audience = ['Collectors', 'Deal hunters', 'Sealed product watchers', 'Market nerds', 'Spreadsheet escapees'];

const workflow = [
  'Track cards and ETBs you actually care about.',
  'Surface signals worth checking.',
  'Open the real listings and decide fast.',
];

export default async function AboutPage() {
  const user = await getCurrentUser();

  return (
    <div className="about-page fade-in">
      <CursorAura variant="about" />
      <section className="about-hero">
        <div className="about-copy">
          <span className="about-kicker pixel-text">Learn More</span>
          <h1>Less digging. More signal.</h1>
          <p className="about-lead text-muted">
            PokéTracker turns scattered card searches into one calmer market workspace for cards, ETBs, watchlists,
            and signal review.
          </p>

          <div className="about-actions">
            {user ? (
              <>
                <Link id="about-open-dashboard" href="/dashboard" className="btn-retro blue">
                  Open Dashboard
                  <ArrowRight size={18} />
                </Link>
                <Link id="about-login" href="/settings" className="btn-retro clear pixel-text">
                  Account Settings
                </Link>
              </>
            ) : (
              <>
                <Link id="about-create-account" href="/register" className="btn-retro blue">
                  Create Account
                  <ArrowRight size={18} />
                </Link>
                <Link id="about-login-hero" href="/login" className="btn-retro clear pixel-text">
                  Sign In
                </Link>
              </>
            )}
          </div>

          <div className="proof-strip">
            {proofHighlights.map((item) => (
              <article key={item.title} className="proof-chip">
                <span className="proof-title pixel-text">{item.title}</span>
                <span className="proof-label">{item.label}</span>
              </article>
            ))}
          </div>
        </div>

        <PointerTilt className="about-stage-wrapper" maxTilt={6}>
          <div className="about-stage retro-panel">
            <div className="stage-shell">
              <div className="stage-card stage-card-primary">
                <div className="stage-card-header">
                  <span className="pixel-text">Signal Board</span>
                  <ChartCandlestick size={18} />
                </div>
                <div className="stage-signal positive">
                  <span className="signal-tag pixel-text">Buy Signal</span>
                  <strong>eBay below consensus on a watched card</strong>
                  <span>Open listing, verify, decide.</span>
                </div>
                <div className="stage-signal caution">
                  <span className="signal-tag pixel-text">Discrepancy</span>
                  <strong>Marketplace mismatch worth manual review</strong>
                  <span>Check the source before the spread closes.</span>
                </div>
              </div>

              <div className="stage-card stage-card-glass">
                <div className="stage-card-header">
                  <span className="pixel-text">Priority Watchlist</span>
                  <Eye size={18} />
                </div>
                <div className="watch-row">
                  <span>High priority cards</span>
                  <strong>Refresh first</strong>
                </div>
                <div className="watch-row">
                  <span>Tracked ETBs</span>
                  <strong>Same dashboard</strong>
                </div>
              </div>

              <div className="stage-card stage-card-alert">
                <BellRing size={18} />
                <div>
                  <span className="pixel-text">Account Alerts</span>
                  <p>Display name, password, and email signal preferences live in one place.</p>
                </div>
              </div>
            </div>
          </div>
        </PointerTilt>
      </section>

      <section className="about-section">
        <div className="section-heading">
          <span className="pixel-text">What You Actually Get</span>
          <h2>Built to shorten the path from “interesting” to “worth acting on.”</h2>
        </div>

        <div className="capability-grid">
          {capabilities.map(({ title, copy, icon: Icon }) => (
            <article key={title} className="capability-card retro-panel">
              <div className="capability-icon">
                <Icon size={22} />
              </div>
              <h3 className="pixel-text">{title}</h3>
              <p className="text-muted">{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="about-section audience-section">
        <div className="retro-panel audience-panel">
          <div className="section-heading compact">
            <span className="pixel-text">Who It Fits</span>
            <h2>For people who watch the Pokemon market on purpose.</h2>
          </div>

          <div className="audience-chips">
            {audience.map((item) => (
              <span key={item} className="audience-chip">
                {item}
              </span>
            ))}
          </div>

          <div className="workflow-panel">
            <div className="workflow-copy">
              <span className="pixel-text">Simple Loop</span>
              <h3>Track. Review. Verify.</h3>
            </div>

            <div className="workflow-steps">
              {workflow.map((step, index) => (
                <div key={step} className="workflow-step">
                  <span className="workflow-index pixel-text">0{index + 1}</span>
                  <span>{step}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="about-section">
        <div className="cta-panel retro-panel">
          <div className="cta-copy">
            <span className="pixel-text">Call To Action</span>
            <h2>Set up a watchlist and start checking higher-quality signals.</h2>
            <p className="text-muted">
              Create an account, add priority items, and use the dashboard as the place where pricing context,
              signals, and direct listing checks come together.
            </p>
          </div>

          <div className="cta-actions">
            {user ? (
              <>
                <Link id="about-open-dashboard-footer" href="/dashboard" className="btn-retro blue">
                  Open Dashboard
                  <ArrowRight size={18} />
                </Link>
                <Link id="about-watchlist" href="/watchlist" className="btn-retro clear pixel-text">
                  Open Watchlist
                </Link>
              </>
            ) : (
              <>
                <Link id="about-get-started" href="/register" className="btn-retro blue">
                  Get Started
                  <ArrowRight size={18} />
                </Link>
                <Link id="about-login-footer" href="/login" className="btn-retro clear pixel-text">
                  Log In
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      <style>{`
        .about-page {
          max-width: 1280px;
          margin: 0 auto;
          padding: 2.5rem 5% 5rem;
        }

        .about-hero {
          display: grid;
          grid-template-columns: minmax(0, 1.05fr) minmax(360px, 0.95fr);
          gap: 2rem;
          align-items: stretch;
          margin-bottom: 3rem;
        }

        .about-copy {
          padding: 0.75rem 0;
        }

        .about-kicker,
        .section-heading span,
        .workflow-copy span,
        .cta-copy span {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.95rem;
          color: var(--color-text-muted);
          font-size: 0.92rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .about-copy h1 {
          max-width: 16ch;
          line-height: 1.08;
          margin-bottom: 1rem;
        }

        .section-heading h2 {
          max-width: 26ch;
          line-height: 1.18;
          margin-bottom: 1rem;
        }

        .cta-copy h2 {
          max-width: 24ch;
          line-height: 1.16;
          margin-bottom: 1rem;
        }

        .about-lead {
          max-width: 56ch;
          font-size: 1.08rem;
          line-height: 1.85;
          margin-bottom: 1.75rem;
        }

        .about-actions,
        .cta-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.9rem;
        }

        .proof-strip {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 1rem;
          margin-top: 2rem;
        }

        .proof-chip {
          padding: 1rem 1.1rem;
          border: 1.5px solid rgba(44, 62, 80, 0.14);
          border-radius: 18px;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.78), rgba(255, 255, 255, 0.58));
          backdrop-filter: blur(12px);
          box-shadow: 0 14px 30px rgba(44, 62, 80, 0.08);
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
        }

        .proof-title {
          font-size: 0.98rem;
          color: var(--color-text-main);
        }

        .proof-label {
          color: var(--color-text-muted);
          line-height: 1.55;
          font-size: 0.94rem;
        }

        .about-stage,
        .capability-card,
        .audience-panel,
        .cta-panel {
          padding: 2rem;
          border-width: 2px;
        }

        .about-stage {
          background:
            radial-gradient(circle at top right, rgba(160, 196, 255, 0.22), transparent 30%),
            radial-gradient(circle at bottom left, rgba(255, 170, 165, 0.18), transparent 28%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.82), rgba(255, 255, 255, 0.7));
        }

        .stage-shell {
          display: grid;
          gap: 1rem;
          height: 100%;
        }

        .stage-card {
          border: 1.5px solid rgba(44, 62, 80, 0.16);
          border-radius: 20px;
          padding: 1.1rem 1.15rem;
          background: rgba(255, 255, 255, 0.72);
          backdrop-filter: blur(14px);
          box-shadow: 0 14px 28px rgba(44, 62, 80, 0.09);
        }

        .stage-card-primary {
          display: grid;
          gap: 0.85rem;
        }

        .stage-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          color: var(--color-text-main);
        }

        .stage-signal {
          border-radius: 16px;
          padding: 0.9rem 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
        }

        .stage-signal.positive {
          background: linear-gradient(180deg, rgba(74, 222, 128, 0.16), rgba(255, 255, 255, 0.66));
          border: 1px solid rgba(74, 222, 128, 0.22);
        }

        .stage-signal.caution {
          background: linear-gradient(180deg, rgba(250, 204, 21, 0.16), rgba(255, 255, 255, 0.66));
          border: 1px solid rgba(250, 204, 21, 0.22);
        }

        .signal-tag {
          color: var(--color-text-muted);
          font-size: 0.82rem;
        }

        .stage-signal strong,
        .watch-row strong {
          font-size: 0.98rem;
        }

        .stage-signal span:last-child,
        .watch-row span {
          color: var(--color-text-muted);
          line-height: 1.45;
        }

        .stage-card-glass {
          display: grid;
          gap: 0.75rem;
        }

        .watch-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          border-radius: 14px;
          background: rgba(160, 196, 255, 0.1);
          padding: 0.8rem 0.9rem;
        }

        .stage-card-alert {
          display: flex;
          gap: 0.9rem;
          align-items: flex-start;
          background: linear-gradient(180deg, rgba(232, 121, 249, 0.12), rgba(255, 255, 255, 0.7));
        }

        .stage-card-alert p {
          margin: 0.35rem 0 0;
          color: var(--color-text-muted);
        }

        .about-section {
          margin-top: 2.75rem;
        }

        .section-heading {
          margin-bottom: 1.5rem;
        }

        .section-heading.compact {
          margin-bottom: 1.1rem;
        }

        .capability-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 1.4rem;
        }

        .capability-card {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          min-height: 100%;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.84), rgba(255, 255, 255, 0.68)),
            rgba(255, 255, 255, 0.74);
        }

        .capability-icon {
          width: 54px;
          height: 54px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 16px;
          border: 2px solid var(--color-border-dark);
          background: linear-gradient(135deg, rgba(160, 196, 255, 0.68), rgba(168, 230, 207, 0.82));
          box-shadow: 4px 4px 0 var(--color-border-dark);
        }

        .capability-card p {
          margin: 0;
        }

        .audience-panel {
          background:
            radial-gradient(circle at top left, rgba(160, 196, 255, 0.18), transparent 24%),
            radial-gradient(circle at bottom right, rgba(255, 170, 165, 0.16), transparent 24%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.84), rgba(255, 255, 255, 0.7));
        }

        .audience-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 0.85rem;
          margin-top: 1.25rem;
        }

        .audience-chip {
          padding: 0.8rem 1rem;
          border-radius: 999px;
          border: 1.5px solid rgba(44, 62, 80, 0.15);
          background: rgba(255, 255, 255, 0.74);
          font-family: var(--font-pixel);
          font-size: 0.92rem;
          box-shadow: 0 10px 22px rgba(44, 62, 80, 0.08);
        }

        .workflow-panel {
          margin-top: 1.4rem;
          border-top: 1px solid rgba(44, 62, 80, 0.12);
          padding-top: 1.4rem;
          display: grid;
          grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
          gap: 1.25rem;
        }

        .workflow-copy h3 {
          margin: 0;
        }

        .workflow-steps {
          display: grid;
          gap: 0.8rem;
        }

        .workflow-step {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 0.85rem;
          align-items: start;
          border-radius: 14px;
          padding: 0.85rem 0.95rem;
          background: rgba(255, 255, 255, 0.7);
          border: 1px solid rgba(44, 62, 80, 0.1);
        }

        .workflow-index {
          color: var(--color-text-muted);
          font-size: 0.82rem;
          margin-top: 0.15rem;
        }

        .cta-panel {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1.5rem;
          background:
            radial-gradient(circle at top right, rgba(255, 170, 165, 0.22), transparent 34%),
            radial-gradient(circle at bottom left, rgba(160, 196, 255, 0.2), transparent 34%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.82), rgba(255, 255, 255, 0.72));
        }

        .cta-copy p {
          margin: 0;
          max-width: 60ch;
        }

        @media (max-width: 1040px) {
          .about-hero,
          .capability-grid,
          .workflow-panel {
            grid-template-columns: 1fr;
          }

          .proof-strip {
            grid-template-columns: 1fr;
          }

          .cta-panel {
            flex-direction: column;
            align-items: flex-start;
          }
        }

        @media (max-width: 720px) {
          .about-page {
            padding: 2rem 4% 4rem;
          }

          .about-copy h1,
          .section-heading h2,
          .cta-copy h2 {
            max-width: none;
          }
        }
      `}</style>
    </div>
  );
}
