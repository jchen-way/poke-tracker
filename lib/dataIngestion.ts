import prisma from './prisma';
import { normalizeCardImageUrl } from './cardImages';
import { ensureEtbDisplayName } from './etbTracking';
import { buildEbayEtbSearchQuery, buildEbaySearchQuery } from './ebaySearch';
import { deriveEtbCatalogCandidates } from './etbCatalog';

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
const EBAY_ENRICHMENT_LIMIT = parseNonNegativeInt(
  process.env.EBAY_ENRICHMENT_LIMIT,
  0,
);
const ETB_SYNC_LIMIT = parsePositiveInt(process.env.ETB_SYNC_LIMIT, 12);
const ETB_CATALOG_SYNC_LIMIT = parsePositiveInt(process.env.ETB_CATALOG_SYNC_LIMIT, 120);

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
  lowImageUrl: string | null;
  medianImageUrl: string | null;
};

type EbayCardSearchContext = {
  cardName: string;
  setName: string | null;
  localId: string | null;
};

type EbayEtbSearchContext = {
  name: string;
  setName: string | null;
};

type SyncOptions = {
  limit?: number;
  historyDays?: number;
  historyPoints?: number;
  discoverLimit?: number;
  etbLimit?: number;
};

/**
 * Sync tracked cards directly from the free TCGdex API.
 */
