import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';

const siteUrl = process.env.APP_BASE_URL?.trim() || 'https://poketracker.dev';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'PokeTracker | Real-time Market Analysis',
  description: 'Track Pokemon cards and ETBs with live pricing, watchlists, and cross-market comparison.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'PokeTracker | Real-time Market Analysis',
    description: 'Track Pokemon cards and ETBs with live pricing, watchlists, and cross-market comparison.',
    url: siteUrl,
    siteName: 'PokeTracker',
    type: 'website',
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
