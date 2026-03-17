import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { Leaf, Droplets, Flame, ArrowRight, Zap } from 'lucide-react';
import CursorAura from './components/CursorAura';
import PointerTilt from './components/PointerTilt';

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
    <div className="landing-container fade-in">
      <CursorAura variant="landing" />
      <section className="hero-section">
        <PointerTilt className="hero-content-shell" maxTilt={3} glow={false}>
          <div className="hero-content retro-panel">
            <h1 className="pixel-text">Catch Market Trends.</h1>
            <p className="hero-subtitle text-muted">A calming, real-time tracking dashboard for your collection. Never miss a price dip, never miss a spike. Find your peace in the market.</p>
            <div className="hero-actions">
              <Link href="/register" className="btn-retro blue">
                Get Started <ArrowRight size={18}/>
              </Link>
              <Link href="/about" className="btn-retro clear pixel-text">
                Learn More
              </Link>
            </div>
          </div>
        </PointerTilt>
        <PointerTilt className="hero-image-shell" maxTilt={10}>
          <div className="hero-image-placeholder">
            <div className="hero-illustration">
              <Image
                src="/psyduck-trend.png"
                alt="Psyduck riding an upward market arrow"
                width={554}
                height={457}
                priority
                className="hero-art-image"
              />
            </div>
            <div className="floating-element pika">
              <Zap size={32} color="#fbbf24" fill="#fbbf24" />
            </div>
            <div className="floating-element leaf">
              <Leaf size={32} color="#a8e6cf" fill="#a8e6cf" />
            </div>
            <div className="floating-element water">
              <Droplets size={32} color="#a0c4ff" fill="#a0c4ff" />
            </div>
            <div className="floating-element fire">
              <Flame size={32} color="#ffaaa5" fill="#ffaaa5" />
            </div>
          </div>
        </PointerTilt>
      </section>

      <section className="features-section">
        <h2 className="section-title text-center">Your Peaceful Trading Engine</h2>
        <div className="features-grid">
          <div className="feature-card retro-panel">
            <div className="icon-wrap blue"><Droplets size={28}/></div>
            <h3 className="pixel-text">Arbitrage Detection</h3>
            <p className="text-muted">Instantly find price gaps across TCGPlayer, eBay, and more. Flow seamlessly into profitable trades.</p>
          </div>
          
          <div className="feature-card retro-panel">
            <div className="icon-wrap green"><Leaf size={28}/></div>
            <h3 className="pixel-text">Technical Analysis</h3>
            <p className="text-muted">Track EMA8/20/50 trends on your monitored cards as price history builds over time.</p>
          </div>

          <div className="feature-card retro-panel">
            <div className="icon-wrap pink"><Flame size={28}/></div>
            <h3 className="pixel-text">Calm Alerts</h3>
            <p className="text-muted">Get email alerts when new watchlist signals show up and are worth a closer look.</p>
          </div>
        </div>
      </section>

      <style>{`
        .landing-container {
          padding: 2rem 5%;
          max-width: 1200px;
          margin: 0 auto;
        }

        .hero-section {
          min-height: 80vh;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 4rem;
        }

        .hero-content {
          flex: 1;
          padding: 3rem;
          max-width: 600px;
          position: relative;
          z-index: 1;
        }

        .hero-content-shell,
        .hero-image-shell {
          flex: 1;
        }

        .hero-subtitle {
          font-size: 1.25rem;
          margin-bottom: 2rem;
          line-height: 1.8;
          font-weight: 600;
        }

        .hero-actions {
          display: flex;
          gap: 1rem;
        }

        .hero-image-placeholder {
          position: relative;
          height: 400px;
          width: 100%;
          background:
            radial-gradient(circle at top right, rgba(160, 196, 255, 0.18), transparent 38%),
            radial-gradient(circle at bottom left, rgba(255, 170, 165, 0.16), transparent 34%),
            rgba(255, 255, 255, 0.62);
          border: 3px solid var(--color-border-dark);
          border-radius: 24px;
          box-shadow: var(--shadow-retro);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          isolation: isolate;
        }

        .hero-illustration {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
        }

        .hero-art-image {
          width: 100%;
          height: 100%;
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
          object-position: center 58%;
          transform: scale(1.08);
          filter: drop-shadow(0 16px 24px rgba(44, 62, 80, 0.2));
        }

        .floating-element {
          position: absolute;
          animation: float 6s ease-in-out infinite;
          background: white;
          border: 2px solid var(--color-border-dark);
          border-radius: 50%;
          padding: 1rem;
          box-shadow: var(--shadow-retro);
          z-index: 2;
        }

        .floating-element.pika { top: 10%; right: 10%; animation-delay: 0s; }
        .floating-element.leaf { bottom: 20%; left: -5%; animation-delay: 1.5s; }
        .floating-element.water { top: 30%; left: 5%; animation-delay: 3s; }
        .floating-element.fire { bottom: 10%; right: 15%; animation-delay: 4.5s; }

        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-20px); }
        }

        .features-section {
          padding: 6rem 0;
        }

        .section-title {
          text-align: center;
          margin-bottom: 3rem;
        }

        .features-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 2rem;
        }

        .feature-card {
          padding: 2.5rem;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 1rem;
        }

        .icon-wrap {
          width: 60px;
          height: 60px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid var(--color-border-dark);
          box-shadow: 2px 2px 0px var(--color-border-dark);
        }

        .icon-wrap.blue { background: var(--color-accent-blue); }
        .icon-wrap.green { background: var(--color-accent-primary); }
        .icon-wrap.pink { background: var(--color-accent-secondary); }

        @media (max-width: 900px) {
          .hero-section {
            flex-direction: column;
            text-align: center;
            padding-top: 4rem;
          }
          .hero-content {
            padding: 2rem;
          }
          .hero-actions {
            justify-content: center;
          }
          .hero-image-placeholder {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
