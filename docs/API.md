# API Routes

VoteVista uses Next.js route handlers under `app/api`. All routes run in the
Node.js runtime.

## `GET /api/constituencies`

Returns constituency boundary features for the current map viewport.

Query parameters:

| Name | Required | Description |
| --- | --- | --- |
| `bbox` | Yes | Comma-separated `minLng,minLat,maxLng,maxLat`. |

Example:

```http
GET /api/constituencies?bbox=77.5,12.8,77.8,13.1
```

Success response:

```json
{
  "type": "FeatureCollection",
  "features": []
}
```

Errors:

- `400` when `bbox` is missing or invalid.

Notes:

- Database mode uses PostGIS to return boundaries whose bounding boxes intersect
  the viewport.
- Local fallback mode returns the local curated constituency boundary.
- Responses include `Cache-Control: public, max-age=300`.

## `GET /api/constituency/[ac]`

Returns full detail for a constituency.

Path parameters:

| Name | Description |
| --- | --- |
| `ac` | Assembly constituency number. |

Example:

```http
GET /api/constituency/161
```

Success response shape:

```json
{
  "constituency": {
    "ac_no": 161,
    "ac_name": "C.V. Raman Nagar",
    "pc_name": "Bangalore Central",
    "district": "Bengaluru",
    "state": "Karnataka",
    "election": "Karnataka Assembly 2023",
    "poll_date": "2023-05-10",
    "result_date": "2023-05-13",
    "total_electors": 0,
    "total_valid_votes": 0,
    "turnout_pct": 0,
    "reservation": "SC"
  },
  "candidates": [],
  "winningParty": {
    "party": "Bharatiya Janata Party",
    "party_short": "BJP",
    "winning_candidate": "S. Raghu"
  }
}
```

Errors:

- `400` when `ac` is not an integer.
- `404` when no constituency detail is available.

## `GET /api/locate`

Resolves a latitude/longitude point to an assembly constituency number.

Query parameters:

| Name | Required | Description |
| --- | --- | --- |
| `lat` | Yes | Latitude. |
| `lng` | Yes | Longitude. |

Example:

```http
GET /api/locate?lat=12.9684577&lng=77.6387454
```

Success response:

```json
{
  "ac": 163
}
```

If no constituency contains the point, `ac` is `null`.

Errors:

- `400` when `lat` or `lng` is missing or invalid.

Notes:

- This route requires database mode for real point-in-polygon lookup.
- Local fallback mode currently returns `null`.

## `POST /api/overview`

Generates or serves a cached overview of the top candidates in a constituency.

Request body:

```json
{
  "ac": 161,
  "force": false
}
```

Fields:

| Name | Required | Description |
| --- | --- | --- |
| `ac` | No | Assembly constituency number. Defaults to `161`. |
| `force` | No | Regenerate even if a fresh cached insight exists. Defaults to `false`. |

Success response:

```json
{
  "overview": "Short candidate overview.",
  "source": "openai:gpt-4o-mini",
  "cached": false,
  "rateLimited": false,
  "generatedAt": "2026-06-10T00:00:00.000Z"
}
```

Errors:

- `404` when the constituency is unavailable.
- `429` when generation is rate-limited and no cached response is available.

## `POST /api/summary`

Generates or serves a cached research profile for one candidate.

Request body:

```json
{
  "ac": 161,
  "name": "S. Raghu",
  "force": false
}
```

Fields:

| Name | Required | Description |
| --- | --- | --- |
| `ac` | No | Assembly constituency number. Defaults to `161`. |
| `name` | Yes | Candidate name exactly as stored in candidate data. |
| `force` | No | Regenerate even if a fresh cached insight exists. |

Success response:

```json
{
  "summary": "Short candidate research profile.",
  "source": "openai:gpt-4o-mini + web search (tavily)",
  "sources": [
    {
      "title": "Source title",
      "url": "https://example.com/source"
    }
  ],
  "cached": false,
  "rateLimited": false,
  "generatedAt": "2026-06-10T00:00:00.000Z"
}
```

Errors:

- `404` when the candidate is unavailable.
- `429` when generation is rate-limited and no cached response is available.

Notes:

- Tavily search is used only when `TAVILY_API_KEY` is configured.
- For the curated AC 161 winner, affidavit text can be included in the prompt.
- Without an LLM key, the route returns a deterministic fallback summary.

## `POST /api/research`

Generates or serves a cached MLA research report for a constituency.

Request body:

```json
{
  "ac": 161,
  "force": false
}
```

Fields:

| Name | Required | Description |
| --- | --- | --- |
| `ac` | No | Assembly constituency number. Defaults to `161`. |
| `force` | No | Regenerate even if a fresh cached insight exists. |

Success response:

```json
{
  "generatedBy": "openai:gpt-4o-mini + live web search (tavily)",
  "workSummary": "Short work summary.",
  "integrityScan": "Short integrity scan.",
  "promiseVsResult": "Short promise-vs-result analysis.",
  "sources": [
    {
      "title": "Source title",
      "url": "https://example.com/source"
    }
  ],
  "cached": false,
  "rateLimited": false,
  "generatedAt": "2026-06-10T00:00:00.000Z"
}
```

Errors:

- `404` when the constituency is unavailable.
- `429` when generation is rate-limited and no cached response is available.

Notes:

- Curated affidavit, news, and manifesto text are currently loaded only for
  AC 161.
- Other constituencies rely primarily on structured winner/candidate data and
  optional live web search.
- Allegations are intended to be reported as allegations, not established facts.

## Rate-Limit Response

AI routes return this shape when blocked:

```json
{
  "error": "rate_limited",
  "message": "Too many AI requests. Please try again later."
}
```

The response includes a `Retry-After` header when available.
