export type TcgplayerSearchCard = {
  name: string;
  setName?: string | null;
  localId?: string | null;
};

export function buildTcgplayerSearchQuery(card: TcgplayerSearchCard) {
  return [
    card.name ? `"${card.name}"` : null,
    card.setName ? `"${card.setName}"` : null,
    card.localId ? `"${card.localId}"` : null,
    'pokemon',
  ]
    .filter(Boolean)
    .join(' ');
}

export function buildTcgplayerSearchUrl(card: TcgplayerSearchCard) {
  const url = new URL('https://www.tcgplayer.com/search/all/product');
  url.searchParams.set('q', buildTcgplayerSearchQuery(card));
  url.searchParams.set('view', 'grid');
  return url.toString();
}
