type TrackedItemLinkInput = {
  id: string;
  type: string;
  cardId?: string | null;
};

export function buildTrackedItemChartHref(
  item: TrackedItemLinkInput,
  range = '1M',
) {
  if (item.type === 'ETB') {
    return `/dashboard?itemId=${encodeURIComponent(item.id)}&range=${encodeURIComponent(range)}`;
  }

  return `/dashboard?cardId=${encodeURIComponent(item.cardId ?? '')}&range=${encodeURIComponent(range)}`;
}
