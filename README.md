# VoteVista

VoteVista is a civic-information web app for exploring Karnataka Assembly
constituencies, candidates, winner details, and AI-assisted research summaries on
an interactive map.

The current proof of concept focuses on the 2023 Karnataka Legislative Assembly
election. C.V. Raman Nagar (SC), AC 161 has the richest curated local dataset;
when a Postgres/PostGIS database is configured, the app can also load broader
Bengaluru constituency boundaries and candidate records.

## Features

- Interactive MapLibre map using OpenStreetMap tiles.
- Viewport-loaded assembly constituency boundaries colored by winning party.
- Geolocation lookup that switches the selected constituency when the user grants
  browser location access.
- Constituency stats, candidate list, winner highlighting, and candidate detail
  drawer.
- Candidate records for votes, vote share, assets, liabilities, education,
  declared criminal cases, and source links.
- On-demand AI overview of top candidates.
- On-demand MLA research report covering work record, integrity/corruption scan,
  and promise-vs-result context.
- Optional live web search through Tavily and optional LLM output through OpenAI,
  OpenAI-compatible providers such as Gemini, or Anthropic.
- Deterministic fallback summaries when AI keys are not configured.
- Light/dark theme toggle.

## Tech Stack

- Next.js 14 App Router
- React 18 and TypeScript
- Tailwind CSS
- MapLibre GL with OpenStreetMap raster tiles
- Neon serverless Postgres with PostGIS, optional but recommended
- Provider-agnostic AI calls through `fetch`, with no AI SDK dependency

## Quick Start

Prerequisites:

- Node.js 18+
- npm

Install and run:

```bash
git clone git@github.com:Rutvij-1/Vote-Vista.git
cd Vote-Vista
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

Production build:

```bash
npm run build
npm run start
```

## Configuration

All environment variables are optional for the UI to start, but data availability
depends on the mode you choose.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Enables Neon/Postgres reads, PostGIS map queries, AI insight cache, and rate limits. |
| `OPENAI_API_KEY` | Enables OpenAI or OpenAI-compatible LLM output. |
| `OPENAI_BASE_URL` | Optional OpenAI-compatible base URL, for example Gemini. |
| `OPENAI_MODEL` | Optional OpenAI-compatible model name. Defaults to `gpt-4o-mini`. |
| `ANTHROPIC_API_KEY` | Enables Anthropic LLM output when no OpenAI key is set. |
| `ANTHROPIC_MODEL` | Optional Anthropic model name. |
| `TAVILY_API_KEY` | Enables live web search for candidate and MLA research. |

Gemini example:

```bash
OPENAI_API_KEY=<your-gemini-key>
OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
OPENAI_MODEL=gemini-2.5-flash-lite
```

Never commit `.env.local`; it is ignored by git.

## Data Modes

VoteVista supports two data modes:

- Database mode: set `DATABASE_URL`. This is the recommended mode. The app reads
  constituencies, candidates, winners, source documents, cached AI insights, and
  rate-limit counters from Postgres/PostGIS.
- Local fallback mode: leave `DATABASE_URL` unset. The app reads local
  `data/*.json`, `data/*.geojson`, and `sources/*` files. Most gathered data
  files are intentionally ignored by git, so a fresh clone may need local seed
  files restored or a configured database.

Seed a configured database:

```bash
npm run db:seed
npm run db:seed:constituencies
npm run db:seed:candidates
npm run db:backfill:votes
```

`npm run db:seed` applies `db/schema.sql` and loads the curated AC 161 dataset.
The other seed scripts extend the database with Bengaluru boundaries, candidates,
and vote backfills where available.

## Project Layout

```text
app/
  page.tsx                  Server entry point and initial constituency load
  api/                      Route handlers for map, location, and AI features
components/
  Portal.tsx                Main client UI
  MapView.tsx               MapLibre map and viewport boundary loading
  CandidateDetail.tsx       Candidate drawer and candidate AI research
  ResearchPanel.tsx         MLA research modal
lib/
  data.ts                   DB-first data access with local file fallback
  ai.ts                     OpenAI-compatible and Anthropic text generation
  search.ts                 Tavily web search helper
  insights.ts               AI cache orchestration
  ratelimit.ts              DB-backed AI generation rate limits
db/schema.sql               Postgres/PostGIS schema
scripts/                    Database seed and migration scripts
docs/                       Detailed project documentation
```

## Documentation

- `docs/ARCHITECTURE.md` explains the app flow, frontend boundaries, data layer,
  AI flow, caching, and rate limiting.
- `docs/DATA_AND_DATABASE.md` explains local files, database schema, seed order,
  provenance, and data caveats.
- `docs/API.md` documents the route handlers and request/response shapes.
- `docs/AI_CONFIGURATION.md` explains providers, fallback behavior, live search,
  cache TTL, and cost controls.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Next.js dev server. |
| `npm run build` | Build the production app. |
| `npm run start` | Start the production server. |
| `npm run lint` | Run Next.js linting. |
| `npm run db:seed` | Apply schema and seed curated AC 161 data. |
| `npm run db:seed:constituencies` | Upsert Bengaluru constituency boundaries. |
| `npm run db:seed:candidates` | Load Bengaluru candidate records from local data. |
| `npm run db:backfill:votes` | Backfill vote counts and vote shares from local vote data. |
| `npm run db:migrate:insights` | Create AI insight cache and rate-limit tables. |

## Dataset Notes

- Election scope: 2023 Karnataka Legislative Assembly.
- Curated constituency: C.V. Raman Nagar (SC), AC 161.
- Broader map scope: Bengaluru assembly constituencies when the DB is seeded.
- Candidate affidavit data comes from ADR/MyNeta and is self-declared.
- Result and vote data comes from public election result sources where available.
- Boundary data comes from public LGD-derived assembly constituency geometries.
- Monetary fields such as `assets_total_inr` and `liabilities_inr` are stored as
  integer INR amounts.
- `null` means not declared or not available in the source.
