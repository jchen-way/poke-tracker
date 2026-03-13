import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PokeTracker | Real-time Market Analysis',
  description: 'Track Pokemon cards and ETBs with real-time technical analysis and arbitrage detection.',
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
      </body>
    </html>
  );
}
