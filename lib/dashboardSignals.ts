import { buildEbaySearchUrl } from './ebaySearch';
import { buildTcgplayerSearchUrl } from './tcgplayerSearch';
import { getDisplayPrice } from './dataIngestion';

export type DashboardSnapshot = {
  id: string;
  trackedItemId: string;
  date: Date;
  fairValue: number | null;
  tcgplayerPrice: number | null;
  ebayPrice: number | null;
  ebayLowPrice: number | null;
  ebaySampleSize?: number | null;
  ebayLowListingUrl?: string | null;
  isSynthetic: boolean;
  item: {
    name: string;
    setName: string;
    number?: string | null;
    cardId?: string | null;
  };
};

export type Signal = {
  id: string;
  label: 'BUY SIGNAL' | 'ARBITRAGE';
  tone: 'buy' | 'arbitrage';
  title: string;
  reason: string;
  value: string;
  cardId: string | null;
  ebayUrl: string;
  tcgplayerUrl: string;
};

export const TREND_MIN_POINTS = 3;
export const TREND_MIN_CARDS = 5;
const TREND_MIN_PRICE = 5;
const TREND_MAX_CARDS = 60;

export function buildMetricSummary(snapshots: DashboardSnapshot[]) {
  const latestByCard = getLatestSnapshotsByCard(snapshots);
  const discrepancies = latestByCard.filter(hasHighPriorityDiscrepancy).length;
  const opportunities = latestByCard.filter(hasBuyOpportunity).length;
  const trendCandidates = getTrendCandidates(snapshots);
  const delta = trendCandidates.length >= TREND_MIN_CARDS ? median(trendCandidates) : 0;

  return {
    delta,
    opportunities,
    discrepancies,
    opportunityCoverage: latestByCard.filter(hasTrustedBuyInputs).length,
    discrepancyCoverage: latestByCard.filter(hasTrustedDiscrepancyInputs).length,
    hasTrend: trendCandidates.length >= TREND_MIN_CARDS,
    trendLabel: delta >= 3 ? 'Bullish' : delta <= -3 ? 'Cooling' : 'Flat',
  };
}

export function buildSignals(snapshots: DashboardSnapshot[], limit = 5): Signal[] {
  const signals = getLatestSnapshotsByCard(snapshots)
    .flatMap((snapshot) => {
      const title = `${snapshot.item.name} (${snapshot.item.setName})`;
      const signals: Signal[] = [];
      const ebayUrl =
        snapshot.ebayLowListingUrl ??
        buildEbaySearchUrl({
          name: snapshot.item.name,
          setName: snapshot.item.setName,
          localId: snapshot.item.number ?? null,
        });
      const tcgplayerUrl = buildTcgplayerSearchUrl({
        name: snapshot.item.name,
        setName: snapshot.item.setName,
        localId: snapshot.item.number ?? null,
      });

      if (hasBuyOpportunity(snapshot)) {
        const fairValue = snapshot.fairValue ?? 0;
        const ebayLow = snapshot.ebayLowPrice ?? 0;
        signals.push({
          id: `${snapshot.id}-buy`,
          label: 'BUY SIGNAL',
          tone: 'buy',
          title,
          reason: `Consensus ${formatMoney(fairValue)} vs matched eBay listing ${formatMoney(ebayLow)}.`,
          value: formatMoney(fairValue - ebayLow),
          cardId: snapshot.item.cardId ?? null,
          ebayUrl,
          tcgplayerUrl,
        });
      }

      if (hasArbitrageSpread(snapshot)) {
        const tcgPrice = snapshot.tcgplayerPrice ?? 0;
        const ebayLow = snapshot.ebayLowPrice ?? 0;
        const delta = ((tcgPrice - ebayLow) / Math.max(tcgPrice, ebayLow)) * 100;
        signals.push({
          id: `${snapshot.id}-arb`,
          label: 'ARBITRAGE',
          tone: 'arbitrage',
          title,
          reason: `TCGplayer ${formatMoney(tcgPrice)} vs matched eBay listing ${formatMoney(ebayLow)}.`,
          value: formatPercent(delta),
          cardId: snapshot.item.cardId ?? null,
          ebayUrl,
          tcgplayerUrl,
        });
      }

      return signals;
    })
    .sort((left, right) => parseSignalValue(right.value) - parseSignalValue(left.value));

  return limit > 0 ? signals.slice(0, limit) : signals;
}

export function getLatestSnapshotsByCard(snapshots: DashboardSnapshot[]) {
  const latestByCard = new Map<string, DashboardSnapshot>();

  for (const snapshot of snapshots) {
    if (!latestByCard.has(snapshot.trackedItemId)) {
      latestByCard.set(snapshot.trackedItemId, snapshot);
    }
  }

  return Array.from(latestByCard.values());
}

