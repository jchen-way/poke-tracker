export type EbaySearchCard = {
  name: string;
  setName?: string | null;
  localId?: string | null;
};

export function buildEbaySearchQuery(card: EbaySearchCard) {
  return [
    card.name ? `"${card.name}"` : null,
    card.setName ? `"${card.setName}"` : null,
    card.localId ? `"${card.localId}"` : null,
    'pokemon card',
  ]
    .filter(Boolean)
    .join(' ');
}

export function buildEbaySearchUrl(card: EbaySearchCard) {
  const query = buildEbaySearchQuery(card);
  const url = new URL('https://www.ebay.com/sch/i.html');
  url.searchParams.set('_nkw', query);
  url.searchParams.set('LH_BIN', '1');
  return url.toString();
}
