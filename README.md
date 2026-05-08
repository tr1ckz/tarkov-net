# TARKOV NET

A custom Tarkov Market platform built with Next.js 14 App Router, Prisma + SQLite, NextAuth Credentials, and tarkov.dev GraphQL data.

## Features

- PvP/PvE global market mode toggle using the `gameMode` GraphQL argument
- Multi-user auth with private favorites per account
- Dashboard with searchable item table and flea vs trader comparison
- Watchlist page with cached data and 24h snapshot trend indicators
- Item detail page with craft/barter profitability and trader sell prices
- Docker deployment support for Unraid
- SQLite cache layer for fast dashboard/watchlist loads
- Background market refresh every 5 minutes (stale-while-revalidate)
- Daily full item sync to detect newly added items

## Stack

- Next.js 14 (App Router)
- NextAuth.js (Credentials)
- Prisma + SQLite
- Tailwind CSS + shadcn-style UI primitives
- GraphQL Request client against `https://api.tarkov.dev/graphql`

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Copy envs:

```bash
cp .env.example .env
```

3. Create database and Prisma client:

```bash
npx prisma migrate dev --name init
npx prisma generate
```

4. Run app:

```bash
npm run dev
```

## Unraid Deployment

1. Configure `NEXTAUTH_URL` and `NEXTAUTH_SECRET` in `docker-compose.yaml`
2. Keep SQLite data on a dedicated mounted path (`./data` -> `/app/data`) and use `DATABASE_URL=file:/app/data/dev.db`
3. Build and start:

```bash
docker compose up -d --build
```

## Core GraphQL Entry Points

- `getAllItems(mode)` in `src/lib/tarkov.ts`
- `getItemById(id, mode)` in `src/lib/tarkov.ts`

## Cache Architecture

- Dashboard and watchlist read from SQLite cache tables (`CachedItem`, `CachedItemPrice`, `CachedPricePoint`)
- Cache refresh is triggered in the background from page requests
- Refresh cadence: every 5 minutes per game mode
- Full sync cadence: every 24 hours to capture new items
- Price snapshots are stored every 15 minutes for trend tracking
- This follows tarkov.dev guidance: do not poll faster than every 5 minutes, and prefer bulk queries plus local caching over repeated per-item calls

## Optional External Refresh (Cron)

You can trigger cache refresh from Unraid cron or another scheduler:

```bash
curl -X POST http://localhost:3000/api/cache/refresh -H "x-cache-secret: $CACHE_REFRESH_SECRET"
```

If `CACHE_REFRESH_SECRET` is unset, the endpoint accepts unauthenticated local calls.
