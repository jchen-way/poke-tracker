import { ensureEtbDisplayName } from './etbTracking';

export type EbaySearchCard = {
  name: string;
  setName?: string | null;
  localId?: string | null;
};

export type EbaySearchEtb = {
  name: string;
  setName?: string | null;
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

export function buildEbayEtbSearchQuery(etb: EbaySearchEtb) {
  const etbName = ensureEtbDisplayName(etb.name).replace(/\s*elite trainer box$/i, '').trim();
  const setName = etb.setName?.trim() ?? '';
  return [
    'Pokemon TCG',
    setName && !etbName.toLowerCase().includes(setName.toLowerCase()) ? setName : null,
    etbName || null,
    'Elite Trainer Box',
    'ETB',
  ]
    .filter(Boolean)
    .join(' ');
}

export function buildEbayEtbSearchUrl(etb: EbaySearchEtb) {
  const query = buildEbayEtbSearchQuery(etb);
  const url = new URL('https://www.ebay.com/sch/i.html');
  url.searchParams.set('_nkw', query);
  url.searchParams.set('LH_BIN', '1');
  return url.toString();
}
