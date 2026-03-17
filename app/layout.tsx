import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';

const siteUrl = process.env.APP_BASE_URL?.trim() || 'https://poketracker.dev';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'PokeTracker | Pokemon TCG Market Tracker',
    template: '%s | PokeTracker',
  },
  description: 'Track Pokemon cards and ETBs with live pricing, watchlists, and cross-market comparison.',
  keywords: [
    'Pokemon TCG',
    'Pokemon card tracker',
    'Pokemon price tracker',
    'ETB tracker',
    'Pokemon market signals',
    'watchlist',
  ],
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'PokeTracker | Pokemon TCG Market Tracker',
    description: 'Track Pokemon cards and ETBs with live pricing, watchlists, and cross-market comparison.',
    url: siteUrl,
    siteName: 'PokeTracker',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PokeTracker | Pokemon TCG Market Tracker',
    description: 'Track Pokemon cards and ETBs with live pricing, watchlists, and cross-market comparison.',
  },
};

import Navbar from './components/Navbar';

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Navbar />
        <main className="content-area">
          {children}
        </main>
        <Analytics />
      </body>
    </html>
  );
}
