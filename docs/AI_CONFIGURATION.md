# AI Configuration

VoteVista's AI features are optional. The app remains usable without AI keys by
returning deterministic summaries based on structured election data.

## Features That Use AI

| Feature | Route | UI |
| --- | --- | --- |
| Top-candidate overview | `POST /api/overview` | Sidebar overview panel |
| Candidate research profile | `POST /api/summary` | Candidate detail drawer |
| MLA research report | `POST /api/research` | MLA research modal |

## Provider Selection

`lib/ai.ts` checks providers in this order:

1. `OPENAI_API_KEY`
2. `ANTHROPIC_API_KEY`
3. No configured provider, return `null`

When `OPENAI_API_KEY` is set, the app calls a chat-completions compatible API.
This can be OpenAI or another provider that exposes an OpenAI-compatible
endpoint.

When only `ANTHROPIC_API_KEY` is set, the app calls Anthropic's messages API.

When no provider is configured, route handlers use fallback summaries.

## OpenAI-Compatible Setup

OpenAI default:

```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```

Gemini through Google's OpenAI-compatible endpoint:

```bash
OPENAI_API_KEY=<your-gemini-key>
OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
OPENAI_MODEL=gemini-2.5-flash-lite
```

If `OPENAI_MODEL` is omitted, the app defaults to `gpt-4o-mini`.

## Anthropic Setup

```bash
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-3-5-haiku-latest
```

If `ANTHROPIC_MODEL` is omitted, the app defaults to
`claude-3-5-haiku-latest`.

## Live Web Search

Set `TAVILY_API_KEY` to enable live web search:

```bash
TAVILY_API_KEY=tvly-...
```

`lib/search.ts` sends each query to Tavily, deduplicates results by normalized
URL, filters low-score results, and sorts the remaining results by relevance.

Without Tavily, AI prompts use only structured data and curated local or
database-backed source documents.

## Fallback Behavior

Fallbacks are deliberate, not errors.

`/api/overview` returns a short structured overview of the top candidates by
votes.

`/api/summary` returns candidate facts such as party, constituency, result,
assets, liabilities, education, and declared criminal-case count.

`/api/research` returns a structured report from curated source snippets when
available and clearly states when evidence is thin.

Fallback output keeps local development and demos usable without spending money
or configuring external APIs.

## Caching

AI insight caching is available only in database mode.

Generated payloads are stored in `ai_insight` by:

- `kind`: `summary`, `overview`, or `research`
- `ac_no`: assembly constituency number
- `ref`: candidate name for summaries, empty string for overview/research

The cache TTL is configured in `lib/config.ts`:

```ts
export const AI_INSIGHT_TTL_HOURS = 24;
```

A UI regeneration action sends `force: true`, which bypasses fresh cache and
attempts a new generation.

## Rate Limits

Rate limits are enforced only when a real generation is about to happen. Fresh
cache hits are served without consuming the limit.

The current limits live in `lib/config.ts`:

```ts
export const AI_RATELIMIT_PER_IP_MAX = 15;
export const AI_RATELIMIT_PER_IP_WINDOW_MS = 10 * 60 * 1000;
export const AI_RATELIMIT_GLOBAL_DAILY_MAX = 500;
export const AI_RATELIMIT_GLOBAL_WINDOW_MS = 24 * 60 * 60 * 1000;
```

If a limit is reached and stale cached data exists, stale data is served with a
rate-limited flag. If no cached data exists, the route returns `429`.

Rate limits use the `rate_limit` table and require `DATABASE_URL`.

## Prompting Rules

The route handlers prompt the model to use only provided candidate data, curated
source documents, and optional Tavily results. Prompts ask the model to:

- Stay neutral and factual.
- Avoid speculation.
- Report allegations as allegations.
- Prefer fresh live search results when available.
- State when evidence is thin.

The MLA research route asks the model for JSON with `workSummary`,
`integrityScan`, and `promiseVsResult`. If parsing fails, the raw model text is
used as the work summary rather than failing the request.

## Cost Controls

Use these controls together:

- Keep `AI_INSIGHT_TTL_HOURS` high enough for demos and shared usage.
- Keep `AI_RATELIMIT_PER_IP_MAX` low enough to avoid accidental loops.
- Keep `AI_RATELIMIT_GLOBAL_DAILY_MAX` aligned with your provider budget.
- Use Tavily result caps in the route handlers to limit prompt size.
- Prefer a low-cost OpenAI-compatible model such as Gemini Flash for demos.

## Troubleshooting

If AI buttons return fallback text, check that the relevant API key is present in
`.env.local` and restart the dev server.

If live research has no sources, check `TAVILY_API_KEY` and Tavily account quota.

If responses never show as cached, check that `DATABASE_URL` is configured and
that `ai_insight` exists. Run `npm run db:migrate:insights` if needed.

If requests return `429`, wait for the fixed window to reset or raise the limits
in `lib/config.ts`.
