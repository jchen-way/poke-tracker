import type { MetadataRoute } from 'next';

const siteUrl = process.env.APP_BASE_URL?.trim() || 'https://poketracker.dev';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${siteUrl}/`,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${siteUrl}/about`,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
  ];
}
