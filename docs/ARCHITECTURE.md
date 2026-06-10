# Architecture

VoteVista is a Next.js App Router application. The server loads the initial
constituency data, then the client handles map movement, constituency selection,
candidate drawers, and on-demand AI actions.

## High-Level Flow

1. `app/page.tsx` reads the configured proof-of-concept location from
   `data/location_meta.json`.
2. The server tries to resolve that point to an assembly constituency through
   `getConstituencyAtPoint()`.
3. If the point cannot be resolved, the app falls back to AC 161.
4. `getConstituencyDetail()` loads the selected constituency and candidates.
5. `components/Portal.tsx` renders the client UI with that initial detail.
6. `components/MapView.tsx` loads constituency boundaries for the current map
   viewport through `/api/constituencies`.

## Frontend Components

`components/Portal.tsx` is the main client shell. It owns selected constituency
state, candidate selection, cached constituency details, live geolocation
handling, AI overview loading, and the MLA research modal.

`components/MapView.tsx` initializes MapLibre once on the client. It uses
OpenStreetMap raster tiles, fetches constituency GeoJSON by bounding box, caches
features by `ac_no`, colors them by winner party, and calls back when a user
clicks a constituency.

`components/CandidateDetail.tsx` renders the candidate drawer. It displays
declared candidate facts and calls `/api/summary` for candidate research.

`components/ResearchPanel.tsx` renders the MLA research modal and calls
`/api/research`.

`components/ThemeToggle.tsx` controls class-based dark mode.

## Data Layer

`lib/data.ts` is the main data boundary. It follows a DB-first pattern:

- If `DATABASE_URL` is configured, reads come from Neon Postgres/PostGIS.
- If no database is configured, curated local files under `data/` and `sources/`
  are used as a fallback.

The local fallback is primarily for the curated AC 161 proof of concept. Broader
constituency lookup and viewport queries work best with PostGIS because they rely
on spatial queries such as `ST_Contains`, `ST_MakeEnvelope`, and
`ST_AsGeoJSON`.

## API Layer

The API routes are thin wrappers around `lib/data.ts`, `lib/ai.ts`,
`lib/search.ts`, and `lib/insights.ts`.

- `/api/constituencies` returns GeoJSON features for a map viewport.
- `/api/constituency/[ac]` returns candidates and winner metadata.
- `/api/locate` resolves a latitude/longitude point to an assembly constituency.
- `/api/overview` generates or serves a top-candidates overview.
- `/api/summary` generates or serves a candidate research profile.
- `/api/research` generates or serves an MLA research report.

See `docs/API.md` for request and response details.

## AI Flow

AI generation is optional. If no LLM key is configured, each AI route returns a
deterministic fallback derived from structured data.

When generation is available:

1. The route builds a facts-only prompt from candidate, constituency, source
   document, and optional web-search data.
2. `lib/ai.ts` calls either an OpenAI-compatible chat completions endpoint or
   Anthropic messages API.
3. The generated payload is cached by `lib/insights.ts` when a database is
   configured.
4. UI components show whether the response was cached or freshly generated.

The code intentionally avoids an AI SDK. Provider calls use `fetch` directly.

## Search Flow

`lib/search.ts` integrates with Tavily when `TAVILY_API_KEY` is configured.
Search results are deduplicated by normalized URL, filtered by score, and sorted
by relevance before they are added to AI prompts.

Without Tavily, the app still works. Candidate and MLA research use curated
source files and structured fallback text.

## Caching And Rate Limits

`lib/insights.ts` stores generated AI outputs in the `ai_insight` table. The TTL
is controlled by `AI_INSIGHT_TTL_HOURS` in `lib/config.ts`.

`lib/ratelimit.ts` enforces fixed-window generation limits only when a real
generation is about to happen. Cache hits do not count against the limits.

If a user is rate-limited and stale cached data exists, the stale cached data is
served. If no cached data exists, the route returns `429`.

Rate limits require a configured database. Without `DATABASE_URL`, generation is
not blocked by the DB-backed limiter.

## Deployment Notes

The app uses Node.js route handlers for API routes that access files, call
external APIs, or use the Neon serverless client. On serverless hosts, use a
pooled Neon connection string for `DATABASE_URL`.
