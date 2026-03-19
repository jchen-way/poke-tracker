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
import styles from './page.module.css';

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
    <div className={`${styles.page} fade-in`}>
      <CursorAura variant="about" />
      <section className={styles.hero}>
        <div className={styles.copy}>
          <span className={`${styles.kicker} pixel-text`}>Learn More</span>
          <h1>Less digging. More signal.</h1>
          <p className={`${styles.lead} text-muted`}>
            PokéTracker turns scattered card searches into one calmer market workspace for cards, ETBs, watchlists,
            and signal review.
          </p>

          <div className={styles.actions}>
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

          <div className={styles.proofStrip}>
            {proofHighlights.map((item) => (
              <article key={item.title} className={styles.proofChip}>
                <span className={`${styles.proofTitle} pixel-text`}>{item.title}</span>
                <span className={styles.proofLabel}>{item.label}</span>
              </article>
            ))}
          </div>
        </div>

        <PointerTilt maxTilt={6}>
          <div className={`${styles.stage} retro-panel`}>
            <div className={styles.stageShell}>
              <div className={`${styles.stageCard} ${styles.stageCardPrimary}`}>
                <div className={styles.stageCardHeader}>
                  <span className="pixel-text">Signal Board</span>
                  <ChartCandlestick size={18} />
                </div>
                <div className={`${styles.stageSignal} ${styles.positive}`}>
                  <span className={`${styles.signalTag} pixel-text`}>Buy Signal</span>
                  <strong>eBay below consensus on a watched card</strong>
                  <span>Open listing, verify, decide.</span>
                </div>
                <div className={`${styles.stageSignal} ${styles.caution}`}>
                  <span className={`${styles.signalTag} pixel-text`}>Discrepancy</span>
                  <strong>Marketplace mismatch worth manual review</strong>
                  <span>Check the source before the spread closes.</span>
                </div>
              </div>

              <div className={`${styles.stageCard} ${styles.stageCardGlass}`}>
                <div className={styles.stageCardHeader}>
                  <span className="pixel-text">Priority Watchlist</span>
                  <Eye size={18} />
                </div>
                <div className={styles.watchRow}>
                  <span>High priority cards</span>
                  <strong>Refresh first</strong>
                </div>
                <div className={styles.watchRow}>
                  <span>Tracked ETBs</span>
                  <strong>Same dashboard</strong>
                </div>
              </div>

              <div className={`${styles.stageCard} ${styles.stageCardAlert}`}>
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

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <span className="pixel-text">What You Actually Get</span>
          <h2>Built to shorten the path from “interesting” to “worth acting on.”</h2>
        </div>

        <div className={styles.capabilityGrid}>
          {capabilities.map(({ title, copy, icon: Icon }) => (
            <article key={title} className={`${styles.capabilityCard} retro-panel`}>
              <div className={styles.capabilityIcon}>
                <Icon size={22} />
              </div>
              <h3 className="pixel-text">{title}</h3>
              <p className="text-muted">{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={`retro-panel ${styles.audiencePanel}`}>
          <div className={`${styles.sectionHeading} ${styles.compact}`}>
            <span className="pixel-text">Who It Fits</span>
            <h2>For people who watch the Pokemon market on purpose.</h2>
          </div>

          <div className={styles.audienceChips}>
            {audience.map((item) => (
              <span key={item} className={styles.audienceChip}>
                {item}
              </span>
            ))}
          </div>

          <div className={styles.workflowPanel}>
            <div className={styles.workflowCopy}>
              <span className="pixel-text">Simple Loop</span>
              <h3>Track. Review. Verify.</h3>
            </div>

            <div className={styles.workflowSteps}>
              {workflow.map((step, index) => (
                <div key={step} className={styles.workflowStep}>
                  <span className={`${styles.workflowIndex} pixel-text`}>0{index + 1}</span>
                  <span>{step}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={`${styles.ctaPanel} retro-panel`}>
          <div className={styles.ctaCopy}>
            <span className="pixel-text">Call To Action</span>
            <h2>Set up a watchlist and start checking higher-quality signals.</h2>
            <p className="text-muted">
              Create an account, add priority items, and use the dashboard as the place where pricing context,
              signals, and direct listing checks come together.
            </p>
          </div>

          <div className={styles.ctaActions}>
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
    </div>
  );
}