export function hasBuyOpportunity(snapshot: DashboardSnapshot) {
  if (!hasTrustedBuyInputs(snapshot)) {
    return false;
  }

  const fairValue = snapshot.fairValue!;
  const ebayLow = snapshot.ebayLowPrice!;
  const ebayMedian = snapshot.ebayPrice!;

  const spread = fairValue - ebayLow;
  return spread >= 3 && fairValue > ebayLow * 1.15 && fairValue > ebayMedian * 1.05;
}

export function hasArbitrageSpread(snapshot: DashboardSnapshot) {
  const tcgPrice = snapshot.tcgplayerPrice;
  const ebayLow = snapshot.ebayLowPrice;
  const absoluteSpread =
    tcgPrice != null && ebayLow != null ? Math.abs(tcgPrice - ebayLow) : 0;

  return (
    hasTrustedDiscrepancyInputs(snapshot) &&
    absoluteSpread >= 3 &&
    Math.abs(tcgPrice! - ebayLow!) / Math.max(tcgPrice!, ebayLow!) >= 0.18
  );
}

export function hasHighPriorityDiscrepancy(snapshot: DashboardSnapshot) {
  const tcgPrice = snapshot.tcgplayerPrice;
  const ebayLow = snapshot.ebayLowPrice;
  const absoluteSpread =
    tcgPrice != null && ebayLow != null ? Math.abs(tcgPrice - ebayLow) : 0;

  return (
    hasTrustedDiscrepancyInputs(snapshot) &&
    absoluteSpread >= 5 &&
    Math.abs(tcgPrice! - ebayLow!) / Math.max(tcgPrice!, ebayLow!) >= 0.25
  );
}

export function filterRealSnapshots(snapshots: DashboardSnapshot[]) {
  return snapshots.filter((snapshot) => !snapshot.isSynthetic);
}

function hasTrustedBuyInputs(snapshot: DashboardSnapshot) {
  return (
    snapshot.fairValue != null &&
    snapshot.ebayLowPrice != null &&
    snapshot.ebayPrice != null &&
    (snapshot.ebaySampleSize ?? 0) >= 3 &&
    hasTrustedEbayFloor(snapshot)
  );
}

function hasTrustedDiscrepancyInputs(snapshot: DashboardSnapshot) {
  return (
    snapshot.tcgplayerPrice != null &&
    snapshot.ebayLowPrice != null &&
    snapshot.ebayPrice != null &&
    snapshot.tcgplayerPrice >= 5 &&
    snapshot.ebayLowPrice >= 5 &&
    (snapshot.ebaySampleSize ?? 0) >= 3 &&
    hasTrustedEbayFloor(snapshot)
  );
}

function hasTrustedEbayFloor(snapshot: DashboardSnapshot) {
  const ebayLow = snapshot.ebayLowPrice;
  const ebayMedian = snapshot.ebayPrice;

  if (ebayLow == null || ebayMedian == null || ebayMedian <= 0) {
    return false;
  }

  return ebayLow <= ebayMedian && ebayLow >= ebayMedian * 0.9;
}

function getTrendCandidates(snapshots: DashboardSnapshot[]) {
  const grouped = new Map<string, DashboardSnapshot[]>();
  const latestByCard = getLatestSnapshotsByCard(snapshots);
  const eligibleCardIds = new Set(
    latestByCard
      .filter((snapshot) => {
        const currentPrice = getSnapshotPrice(snapshot);
        return currentPrice != null && currentPrice >= TREND_MIN_PRICE;
      })
      .sort((left, right) => (getSnapshotPrice(right) ?? 0) - (getSnapshotPrice(left) ?? 0))
      .slice(0, TREND_MAX_CARDS)
      .map((snapshot) => snapshot.trackedItemId),
  );

  for (const snapshot of snapshots) {
    if (!eligibleCardIds.has(snapshot.trackedItemId)) {
      continue;
    }

    const group = grouped.get(snapshot.trackedItemId) ?? [];
    group.push(snapshot);
    grouped.set(snapshot.trackedItemId, group);
  }

  const moves: number[] = [];

  for (const cardSnapshots of grouped.values()) {
    const ordered = [...cardSnapshots].sort((left, right) => left.date.getTime() - right.date.getTime());
    if (ordered.length < TREND_MIN_POINTS) {
      continue;
    }

    const firstPrice = getSnapshotPrice(ordered[0]);
    const lastPrice = getSnapshotPrice(ordered[ordered.length - 1]);
    if (firstPrice == null || lastPrice == null || firstPrice === 0) {
      continue;
    }

    moves.push(((lastPrice - firstPrice) / firstPrice) * 100);
  }

  return moves;
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function getSnapshotPrice(snapshot: DashboardSnapshot) {
  return getDisplayPrice(snapshot);
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

export function formatPercent(value: number) {
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(1)}%`;
}

function parseSignalValue(value: string) {
  return Number.parseFloat(value.replace(/[^0-9.-]/g, '')) || 0;
}