export async function syncPokemonMarketData(options: SyncOptions = {}) {
  console.log('[Ingestion Tracker] Starting TCGdex sync loop...');
  const limit = options.limit ?? CARD_SYNC_LIMIT;
  const etbLimit = options.etbLimit ?? ETB_SYNC_LIMIT;
  const historyDays = Math.max(options.historyDays ?? 0, 0);
  const historyPoints = Math.max(options.historyPoints ?? historyDays, 0);
  const discoverLimit = Math.max(options.discoverLimit ?? 0, 0);
  const trackedCount = await prisma.trackedItem.count({
    where: {
      type: 'CARD',
      cardId: {
        not: null,
      },
    },
  });

  if (trackedCount === 0 || discoverLimit > 0) {
    await discoverTrackedCards(discoverLimit || limit);
  }

  const refreshTargets = await fetchCardRefreshTargets(limit);
  const ebayEnrichmentLimit =
    EBAY_ENRICHMENT_LIMIT > 0 ? EBAY_ENRICHMENT_LIMIT : refreshTargets.length;

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
      hasEbayCredentials() && index < ebayEnrichmentLimit
        ? await fetchEbayMarketSnapshot({
            query: buildEbaySearchQuery({
              name: card.name,
              setName: card.set?.name ?? null,
              localId: card.localId ?? null,
            }),
            isRelevantMatch: (title) =>
              isRelevantEbayCardListing(title, {
                cardName: card.name,
                setName: card.set?.name ?? null,
                localId: card.localId ?? null,
              }),
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

  await syncEtbCatalog(ETB_CATALOG_SYNC_LIMIT);
  const etbResults = await syncTrackedEtbs(etbLimit);

  console.log('[Ingestion Tracker] TCGdex sync complete!');
  return [...results, ...etbResults];
}

export async function getPriceSeriesForCard(cardId: string) {
  const snapshots = await prisma.priceSnapshot.findMany({
    where: {
      item: {
        type: 'CARD',
        cardId,
      },
    },
    orderBy: {
      date: 'asc',
    },
  });

  return buildPriceSeries(snapshots);
}

export async function getPriceSeriesForTrackedItem(trackedItemId: string) {
  const snapshots = await prisma.priceSnapshot.findMany({
    where: {
      trackedItemId,
    },
    orderBy: {
      date: 'asc',
    },
  });

  return buildPriceSeries(snapshots);
}

function buildPriceSeries(
  snapshots: Array<{
    date: Date;
    fairValue: number | null;
    tcgplayerPrice: number | null;
    ebayPrice: number | null;
    ebayLowPrice: number | null;
    volume: number | null;
  }>,
) {
  if (!snapshots.length) return [];

  const closes = snapshots.map((snap) => chooseChartPrice(snap));

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

async function syncTrackedEtbs(limit: number) {
  if (limit <= 0) {
    return [];
  }

  const trackedEtbs = await prisma.trackedItem.findMany({
    where: {
      type: 'ETB',
    },
    orderBy: [
      { watchlistEntries: { _count: 'desc' } },
      { priorityScore: 'desc' },
      { lastPriceCheckAt: { sort: 'asc', nulls: 'first' } },
      { updatedAt: 'asc' },
    ],
    take: limit,
  });

  const results = [];

  for (const trackedEtb of trackedEtbs) {
    const refreshed = await refreshTrackedEtb(trackedEtb.id);
    if (refreshed) {
      results.push(refreshed);
    }
  }

  return results;
}

async function syncEtbCatalog(limit: number) {
  if (limit <= 0) {
    return;
  }

  const candidates = await deriveEtbCatalogCandidates();
  if (!candidates.length) {
    return;
  }

  const candidateTrackedIds = candidates.map((candidate) => candidate.trackedId);

  for (const candidate of candidates) {
    await prisma.etbCatalogEntry.upsert({
      where: { trackedId: candidate.trackedId },
      update: {
        sourceSetId: candidate.sourceSetId,
        name: candidate.name,
        setName: candidate.setName,
      },
      create: {
        trackedId: candidate.trackedId,
        sourceSetId: candidate.sourceSetId,
        name: candidate.name,
        setName: candidate.setName,
      },
    });
  }

  const targets = await prisma.etbCatalogEntry.findMany({
    where: {
      trackedId: { in: candidateTrackedIds },
    },
    orderBy: [
      { isValidated: 'asc' },
      { lastValidatedAt: { sort: 'asc', nulls: 'first' } },
      { updatedAt: 'asc' },
    ],
    take: limit,
  });

  for (const target of targets) {
    const preview = hasEbayCredentials()
      ? await fetchEbayMarketSnapshot({
          query: buildEbayEtbSearchQuery({
            name: target.name,
            setName: target.setName,
          }),
          isRelevantMatch: (title) =>
            isRelevantEbayEtbListing(title, {
              name: target.name,
              setName: target.setName,
            }),
        })
      : null;
    const trusted = hasTrustedEtbMarketPreview(preview);

    await prisma.etbCatalogEntry.update({
      where: { id: target.id },
      data: {
        imageUrl: trusted ? (preview?.medianImageUrl ?? preview?.lowImageUrl ?? null) : null,
        ebayMedianPrice: trusted ? preview?.medianPrice ?? null : null,
        ebayLowPrice: trusted ? preview?.lowPrice ?? null : null,
        ebaySampleSize: trusted ? preview?.sampleSize ?? null : null,
        ebayListingUrl: trusted ? preview?.lowListingUrl ?? null : null,
        isValidated: trusted,
        lastValidatedAt: new Date(),
      },
    });
  }

  await prisma.etbCatalogEntry.updateMany({
    where: {
      isValidated: true,
      trackedId: {
        notIn: candidateTrackedIds,
      },
    },
    data: {
      isValidated: false,
      imageUrl: null,
      ebayMedianPrice: null,
      ebayLowPrice: null,
      ebaySampleSize: null,
      ebayListingUrl: null,
      lastValidatedAt: new Date(),
    },
  });
}

export async function refreshTrackedEtb(trackedItemId: string) {
  const trackedEtb = await prisma.trackedItem.findUnique({
    where: { id: trackedItemId },
  });

  if (!trackedEtb || trackedEtb.type !== 'ETB') {
    return null;
  }

  const ebayMarket = hasEbayCredentials()
    ? await fetchEbayMarketSnapshot({
        query: buildEbayEtbSearchQuery({
          name: trackedEtb.name,
          setName: trackedEtb.setName,
        }),
        isRelevantMatch: (title) =>
          isRelevantEbayEtbListing(title, {
            name: trackedEtb.name,
            setName: trackedEtb.setName,
          }),
      })
    : null;

  const ebayPrice = ebayMarket?.medianPrice ?? null;
  const ebayLowPrice = ebayMarket?.lowPrice ?? null;
  const fairValue = calculateEtbFairValue({
    ebayMedianPrice: ebayPrice,
    ebayLowPrice,
  });

  if (fairValue == null && ebayPrice == null && ebayLowPrice == null) {
    await prisma.trackedItem.update({
      where: { id: trackedEtb.id },
      data: { lastPriceCheckAt: new Date() },
    });
    return null;
  }

  await prisma.trackedItem.update({
    where: { id: trackedEtb.id },
    data: {
      name: ensureEtbDisplayName(trackedEtb.name),
      setName: trackedEtb.setName,
      imageUrl: ebayMarket?.medianImageUrl ?? ebayMarket?.lowImageUrl ?? trackedEtb.imageUrl,
      lastPriceCheckAt: new Date(),
    },
  });

  const priceSnap = await createSnapshot({
    trackedItemId: trackedEtb.id,
    fairValue,
    tcgplayerPrice: null,
    ebayPrice,
    ebayLowPrice,
    ebaySampleSize: ebayMarket?.sampleSize ?? null,
    ebayLowListingUrl: ebayMarket?.lowListingUrl ?? null,
    isSynthetic: false,
    date: new Date(),
  });

  return {
    item: trackedEtb.name,
    cardId: trackedEtb.cardId,
    newPriceId: priceSnap.id,
    type: trackedEtb.type,
  };
}

function hasTrustedEtbMarketPreview(preview: EbayMarketSnapshot | null) {
  if (!preview) {
    return false;
  }

  return (
    preview.sampleSize >= 3 &&
    (preview.medianPrice ?? 0) >= 25 &&
    (preview.lowPrice ?? 0) >= 20 &&
    (preview.lowPrice ?? 0) >= (preview.medianPrice ?? 0) * 0.55
  );
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

function parseNonNegativeInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

async function fetchCardRefreshTargets(backgroundLimit: number) {
  const watchlistTargets = await prisma.trackedItem.findMany({
    where: {
      type: 'CARD',
      cardId: {
        not: null,
      },
      watchlistEntries: {
        some: {},
      },
    },
    orderBy: getCardRefreshOrder(),
  });

  const backgroundTargets = await prisma.trackedItem.findMany({
    where: {
      type: 'CARD',
      cardId: {
        not: null,
      },
      id: watchlistTargets.length
        ? {
            notIn: watchlistTargets.map((item) => item.id),
          }
        : undefined,
    },
    orderBy: getCardRefreshOrder(),
    take: backgroundLimit,
  });

  return [...watchlistTargets, ...backgroundTargets];
}

function getCardRefreshOrder() {
  return [
    { watchlistEntries: { _count: 'desc' as const } },
    { priorityScore: 'desc' as const },
    { lastPriceCheckAt: { sort: 'asc' as const, nulls: 'first' as const } },
    { updatedAt: 'asc' as const },
  ];
}

async function fetchEbayMarketSnapshot({
  query,
  isRelevantMatch,
}: {
  query: string;
  isRelevantMatch: (title: string) => boolean;
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
        image?: { imageUrl?: string };
        price?: { value?: string };
        shippingOptions?: Array<{ shippingCost?: { value?: string } }>;
      }>;
    } =
      await res.json();
    const items = (json.itemSummaries ?? []).filter((item) => isRelevantMatch(item.title ?? ''));
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
              imageUrl: item.image?.imageUrl ?? null,
            }
          : null;
      })
      .filter(
        (value): value is { total: number; itemWebUrl: string | null; imageUrl: string | null } =>
          Boolean(value),
      );

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
      lowImageUrl: sorted[0].imageUrl,
      medianImageUrl: sorted[middle]?.imageUrl ?? sorted[0].imageUrl,
    };
  } catch (err) {
    console.log('[eBay] fetch error', err);
    return null;
  }
}

