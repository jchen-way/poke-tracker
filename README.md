## Pokemon Tracker

This app now ingests card metadata and pricing from [TCGdex](https://tcgdex.dev/), a free and open-source Pokemon TCG API, and stores app data with Prisma in a hosted PostgreSQL database.

## Environment

Create `tracker_app/.env` from `tracker_app/.env.example` and set:

- `DATABASE_URL`: your hosted Postgres connection string
- `AUTH_SECRET`: a long random string used to sign login sessions
- `CRON_SECRET`: a long random string used to authorize scheduled ingestion requests
- `GOOGLE_CLIENT_ID`: your Google OAuth web app client ID for Google sign-in
- `GOOGLE_CLIENT_SECRET`: your Google OAuth web app client secret
- `GOOGLE_REDIRECT_URI`: optional explicit Google OAuth callback URL, otherwise defaults to `/api/auth/google/callback`
- `RESEND_API_KEY`: API key for outbound signal emails
- `EMAIL_FROM`: verified sender address for outbound emails
- `APP_BASE_URL`: public app URL used in email links, for example `https://poke-tracks.vercel.app`
- `EBAY_ACCOUNT_DELETION_ENDPOINT`: your deployed eBay notification callback URL
- `EBAY_VERIFICATION_TOKEN`: the token you enter in the eBay developer console
- `EBAY_CLIENT_ID`: your eBay production App ID / Client ID
- `EBAY_CLIENT_SECRET`: your eBay production Cert ID / Client Secret
- `EBAY_ENV`: usually `production`
- `EBAY_MARKETPLACE_ID`: usually `EBAY_US`
- `TCGDEX_LANGUAGE`: API language, usually `en`
- `CARD_SYNC_LIMIT`: how many non-watchlist tracked cards to refresh per ingest run
- `ETB_SYNC_LIMIT`: how many tracked ETBs to refresh per ingest run
- `ETB_CATALOG_SYNC_LIMIT`: how many ETB catalog entries to validate per ingest run

## Database Setup

Generate the Prisma client and push the schema to the hosted database:

```bash
npm run prisma:generate
npm run db:push
```

## Development

Start the Next.js app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Protected app pages include:

- `/dashboard` for card tracking
- `/collections` for tracked cards only
- `/etbs` for ETBs derived from TCGdex Pokemon sets and background-validated against eBay
- `/watchlist` for prioritized cards and ETBs
- `/settings` for account settings, password updates, display name, and email signal preferences

Authentication supports:

- email/password registration and login
- Google sign-in when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are configured

Email notifications:

- are sent after ingest runs when `RESEND_API_KEY` and `EMAIL_FROM` are configured
- respect the user's `/settings` preference
- are scoped to new signals on cards in that user's watchlist
- are deduped so the same signal snapshot is not emailed repeatedly on every cron run

## Ingestion

Trigger a sync manually:

```bash
curl -H "x-cron-secret: YOUR_CRON_SECRET" "http://localhost:3000/api/cron/ingest?limit=50"
```

By default, ingest now refreshes only the stalest tracked cards instead of trying to re-fetch the whole catalog on every run.
Tracked ETBs are also refreshed in smaller eBay-backed batches during the same job.

Card refreshes now use a hybrid queue:

- every watchlisted card is refreshed on every ingest run
- an additional rotating background batch of tracked cards is refreshed each run using `CARD_SYNC_LIMIT`
- dashboard signals, opportunities, and discrepancies are computed across all tracked cards using the latest snapshot per card

To expand the tracked catalog in batches, use `discoverLimit`:

```bash
curl -H "x-cron-secret: YOUR_CRON_SECRET" "http://localhost:3000/api/cron/ingest?limit=50&discoverLimit=200"
```

This will:

- discover or update metadata for 200 cards from TCGdex
- then refresh prices for the next 50 queued tracked cards

Recommended production pattern:

- run a small `discoverLimit` job occasionally to grow the catalog
- run frequent `limit` refresh jobs to keep prices current

To seed chart history immediately for new cards, backfill daily snapshots in the same request:

```bash
curl -H "x-cron-secret: YOUR_CRON_SECRET" "http://localhost:3000/api/cron/ingest?limit=20&historyDays=30&historyPoints=30"
```

## Scheduled Ingestion

A GitHub Actions workflow is included at scheduled-ingest.yml

Set these repository secrets before enabling it:

- `APP_URL`: your deployed Vercel app URL, for example `https://your-app.vercel.app`
- `CRON_SECRET`: the same value used in your app environment

The workflow runs:

- every 2 hours for hybrid card refresh batches
- every Sunday at 3:00 UTC for a larger catalog discovery batch

## eBay Account Deletion Callback

If you enable eBay production keys, configure the notification endpoint in eBay as:

```text
https://your-app.vercel.app/api/ebay/account-deletion
```

This app includes that callback route at route.ts

Required env vars:

```env
EBAY_ACCOUNT_DELETION_ENDPOINT=https://your-app.vercel.app/api/ebay/account-deletion
EBAY_VERIFICATION_TOKEN=your_verification_token_from_ebay_console
```

The sync will:

- fetch card lists from TCGdex
- load detailed pricing for each tracked card
- upsert tracked items into Postgres
- write price snapshots using free TCGplayer and Cardmarket data embedded in TCGdex
- optionally enrich the current refresh batch with eBay pricing if `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET` are set

eBay pricing is split intentionally:

- `ebayPrice`: median active listing price used as a market-level comparison input for consensus fair value
- `ebayLowPrice`: lowest matched active listing used for buy-opportunity detection

The eBay matcher is stricter than a raw keyword search. It filters out noisy listings such as lots, booster products, graded slabs, and proxy/custom items, and it requires title alignment with the card name plus set/number when available.

Rate-limit note:

- TCGdex does not publish a clear hard request-per-minute limit in the official docs/site referenced by this app, so the TCGdex fan-out remains conservative (`TCGDEX_PAGE_SIZE=50`, `TCGDEX_DETAIL_BATCH_SIZE=10`)
- eBay Browse limits are app-dependent and not clearly published as a single stable public number, so the hybrid scheduler stays well below the commonly referenced 5,000-calls-per-day budget by refreshing watchlist cards every run and rotating the rest of the catalog
- Vercel Hobby function limits are compatible with this batch size, so the schedule is increased to every 2 hours rather than attempting a full-universe refresh in one request

## CSV Export Utility

You can export cards to CSV without relying on a local `pokemon-tcg-data-master` checkout:

```bash
node scripts/extract_tcg_data.js --out /tmp/pokemon_tcg_cards.csv --limit 200
```
