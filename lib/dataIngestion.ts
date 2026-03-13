import prisma from './prisma';
import { normalizeCardImageUrl } from './cardImages';

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
const EBAY_OAUTH_TOKEN = process.env.EBAY_OAUTH_TOKEN;
const EBAY_ENRICHMENT_LIMIT = parsePositiveInt(
  process.env.EBAY_ENRICHMENT_LIMIT,
  0,
);

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
    const ebayPrice =
      EBAY_OAUTH_TOKEN && index < EBAY_ENRICHMENT_LIMIT
        ? await fetchEbayMarketPrice(buildEbaySearchQuery(card))
        : null;
    const fairValue = firstFiniteNumber([
      tcgplayerPrice,
      cardmarketPrice,
      ebayPrice,
    ]);

    if (fairValue == null && tcgplayerPrice == null && ebayPrice == null) {
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
        historyDays,
        historyPoints,
      });
    }

    const priceSnap = await createSnapshot({
      trackedItemId: trackedItem.id,
      fairValue,
      tcgplayerPrice,
      ebayPrice,
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

async function runTechnicalAnalysis(
  trackedItemId: string,
  newSnapshot: { fairValue: number | null },
) {
  await prisma.technicalAnalysis.create({
    data: {
      trackedItemId,
      ema8: (newSnapshot.fairValue || 0) * 0.98,
      ema20: (newSnapshot.fairValue || 0) * 0.95,
      ema50: (newSnapshot.fairValue || 0) * 0.9,
      trend: 'UPTREND',
      macd: 0.5,
      signalLine: 0.4,
    },
  });
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
    const base = snap.fairValue ?? snap.tcgplayerPrice ?? snap.ebayPrice ?? 0;
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
  date,
}: {
  trackedItemId: string;
  fairValue: number | null;
  tcgplayerPrice: number | null;
  ebayPrice: number | null;
  date: Date;
}) {
  const priceSnap = await prisma.priceSnapshot.create({
    data: {
      trackedItemId,
      fairValue,
      tcgplayerPrice,
      ebayPrice,
      volume: null,
      date,
    },
  });

  await runTechnicalAnalysis(trackedItemId, priceSnap);
  return priceSnap;
}

async function seedHistoricalSnapshots({
  trackedItemId,
  fairValue,
  tcgplayerPrice,
  ebayPrice,
  historyDays,
  historyPoints,
}: {
  trackedItemId: string;
  fairValue: number;
  tcgplayerPrice: number | null;
  ebayPrice: number | null;
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

  return firstFiniteNumber(
    entries.flatMap((entry) => [
      entry.marketPrice,
      entry.midPrice,
      entry.lowPrice,
    ]),
  );
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

function buildEbaySearchQuery(card: TcgdexCard): string {
  return [card.name, card.set?.name, card.localId, 'pokemon card']
    .filter(Boolean)
    .join(' ');
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

async function fetchEbayMarketPrice(query: string): Promise<number | null> {
  if (!EBAY_OAUTH_TOKEN) {
    console.log('[eBay] missing EBAY_OAUTH_TOKEN, skipping');
    return null;
  }

  try {
    const url = new URL('https://api.ebay.com/buy/browse/v1/item_summary/search');
    url.searchParams.set('q', query);
    url.searchParams.set('limit', '20');

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${EBAY_OAUTH_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      console.log('[eBay] HTTP error', res.status);
      return null;
    }

    const json: { itemSummaries?: Array<{ price?: { value?: string } }> } =
      await res.json();
    const items = json.itemSummaries ?? [];
    if (!items.length) return null;

    const prices = items
      .map((item) => Number(item.price?.value))
      .filter((value) => Number.isFinite(value));

    if (!prices.length) return null;
    return Math.min(...prices);
  } catch (err) {
    console.log('[eBay] fetch error', err);
    return null;
  }
}
