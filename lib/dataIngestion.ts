import prisma from './prisma';
import { normalizeCardImageUrl } from './cardImages';
import { buildEbaySearchQuery } from './ebaySearch';

const TCGDEX_LANGUAGE = process.env.TCGDEX_LANGUAGE ?? 'en';
const TCGDEX_API_URL =
  process.env.TCGDEX_API_URL ?? `https://api.tcgdex.net/v2/${TCGDEX_LANGUAGE}/`;
const CARD_SYNC_LIMIT = parsePositiveInt(
  process.env.CARD_SYNC_LIMIT ?? process.env.POKEMON_SYNC_LIMIT,
  50,
);
const TCGDEX_PAGE_SIZE = Math.min(
  parsePositiveInt(process.env.TCGDEX_PAGE_SIZE, 50),
  100,
);
const TCGDEX_NAME_QUERY = process.env.TCGDEX_NAME_QUERY?.trim() ?? '';
const TCGDEX_DETAIL_BATCH_SIZE = Math.min(
  parsePositiveInt(process.env.TCGDEX_DETAIL_BATCH_SIZE, 10),
  25,
);
const EBAY_CLIENT_ID = process.env.EBAY_CLIENT_ID;
const EBAY_CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET;
const EBAY_ENV = process.env.EBAY_ENV ?? 'production';
const EBAY_MARKETPLACE_ID = process.env.EBAY_MARKETPLACE_ID ?? 'EBAY_US';
const EBAY_ENRICHMENT_LIMIT = parsePositiveInt(
  process.env.EBAY_ENRICHMENT_LIMIT,
  CARD_SYNC_LIMIT,
);

let ebayAppTokenCache:
  | {
      accessToken: string;
      expiresAt: number;
    }
  | null = null;

type MaybeNumber = number | null | undefined;

type TcgdexCardBrief = {
  id: string;
  localId?: string;
  name: string;
  image?: string;
};

type TcgdexCard = TcgdexCardBrief & {
  set?: {
    name?: string;
  };
  pricing?: {
    tcgplayer?: Record<string, unknown>;
    cardmarket?: Record<string, unknown>;
  };
};

type TcgdexTcgplayerVariant = {
  lowPrice?: number;
  midPrice?: number;
  highPrice?: number;
  marketPrice?: number;
  directLowPrice?: number;
};

type EbayMarketSnapshot = {
  lowPrice: number | null;
  medianPrice: number | null;
  sampleSize: number;
  lowListingUrl: string | null;
};

type EbaySearchContext = {
  cardName: string;
  setName: string | null;
  localId: string | null;
};

type SyncOptions = {
  limit?: number;
  historyDays?: number;
  historyPoints?: number;
  discoverLimit?: number;
};

/**
 * Sync tracked cards directly from the free TCGdex API.
 */