function isRelevantEbayCardListing(title: string, context: EbayCardSearchContext) {
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

function isRelevantEbayEtbListing(title: string, context: EbayEtbSearchContext) {
  const normalizedTitle = normalizeSearchText(title);
  if (!normalizedTitle) {
    return false;
  }

  const excludedTerms = [
    'booster',
    'bundle',
    'pack',
    'packs',
    'code',
    'code card',
    'digital',
    'online',
    'tcg live',
    'ptcgl',
    'ptcgo',
    'player s guide',
    "player's guide",
    'guide',
    'booklet',
    'sleeves',
    'card sleeves',
    'sleeve pack',
    'dice',
    'damage counter',
    'damage counters',
    'divider',
    'dividers',
    'marker',
    'markers',
    'coin',
    'coins',
    'deck box',
    'accessories',
    'accessory',
    'contents',
    'empty etb',
    'box only',
    'no packs',
    'without packs',
    'wrapper',
    'sealed case',
    'lot',
    'case',
    'display',
    'empty',
    'opened',
    'open box',
    'damaged',
    'binder',
    'tin',
    'blister',
    'poster',
    'trainer toolkit',
    'collection box',
    'pokemon center',
    'pc exclusive',
    'psa',
    'bgs',
    'cgc',
    'graded',
    'slab',
  ];

  if (excludedTerms.some((term) => normalizedTitle.includes(term))) {
    return false;
  }

  if (!normalizedTitle.includes('elite trainer box')) {
    return false;
  }

  if (!normalizedTitle.includes('pokemon')) {
    return false;
  }

  const positiveSignals = [
    'factory sealed',
    'brand new',
    'new sealed',
    'sealed box',
    'sealed',
  ];

  const hasPositiveSignal = positiveSignals.some((term) => normalizedTitle.includes(term));

  if (!hasPositiveSignal) {
    return false;
  }

  const normalizedName = normalizeSearchText(
    ensureEtbDisplayName(context.name).replace(/\s*elite trainer box$/i, ''),
  );
  const setTokens = tokenizeSearchText(context.setName ?? normalizedName)
    .filter((token) => token.length > 2)
    .filter((token) => !['trainer', 'elite', 'box', 'pokemon', 'tcg'].includes(token));

  if (!setTokens.length) {
    return true;
  }

  const matchedTokenCount = setTokens.filter((token) => normalizedTitle.includes(token)).length;
  const requiredMatches = setTokens.length >= 2 ? 2 : 1;
  return matchedTokenCount >= requiredMatches;
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

function calculateEtbFairValue({
  ebayMedianPrice,
  ebayLowPrice,
}: {
  ebayMedianPrice: number | null;
  ebayLowPrice: number | null;
}) {
  return ebayMedianPrice ?? ebayLowPrice;
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
