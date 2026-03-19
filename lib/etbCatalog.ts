import prisma from './prisma';
import { buildEtbTrackedId, ensureEtbDisplayName } from './etbTracking';

export type KnownEtb = {
  trackedId: string;
  sourceSetId: string | null;
  name: string;
  setName: string;
  imageUrl: string | null;
  ebayMedianPrice: number | null;
  ebayLowPrice: number | null;
  ebaySampleSize: number | null;
  ebayListingUrl: string | null;
};

type ApiSet = {
  id?: unknown;
  name?: unknown;
};

type DerivedEtbCandidate = {
  trackedId: string;
  sourceSetId: string | null;
  name: string;
  setName: string;
};

const TCGDEX_API_URL = process.env.TCGDEX_API_URL || 'https://api.tcgdex.net/v2/en/';
const ETB_EXCLUDED_TERMS = [
  'mcdonald',
  'promo',
  'black star',
  'trainer kit',
  'theme deck',
  'victory medal',
  'play!',
  'league',
  'world championship',
  'energies',
];

export async function fetchKnownEtbs(query = ''): Promise<KnownEtb[]> {
  const normalizedQuery = query.trim().toLowerCase();
  const entries = await prisma.etbCatalogEntry.findMany({
    where: {
      isValidated: true,
      OR: normalizedQuery
        ? [
            { name: { contains: normalizedQuery, mode: 'insensitive' } },
            { setName: { contains: normalizedQuery, mode: 'insensitive' } },
            { trackedId: { contains: normalizedQuery, mode: 'insensitive' } },
          ]
        : undefined,
    },
    orderBy: [{ setName: 'asc' }, { name: 'asc' }],
  });

  return entries.map((entry) => ({
    trackedId: entry.trackedId,
    sourceSetId: entry.sourceSetId,
    name: entry.name,
    setName: entry.setName,
    imageUrl: entry.imageUrl ?? null,
    ebayMedianPrice: entry.ebayMedianPrice ?? null,
    ebayLowPrice: entry.ebayLowPrice ?? null,
    ebaySampleSize: entry.ebaySampleSize ?? null,
    ebayListingUrl: entry.ebayListingUrl ?? null,
  }));
}

export async function findKnownEtbByTrackedId(trackedId: string) {
  const entry = await prisma.etbCatalogEntry.findUnique({
    where: { trackedId },
  });

  if (!entry || !entry.isValidated) {
    return null;
  }

  return {
    trackedId: entry.trackedId,
    sourceSetId: entry.sourceSetId,
    name: entry.name,
    setName: entry.setName,
    imageUrl: entry.imageUrl ?? null,
    ebayMedianPrice: entry.ebayMedianPrice ?? null,
    ebayLowPrice: entry.ebayLowPrice ?? null,
    ebaySampleSize: entry.ebaySampleSize ?? null,
    ebayListingUrl: entry.ebayListingUrl ?? null,
  };
}

export async function deriveEtbCatalogCandidates() {
  try {
    const url = new URL('sets', ensureTrailingSlash(TCGDEX_API_URL));
    const response = await fetch(url.toString(), {
      cache: 'no-store',
    });

    if (!response.ok) {
      return [] as DerivedEtbCandidate[];
    }

    const json = (await response.json()) as unknown;
    const sets = extractSetArray(json);
    const normalized = sets
      .map(normalizeEtbSet)
      .filter((item): item is DerivedEtbCandidate => Boolean(item));

    return dedupeByTrackedId(normalized).sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  } catch (error) {
    console.warn('[ETB Catalog] Failed to derive ETB candidates from TCGdex', error);
    return [];
  }
}

function ensureTrailingSlash(value: string) {
  return value.endsWith('/') ? value : `${value}/`;
}

function extractSetArray(json: unknown): ApiSet[] {
  if (Array.isArray(json)) {
    return json as ApiSet[];
  }

  if (json && typeof json === 'object') {
    const object = json as Record<string, unknown>;
    for (const key of ['items', 'results', 'data', 'sets']) {
      if (Array.isArray(object[key])) {
        return object[key] as ApiSet[];
      }
    }
  }

  return [];
}

function normalizeEtbSet(set: ApiSet): DerivedEtbCandidate | null {
  const setId = firstString(set.id);
  const setName = firstString(set.name);

  if (!setName || !isLikelyEtbSet({ setId, setName })) {
    return null;
  }

  const name = ensureEtbDisplayName(setName);

  return {
    trackedId: buildEtbTrackedId({ name, setName }),
    sourceSetId: setId || null,
    name,
    setName,
  };
}

function firstString(...values: Array<unknown>) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function isLikelyEtbSet({
  setId,
  setName,
}: {
  setId: string;
  setName: string;
}) {
  const normalizedSetName = normalizeText(setName);

  if (ETB_EXCLUDED_TERMS.some((term) => normalizedSetName.includes(term))) {
    return false;
  }

  return Boolean(setId.trim() && normalizedSetName.length >= 3);
}

function dedupeByTrackedId(items: DerivedEtbCandidate[]) {
  const seen = new Map<string, DerivedEtbCandidate>();
  for (const item of items) {
    if (!seen.has(item.trackedId)) {
      seen.set(item.trackedId, item);
    }
  }
  return [...seen.values()];
}