export async function syncPokemonMarketData(options: SyncOptions = {}) {
  console.log('[Ingestion Tracker] Starting TCGdex sync loop...');
  const limit = options.limit ?? CARD_SYNC_LIMIT;
  const historyDays = Math.max(options.historyDays ?? 0, 0);
  const historyPoints = Math.max(options.historyPoints ?? historyDays, 0);
  const discoverLimit = Math.max(options.discoverLimit ?? 0, 0);
  const trackedCount = await prisma.trackedItem.count({
    where: {
      cardId: {
        not: null,
      },
    },
  });

  if (trackedCount === 0 || discoverLimit > 0) {
    await discoverTrackedCards(discoverLimit || limit);
  }

  const refreshTargets = await prisma.trackedItem.findMany({
    where: {
      cardId: {
        not: null,
      },
    },
    orderBy: [
      { watchlistEntries: { _count: 'desc' } },
      { priorityScore: 'desc' },
      { lastPriceCheckAt: { sort: 'asc', nulls: 'first' } },
      { updatedAt: 'asc' },
    ],
    take: limit,
  });

  const cards = await fetchTcgdexCardsByIds(
    refreshTargets
      .map((item) => item.cardId)
      .filter((cardId): cardId is string => Boolean(cardId)),
  );
  const results = [];

  for (const [index, card] of cards.entries()) {
    const trackedItem = await prisma.trackedItem.upsert({
      where: { cardId: card.id },
      update: {
        name: card.name,
        setName: card.set?.name ?? 'Unknown Set',
        number: card.localId,
        imageUrl: normalizeCardImageUrl(card.image) ?? '',
        lastPriceCheckAt: new Date(),
      },
      create: {
        cardId: card.id,
        name: card.name,
        setName: card.set?.name ?? 'Unknown Set',
        number: card.localId,
        type: 'CARD',
        imageUrl: normalizeCardImageUrl(card.image) ?? '',
        lastPriceCheckAt: new Date(),
      },
    });

    const tcgplayerPrice = extractTcgplayerPrice(card);
    const cardmarketPrice = extractCardmarketPrice(card);
    const ebayMarket =
      hasEbayCredentials() && index < EBAY_ENRICHMENT_LIMIT
        ? await fetchEbayMarketSnapshot({
            query: buildEbaySearchQuery({
              name: card.name,
              setName: card.set?.name ?? null,
              localId: card.localId ?? null,
            }),
            context: {
              cardName: card.name,
              setName: card.set?.name ?? null,
              localId: card.localId ?? null,
            },
          })
        : null;
    const ebayPrice = ebayMarket?.medianPrice ?? null;
    const ebayLowPrice = ebayMarket?.lowPrice ?? null;
    const ebayLowListingUrl = ebayMarket?.lowListingUrl ?? null;
    const fairValue = calculateFairValue({
      tcgplayerPrice,
      cardmarketPrice,
      ebayMedianPrice: ebayPrice,
    });

    if (fairValue == null && tcgplayerPrice == null && ebayPrice == null && ebayLowPrice == null) {
      continue;
    }

    const snapshotCount = await prisma.priceSnapshot.count({
      where: {
        trackedItemId: trackedItem.id,
      },
    });

    if (snapshotCount === 0 && historyPoints > 1 && fairValue != null) {
      await seedHistoricalSnapshots({
        trackedItemId: trackedItem.id,
        fairValue,
        tcgplayerPrice,
        ebayPrice,
        ebayLowPrice,
        ebaySampleSize: ebayMarket?.sampleSize ?? null,
        historyDays,
        historyPoints,
      });
    }

    const priceSnap = await createSnapshot({
      trackedItemId: trackedItem.id,
      fairValue,
      tcgplayerPrice,
      ebayPrice,
      ebayLowPrice,
      ebaySampleSize: ebayMarket?.sampleSize ?? null,
      ebayLowListingUrl,
      isSynthetic: false,
      date: new Date(),
    });

    results.push({
      item: trackedItem.name,
      cardId: trackedItem.cardId,
      newPriceId: priceSnap.id,
    });
  }

  console.log('[Ingestion Tracker] TCGdex sync complete!');
  return results;
}

export async function getPriceSeriesForCard(cardId: string) {
  const snapshots = await prisma.priceSnapshot.findMany({
    where: {
      item: {
        cardId,
      },
    },
    orderBy: {
      date: 'asc',
    },
  });

  if (!snapshots.length) return [];

  const closes = snapshots.map((snap) => {
    const base = chooseChartPrice(snap);
    return base;
  });

  const ema = (period: number) => {
    const k = 2 / (period + 1);
    let prev = closes[0];
    const result: number[] = [prev];
    for (let i = 1; i < closes.length; i++) {
      const next = closes[i] * k + prev * (1 - k);
      result.push(next);
      prev = next;
    }
    return result;
  };

  const ema8 = ema(8);
  const ema20 = ema(20);
  const ema50 = ema(50);

  return snapshots.map((snap, idx) => ({
    date: snap.date.toISOString(),
    price: closes[idx],
    ema8: ema8[idx],
    ema20: ema20[idx],
    ema50: ema50[idx],
    volume: snap.volume ?? undefined,
  }));
}

