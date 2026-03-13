export function normalizeCardImageUrl(imageUrl: string | null | undefined) {
  if (!imageUrl) return null;
  if (/\.(png|webp|jpg|jpeg)$/i.test(imageUrl)) {
    return imageUrl;
  }

  return `${imageUrl}/low.webp`;
}
