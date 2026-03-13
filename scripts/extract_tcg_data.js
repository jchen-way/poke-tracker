#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');

function getArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return null;
  return process.argv[index + 1];
}

function csvEscape(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function createTcgdexUrl(resource, apiBaseUrl) {
  const normalizedBase = apiBaseUrl.endsWith('/') ? apiBaseUrl : `${apiBaseUrl}/`;
  return new URL(resource.replace(/^\//, ''), normalizedBase);
}

async function fetchTcgdexCard(apiBaseUrl, cardId) {
  const response = await fetch(createTcgdexUrl(`cards/${cardId}`, apiBaseUrl));
  if (!response.ok) {
    throw new Error(
      `TCGdex card request failed for ${cardId} with ${response.status} ${response.statusText}`,
    );
  }

  return await response.json();
}

async function fetchTcgdexCards({ apiBaseUrl, limit, nameQuery, detailBatchSize }) {
  const briefs = [];
  let page = 1;

  while (briefs.length < limit) {
    const pageSize = Math.min(100, limit - briefs.length);
    const url = createTcgdexUrl('cards', apiBaseUrl);

    url.searchParams.set('pagination:page', String(page));
    url.searchParams.set('pagination:itemsPerPage', String(pageSize));

    if (nameQuery) {
      url.searchParams.set('name', nameQuery);
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `TCGdex list request failed with ${response.status} ${response.statusText}`,
      );
    }

    const payload = await response.json();
    if (!Array.isArray(payload) || payload.length === 0) {
      break;
    }

    briefs.push(...payload);

    if (payload.length < pageSize) {
      break;
    }

    page += 1;
  }

  const selected = briefs.slice(0, limit);
  const cards = [];

  for (let i = 0; i < selected.length; i += detailBatchSize) {
    const batch = selected.slice(i, i + detailBatchSize);
    const detailedBatch = await Promise.all(
      batch.map((card) => fetchTcgdexCard(apiBaseUrl, card.id)),
    );
    cards.push(...detailedBatch);
  }

  return cards;
}

async function main() {
  const language = getArg('--language') || process.env.TCGDEX_LANGUAGE || 'en';
  const apiBaseUrl =
    getArg('--api-url') ||
    process.env.TCGDEX_API_URL ||
    `https://api.tcgdex.net/v2/${language}/`;
  const outPath = getArg('--out') || '/tmp/pokemon_tcg_cards.csv';
  const limit = parsePositiveInt(
    getArg('--limit') || process.env.CARD_SYNC_LIMIT || process.env.POKEMON_SYNC_LIMIT,
    100,
  );
  const nameQuery = getArg('--name') || process.env.TCGDEX_NAME_QUERY || '';
  const detailBatchSize = Math.min(
    parsePositiveInt(
      getArg('--detail-batch-size') || process.env.TCGDEX_DETAIL_BATCH_SIZE,
      10,
    ),
    25,
  );

  const cards = await fetchTcgdexCards({
    apiBaseUrl,
    limit,
    nameQuery,
    detailBatchSize,
  });
  const writer = fs.createWriteStream(outPath);

  writer.write('cardId,name,setName,number,type,imageUrl\n');

  for (const card of cards) {
    const row = [
      card.id,
      card.name,
      card.set?.name || '',
      card.localId || '',
      'CARD',
      card.image || '',
    ];

    writer.write(row.map(csvEscape).join(',') + '\n');
  }

  writer.end(() => {
    console.log(`Wrote ${cards.length} rows to ${outPath}`);
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