async function createSnapshot({
  trackedItemId,
  fairValue,
  tcgplayerPrice,
  ebayPrice,
  ebayLowPrice,
  ebaySampleSize,
  ebayLowListingUrl,
  isSynthetic,
  date,
}: {
  trackedItemId: string;
  fairValue: number | null;
  tcgplayerPrice: number | null;
  ebayPrice: number | null;
  ebayLowPrice: number | null;
  ebaySampleSize: number | null;
  ebayLowListingUrl: string | null;
  isSynthetic: boolean;
  date: Date;
}) {
  const priceSnap = await prisma.priceSnapshot.create({
    data: {
      trackedItemId,
      fairValue,
      tcgplayerPrice,
      ebayPrice,
      ebayLowPrice,
      ebaySampleSize,
      ebayLowListingUrl,
      isSynthetic,
      volume: null,
      date,
    },
  });
  return priceSnap;
}

async function seedHistoricalSnapshots({
  trackedItemId,
  fairValue,
  tcgplayerPrice,
  ebayPrice,
  ebayLowPrice,
  ebaySampleSize,
  historyDays,
  historyPoints,
}: {
  trackedItemId: string;
  fairValue: number;
  tcgplayerPrice: number | null;
  ebayPrice: number | null;
  ebayLowPrice: number | null;
  ebaySampleSize: number | null;
  historyDays: number;
  historyPoints: number;
}) {
  const points = Math.max(historyPoints - 1, 1);

  for (let index = points; index >= 1; index -= 1) {
    const progress = index / points;
    const syntheticFairValue = applySyntheticDrift(fairValue, progress);
    const syntheticDate = new Date();
    syntheticDate.setUTCDate(syntheticDate.getUTCDate() - Math.max(historyDays, points) + index - 1);
    syntheticDate.setUTCHours(12, 0, 0, 0);

    await createSnapshot({
      trackedItemId,
      fairValue: syntheticFairValue,
      tcgplayerPrice:
        tcgplayerPrice != null ? applySyntheticDrift(tcgplayerPrice, progress) : null,
      ebayPrice: ebayPrice != null ? applySyntheticDrift(ebayPrice, progress * 0.85) : null,
      ebayLowPrice:
        ebayLowPrice != null ? applySyntheticDrift(ebayLowPrice, progress * 0.8) : null,
      ebaySampleSize,
      ebayLowListingUrl: null,
      isSynthetic: true,
      date: syntheticDate,
    });
  }
}

function applySyntheticDrift(baseValue: number, progress: number) {
  const wave = Math.sin(progress * Math.PI * 1.7) * 0.06;
  const trend = (0.5 - progress) * 0.08;
  const adjusted = baseValue * (1 + wave + trend);
  return Number(adjusted.toFixed(2));
}

async function fetchTcgdexCards(limit: number): Promise<TcgdexCard[]> {
  const briefs: TcgdexCardBrief[] = [];
  let page = 1;

  while (briefs.length < limit) {
    const pageSize = Math.min(TCGDEX_PAGE_SIZE, limit - briefs.length);
    const url = createTcgdexUrl('cards');

    url.searchParams.set('pagination:page', String(page));
    url.searchParams.set('pagination:itemsPerPage', String(pageSize));

    if (TCGDEX_NAME_QUERY) {
      url.searchParams.set('name', TCGDEX_NAME_QUERY);
    }

    const response = await fetch(url.toString(), { cache: 'no-store' });

    if (!response.ok) {
      throw new Error(
        `TCGdex list request failed with ${response.status} ${response.statusText}`,
      );
    }

    const payload = (await response.json()) as TcgdexCardBrief[];
    if (!payload.length) {
      break;
    }

    briefs.push(...payload);

    if (payload.length < pageSize) {
      break;
    }

    page += 1;
  }

  const selected = briefs.slice(0, limit);
  const cards: TcgdexCard[] = [];

  for (let i = 0; i < selected.length; i += TCGDEX_DETAIL_BATCH_SIZE) {
    const batch = selected.slice(i, i + TCGDEX_DETAIL_BATCH_SIZE);
    const detailedBatch = await Promise.all(
      batch.map((card) => fetchTcgdexCard(card.id)),
    );
    cards.push(...detailedBatch);
  }

  return cards;
}

