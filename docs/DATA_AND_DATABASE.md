# Data And Database

VoteVista can run from a Postgres/PostGIS database or from local JSON/text files.
Database mode is recommended because it supports spatial lookup, broader map
coverage, cached AI outputs, and AI rate limits.

## Data Modes

Database mode is active when `DATABASE_URL` is set. `lib/data.ts` reads from
tables defined in `db/schema.sql`.

Local fallback mode is active when `DATABASE_URL` is not set. The app reads local
files from `data/` and `sources/`. This mode is mainly for the curated AC 161
proof-of-concept data.

Most gathered data files are ignored by git. A fresh clone may not include all
local fallback or seed inputs unless they have been restored separately.

## Expected Local Files

The local fallback and seed scripts expect these files when available:

| Path | Purpose |
| --- | --- |
| `data/location_meta.json` | Configured proof-of-concept house coordinates and boundary-check metadata. |
| `data/constituency.geojson` | Curated AC 161 boundary fallback. |
| `data/candidates.json` | Curated AC 161 candidate and constituency facts. |
| `data/winning_party.json` | Curated AC 161 winner and source-document pointers. |
| `data/bangalore_constituencies.geojson` | Bengaluru assembly boundaries for DB seeding. |
| `data/bangalore_candidates.json` | Parsed Bengaluru candidate records for DB seeding. |
| `data/bangalore_votes.json` | Vote and vote-share backfill data for DB seeding. |
| `sources/winner_affidavit.txt` | Curated winner affidavit text for AC 161 AI prompts. |
| `sources/winner_mla_news.json` | Curated MLA news/source snippets for AC 161 research. |
| `sources/winner_party_manifesto_2023.txt` | Curated manifesto text for promise-vs-result prompts. |

## Database Schema

`db/schema.sql` creates these tables:

| Table | Purpose |
| --- | --- |
| `constituency` | Assembly constituency metadata and PostGIS boundary geometry. |
| `candidate` | Candidate facts, declared assets/liabilities, criminal-case counts, links, and vote data. |
| `winning_party` | Winning candidate and party metadata by constituency. |
| `source_doc` | Source text and links used by AI prompts. |
| `ai_insight` | Cached AI outputs for candidate summaries, top-candidate overviews, and MLA reports. |
| `rate_limit` | Fixed-window counters for AI generation limits. |

The `constituency.boundary` column is a `geometry(MultiPolygon, 4326)` and has a
GIST index for spatial lookup.

## Seed Order

Set `DATABASE_URL` in `.env.local`, then run:

```bash
npm run db:seed
npm run db:seed:constituencies
npm run db:seed:candidates
npm run db:backfill:votes
```

`npm run db:seed` applies `db/schema.sql`, clears existing core rows, and loads
the curated AC 161 data plus source documents.

`npm run db:seed:constituencies` upserts Bengaluru assembly boundaries. For
existing rows, it updates only the boundary so curated election metadata is
preserved.

`npm run db:seed:candidates` loads candidate records for other Bengaluru
constituencies. AC 161 is skipped so the richer curated record is not replaced.

`npm run db:backfill:votes` applies vote counts and vote shares from local vote
data using name similarity. AC 161 keeps its curated vote data.

`npm run db:migrate:insights` can be used independently to create the
`ai_insight` and `rate_limit` tables if the main schema has already been applied
without them.

## App Data Access

`getConstituencyDetail(ac)` returns constituency metadata, candidates, and winner
details. In database mode it works for any seeded constituency. In local fallback
mode it returns only AC 161.

`getConstituenciesInBBox(minLng, minLat, maxLng, maxLat)` returns boundaries for
the current map viewport. In database mode it uses PostGIS envelope intersection.
In local fallback mode it returns the single local constituency boundary.

`getConstituencyAtPoint(lat, lng)` resolves a browser or configured location to
an assembly constituency. This requires database mode because local fallback does
not perform point-in-polygon lookup.

`getAffidavitText()`, `getManifestoText()`, and `getMlaNews()` read DB source
documents for AC 161 when present and otherwise read local source files.

## Provenance

The curated AC 161 dataset combines public election result data, ADR/MyNeta
self-declared candidate affidavit data, public boundary data, and hand-curated
source snippets for the sitting MLA and winning party manifesto.

All affidavit-derived fields should be treated as self-declared and time-bound.
They are not a guarantee of current assets, liabilities, education, or legal
status.

## Numeric Conventions

`assets_total_inr` and `liabilities_inr` are stored as integer INR amounts.

`vote_share_pct` is a percentage number such as `42.1`, not a fraction.

`null` means the source did not declare the value or the value was not available.

## Known Boundary Caveat

The configured proof-of-concept coordinates are close to the C.V. Raman Nagar,
Shanti Nagar, and Mahadevapura boundary area. The available boundary data places
that point in Shanti Nagar (AC 163), while the richest curated data is for
C.V. Raman Nagar (AC 161).

Before using VoteVista for production decisions, verify the target constituency
against the official voter portal or authoritative election records.
