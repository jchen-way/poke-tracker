export function normalizeCardImageUrl(imageUrl: string | null | undefined) {
  if (!imageUrl) return null;
  if (/\.(png|webp|jpg|jpeg)(?:$|\?)/i.test(imageUrl)) {
    return imageUrl;
  }

  try {
    const parsed = new URL(imageUrl);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();

    if (/\.(png|webp|jpg|jpeg)$/.test(pathname)) {
      return imageUrl;
    }

    if (hostname.includes('tcgdex')) {
      return `${imageUrl.replace(/\/+$/, '')}/low.webp`;
    }

    return imageUrl;
  } catch {
    return `${imageUrl.replace(/\/+$/, '')}/low.webp`;
  }
}