async function fetchTcgdexCardsByIds(cardIds: string[]): Promise<TcgdexCard[]> {
  const cards: TcgdexCard[] = [];

  for (let index = 0; index < cardIds.length; index += TCGDEX_DETAIL_BATCH_SIZE) {
    const batch = cardIds.slice(index, index + TCGDEX_DETAIL_BATCH_SIZE);
    const detailedBatch = await Promise.all(batch.map((cardId) => fetchTcgdexCard(cardId)));
    cards.push(...detailedBatch);
  }

  return cards;
}

async function discoverTrackedCards(limit: number) {
  const cards = await fetchTcgdexCards(limit);

  for (const card of cards) {
    await prisma.trackedItem.upsert({
      where: { cardId: card.id },
      update: {
        name: card.name,
        setName: card.set?.name ?? 'Unknown Set',
        number: card.localId,
        imageUrl: normalizeCardImageUrl(card.image) ?? '',
      },
      create: {
        cardId: card.id,
        name: card.name,
        setName: card.set?.name ?? 'Unknown Set',
        number: card.localId,
        type: 'CARD',
        imageUrl: normalizeCardImageUrl(card.image) ?? '',
      },
    });
  }
}

async function fetchTcgdexCard(cardId: string): Promise<TcgdexCard> {
  const response = await fetch(createTcgdexUrl(['cards', cardId]), {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(
      `TCGdex card request failed for ${cardId} with ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as TcgdexCard;
}

function extractTcgplayerPrice(card: TcgdexCard): number | null {
  const entries = Object.values(card.pricing?.tcgplayer ?? {}).filter(
    isTcgplayerVariant,
  );

  const variantAnchors = entries
    .map((entry) =>
      firstFiniteNumber([
        entry.lowPrice,
        entry.directLowPrice,
        entry.marketPrice,
        entry.midPrice,
      ]),
    )
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    .sort((left, right) => left - right);

  if (!variantAnchors.length) {
    return null;
  }

  const middle = Math.floor(variantAnchors.length / 2);
  const median =
    variantAnchors.length % 2 === 0
      ? (variantAnchors[middle - 1] + variantAnchors[middle]) / 2
      : variantAnchors[middle];

  return Number(median.toFixed(2));
}

function extractCardmarketPrice(card: TcgdexCard): number | null {
  const prices = card.pricing?.cardmarket;
  if (!prices) return null;

  return firstFiniteNumber([
    asNumber(prices.trend),
    asNumber(prices.avg),
    asNumber(prices.avg7),
    asNumber(prices.avg30),
    asNumber(prices['trend-holo']),
    asNumber(prices['avg-holo']),
    asNumber(prices['avg30-holo']),
    asNumber(prices.low),
    asNumber(prices['low-holo']),
  ]);
}

function isTcgplayerVariant(value: unknown): value is TcgdexTcgplayerVariant {
  return Boolean(
    value &&
      typeof value === 'object' &&
      ('marketPrice' in value || 'midPrice' in value || 'lowPrice' in value),
  );
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function createTcgdexUrl(resourceParts: string[]): URL;
function createTcgdexUrl(resource: string): URL;
function createTcgdexUrl(resource: string | string[]): URL {
  const baseUrl = TCGDEX_API_URL.endsWith('/') ? TCGDEX_API_URL : `${TCGDEX_API_URL}/`;
  if (Array.isArray(resource)) {
    const normalizedPath = resource
      .map((part) => part.replace(/^\/+|\/+$/g, ''))
      .map((part) => encodeURIComponent(part))
      .join('/');
    return new URL(normalizedPath, baseUrl);
  }

  return new URL(resource.replace(/^\//, ''), baseUrl);
}

function firstFiniteNumber(values: MaybeNumber[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

async function fetchEbayMarketSnapshot({
  query,
  context,
}: {
  query: string;
  context: EbaySearchContext;
}): Promise<EbayMarketSnapshot | null> {
  if (!hasEbayCredentials()) {
    console.log('[eBay] missing EBAY_CLIENT_ID/EBAY_CLIENT_SECRET, skipping');
    return null;
  }

  try {
    const accessToken = await getEbayApplicationToken();
    if (!accessToken) {
      return null;
    }

    const url = new URL(`${getEbayApiBaseUrl()}/buy/browse/v1/item_summary/search`);
    url.searchParams.set('q', query);
    url.searchParams.set('limit', '20');
    url.searchParams.set('sort', 'price');
    url.searchParams.set('filter', 'buyingOptions:{FIXED_PRICE}');

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': EBAY_MARKETPLACE_ID,
      },
    });

    if (!res.ok) {
      console.log('[eBay] HTTP error', res.status);
      return null;
    }

    const json: {
      itemSummaries?: Array<{
        title?: string;
        itemWebUrl?: string;
        price?: { value?: string };
        shippingOptions?: Array<{ shippingCost?: { value?: string } }>;
      }>;
    } =
      await res.json();
    const items = (json.itemSummaries ?? []).filter((item) =>
      isRelevantEbayListing(item.title ?? '', context),
    );
    if (!items.length) return null;

    const pricedItems = items
      .map((item) => {
        const itemPrice = Number(item.price?.value);
        const shipping = Number(item.shippingOptions?.[0]?.shippingCost?.value ?? 0);
        const total = itemPrice + shipping;
        return Number.isFinite(total)
          ? {
              total: Number(total.toFixed(2)),
              itemWebUrl: item.itemWebUrl ?? null,
            }
          : null;
      })
      .filter((value): value is { total: number; itemWebUrl: string | null } => Boolean(value));

    if (!pricedItems.length) return null;

    const sorted = [...pricedItems].sort((left, right) => left.total - right.total);
    const middle = Math.floor(sorted.length / 2);
    const medianPrice =
      sorted.length % 2 === 0
        ? (sorted[middle - 1].total + sorted[middle].total) / 2
        : sorted[middle].total;

    return {
      lowPrice: Number(sorted[0].total.toFixed(2)),
      medianPrice: Number(medianPrice.toFixed(2)),
      sampleSize: sorted.length,
      lowListingUrl: sorted[0].itemWebUrl,
    };
  } catch (err) {
    console.log('[eBay] fetch error', err);
    return null;
  }
}

function isRelevantEbayListing(title: string, context: EbaySearchContext) {
  const normalizedTitle = normalizeSearchText(title);
  const normalizedCompactTitle = normalizeCompactText(title);
  if (!normalizedTitle) {
    return false;
  }

  const excludedTerms = [
    'booster',
    'box',
    'pack',
    'bundle',
    'binder',
    'lot',
    'proxy',
    'custom',
    'digital',
    'code card',
    'tin',
    'case',
    'empty',
    'damaged',
    'psa',
    'bgs',
    'cgc',
    'slab',
    'graded',
    'reprint',
    'celebrations',
    'world championship',
    'gold metal',
    'jumbo',
    'oversize',
  ];

  if (excludedTerms.some((term) => normalizedTitle.includes(term))) {
    return false;
  }

  const normalizedName = normalizeSearchText(context.cardName);
  const normalizedCompactName = normalizeCompactText(context.cardName);
  const nameTokens = tokenizeSearchText(context.cardName).filter((token) => token.length > 2);
  if (
    !(normalizedTitle.includes(normalizedName) || normalizedCompactTitle.includes(normalizedCompactName)) &&
    !nameTokens.every((token) => normalizedTitle.includes(token))
  ) {
    return false;
  }

  const setTokens = tokenizeSearchText(context.setName ?? '')
    .filter((token) => token.length > 2)
    .filter((token) => !['base', 'set'].includes(token));
  const hasSetMatch =
    !setTokens.length || setTokens.every((token) => normalizedTitle.includes(token));
  if (!hasSetMatch) {
    return false;
  }

  if (context.localId) {
    const localId = normalizeCardNumber(context.localId);
    if (localId && !hasCardNumberMatch(title, localId)) {
      return false;
    }
  }

  return normalizedTitle.includes('pokemon');
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeSearchText(value: string) {
  return normalizeSearchText(value).split(' ').filter(Boolean);
}

function normalizeCardNumber(value: string) {
  const normalized = normalizeCompactText(value);
  return normalized || null;
}

function hasCardNumberMatch(rawTitle: string, normalizedLocalId: string) {
  const lowerTitle = rawTitle.toLowerCase();
  const compactTitle = normalizeCompactText(rawTitle);

  if (normalizedLocalId.length <= 2 && /^\d+$/.test(normalizedLocalId)) {
    const numericId = Number.parseInt(normalizedLocalId, 10);
    const patterns = [
      new RegExp(`#\\s*0*${numericId}(?!\\d)`),
      new RegExp(`\\b0*${numericId}\\s*/`),
      new RegExp(`/\\s*0*${numericId}\\b`),
      new RegExp(`\\b0*${numericId}\\b`),
    ];
    return patterns.some((pattern) => pattern.test(lowerTitle));
  }

  return compactTitle.includes(normalizedLocalId);
}

function normalizeCompactText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function calculateFairValue({
  tcgplayerPrice,
  cardmarketPrice,
  ebayMedianPrice,
}: {
  tcgplayerPrice: number | null;
  cardmarketPrice: number | null;
  ebayMedianPrice: number | null;
}) {
  const weightedSources = [
    tcgplayerPrice != null ? { value: tcgplayerPrice, weight: 0.7 } : null,
    ebayMedianPrice != null ? { value: ebayMedianPrice * 0.9, weight: 0.05 } : null,
    cardmarketPrice != null ? { value: cardmarketPrice, weight: 0.25 } : null,
  ].filter(
    (source): source is { value: number; weight: number } =>
      Boolean(source && Number.isFinite(source.value)),
  );

  if (!weightedSources.length) {
    return null;
  }

  const weightedSum = weightedSources.reduce(
    (sum, source) => sum + source.value * source.weight,
    0,
  );
  const totalWeight = weightedSources.reduce((sum, source) => sum + source.weight, 0);
  const baseConsensus = weightedSum / totalWeight;
  const sortedValues = weightedSources
    .map((source) => source.value)
    .sort((left, right) => left - right);
  const medianValue = sortedValues[Math.floor(sortedValues.length / 2)];
  const dampedConsensus =
    sortedValues.length >= 2 ? (baseConsensus + medianValue) / 2 : baseConsensus;

  return Number(dampedConsensus.toFixed(2));
}

function chooseChartPrice(snapshot: {
  fairValue: number | null;
  tcgplayerPrice: number | null;
  ebayPrice: number | null;
  ebayLowPrice: number | null;
}) {
  return (
    snapshot.tcgplayerPrice ??
    snapshot.fairValue ??
    snapshot.ebayPrice ??
    snapshot.ebayLowPrice ??
    0
  );
}

export function getDisplayPrice(snapshot: {
  fairValue: number | null;
  tcgplayerPrice: number | null;
  ebayPrice: number | null;
  ebayLowPrice: number | null;
}) {
  return chooseChartPrice(snapshot);
}

function hasEbayCredentials() {
  return Boolean(EBAY_CLIENT_ID && EBAY_CLIENT_SECRET);
}

function getEbayIdentityBaseUrl() {
  return EBAY_ENV === 'sandbox' ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com';
}

function getEbayApiBaseUrl() {
  return EBAY_ENV === 'sandbox' ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com';
}

async function getEbayApplicationToken() {
  if (!hasEbayCredentials()) {
    return null;
  }

  if (ebayAppTokenCache && ebayAppTokenCache.expiresAt > Date.now() + 60_000) {
    return ebayAppTokenCache.accessToken;
  }

  const basicAuth = Buffer.from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: 'https://api.ebay.com/oauth/api_scope',
  });

  const response = await fetch(`${getEbayIdentityBaseUrl()}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    console.log('[eBay] token HTTP error', response.status);
    return null;
  }

  const payload = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };

  if (!payload.access_token || !payload.expires_in) {
    console.log('[eBay] token response missing access token');
    return null;
  }

  ebayAppTokenCache = {
    accessToken: payload.access_token,
    expiresAt: Date.now() + payload.expires_in * 1000,
  };

  return ebayAppTokenCache.accessToken;
}
