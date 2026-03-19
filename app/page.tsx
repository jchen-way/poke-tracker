import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { Leaf, Droplets, Flame, ArrowRight, Zap } from 'lucide-react';
import CursorAura from './components/CursorAura';
import PointerTilt from './components/PointerTilt';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Pokemon TCG Market Tracker',
  description:
    'Track Pokemon card and ETB prices, follow watchlist signals, and review eBay-backed market opportunities in one dashboard.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'PokeTracker | Pokemon TCG Market Tracker',
    description:
      'Track Pokemon card and ETB prices, follow watchlist signals, and review eBay-backed market opportunities in one dashboard.',
    url: '/',
  },
};

export default function LandingPage() {
  return (
    <div className={`${styles.page} fade-in`}>
      <CursorAura variant="landing" />
      <section className={styles.heroSection}>
        <PointerTilt className={styles.heroContentShell} maxTilt={3} glow={false}>
          <div className={`${styles.heroContent} retro-panel`}>
            <h1 className="pixel-text">Catch Market Trends.</h1>
            <p className={`${styles.heroSubtitle} text-muted`}>A calming, real-time tracking dashboard for your collection. Never miss a price dip, never miss a spike. Find your peace in the market.</p>
            <div className={styles.heroActions}>
              <Link href="/register" className="btn-retro blue">
                Get Started <ArrowRight size={18}/>
              </Link>
              <Link href="/about" className="btn-retro clear pixel-text">
                Learn More
              </Link>
            </div>
          </div>
        </PointerTilt>
        <PointerTilt className={styles.heroImageShell} maxTilt={10}>
          <div className={styles.heroImagePlaceholder}>
            <div className={styles.heroIllustration}>
              <Image
                src="/psyduck-trend.png"
                alt="Psyduck riding an upward market arrow"
                width={554}
                height={457}
                priority
                className={styles.heroArtImage}
              />
            </div>
            <div className={`${styles.floatingElement} ${styles.pika}`}>
              <Zap size={32} color="#fbbf24" fill="#fbbf24" />
            </div>
            <div className={`${styles.floatingElement} ${styles.leaf}`}>
              <Leaf size={32} color="#a8e6cf" fill="#a8e6cf" />
            </div>
            <div className={`${styles.floatingElement} ${styles.water}`}>
              <Droplets size={32} color="#a0c4ff" fill="#a0c4ff" />
            </div>
            <div className={`${styles.floatingElement} ${styles.fire}`}>
              <Flame size={32} color="#ffaaa5" fill="#ffaaa5" />
            </div>
          </div>
        </PointerTilt>
      </section>

      <section className={styles.featuresSection}>
        <h2 className={`${styles.sectionTitle} text-center`}>Your Peaceful Trading Engine</h2>
        <div className={styles.featuresGrid}>
          <div className={`${styles.featureCard} retro-panel`}>
            <div className={`${styles.iconWrap} ${styles.blue}`}><Droplets size={28}/></div>
            <h3 className="pixel-text">Arbitrage Detection</h3>
            <p className="text-muted">Instantly find price gaps across TCGPlayer, eBay, and more. Flow seamlessly into profitable trades.</p>
          </div>
          
          <div className={`${styles.featureCard} retro-panel`}>
            <div className={`${styles.iconWrap} ${styles.green}`}><Leaf size={28}/></div>
            <h3 className="pixel-text">Technical Analysis</h3>
            <p className="text-muted">Track EMA8/20/50 trends on your monitored cards as price history builds over time.</p>
          </div>

          <div className={`${styles.featureCard} retro-panel`}>
            <div className={`${styles.iconWrap} ${styles.pink}`}><Flame size={28}/></div>
            <h3 className="pixel-text">Calm Alerts</h3>
            <p className="text-muted">Get email alerts when new watchlist signals show up and are worth a closer look.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
