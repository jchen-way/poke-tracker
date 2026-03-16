import type { MetadataRoute } from 'next';

const siteUrl = process.env.APP_BASE_URL?.trim() || 'https://poketracker.dev';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/about', '/login', '/register'],
        disallow: ['/dashboard', '/collections', '/watchlist', '/settings', '/etbs', '/api/'],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
