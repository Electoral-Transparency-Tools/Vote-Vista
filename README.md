# VoteVista

A web portal for visualizing electoral candidates — their assets, criminal records,
manifestos, and the work of the sitting MLA — on an interactive map of your
constituency. This is a proof-of-concept scoped to one Karnataka Assembly
constituency in East Bengaluru.

> **Tech stack:** Next.js 14 (App Router) · TypeScript · Tailwind CSS ·
> MapLibre GL (OpenStreetMap tiles). Data is read at runtime from local
> `data/` and `sources/` folders — no database required for the POC.

## Features

- **🗺️ Interactive map + list view** — the constituency boundary rendered on a map
  (colored by the winning party) with your location pinned, alongside a candidate list.
- **🧑‍⚖️ Candidate explorer** — every candidate with vote share, assets/liabilities,
  education, and a criminal-case flag. The **seat winner (ruling party)** is clearly marked.
- **🔗 Per-candidate records** — one-click links to each candidate's MyNeta affidavit,
  manifesto, and PRS work history, plus an **AI-written, data-based profile**.
- **🤖 AI overview of top candidates** — a balanced, on-demand summary of the leading contenders.
- **🔍 MLA research agent** — on demand, scans the gathered sources (news, affidavit,
  manifesto) and returns a structured report: **work done · integrity/corruption scan ·
  promise-vs-result comparison**, with citations.

> All AI features run **out of the box with no API key** via a deterministic,
> data-driven fallback. Add an API key (below) for live LLM-generated output.

## Installation

### 1. Prerequisites
- Node.js 18+ and npm

### 2. Install & run
```bash
git clone git@github.com:Rutvij-1/Vote-Vista.git
cd Vote-Vista
npm install
npm run dev          # http://localhost:3000
```
For a production build: `npm run build && npm run start`.

### 3. (Optional) Enable live AI output
Copy the example env file and add one API key:
```bash
cp .env.example .env.local
```
The app auto-detects the provider. The cheapest good option is **Google Gemini Flash**
(see "Generating a Gemini API token" below). Because Gemini exposes an
OpenAI-compatible endpoint, it works with the existing code via env vars:
```bash
OPENAI_API_KEY=<your-gemini-key>
OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
OPENAI_MODEL=gemini-2.0-flash-lite
```
Alternatively set `OPENAI_API_KEY` (OpenAI) or `ANTHROPIC_API_KEY` (Anthropic) directly.

### Generating a Gemini API token
1. Go to **Google AI Studio** → https://aistudio.google.com/apikey
2. Sign in with a Google account.
3. Click **"Create API key"** → choose (or create) a Google Cloud project.
4. Copy the key (starts with `AIza...`) into `.env.local` as `OPENAI_API_KEY`.
5. Restart the dev server. The free tier (~1,000 requests/day) covers POC usage at no cost.

> Never commit `.env.local` — it is already in `.gitignore`.

### App structure
```
app/
  page.tsx                 # loads data (server) → renders Portal
  layout.tsx, globals.css
  api/summary/route.ts     # candidate AI profile
  api/overview/route.ts    # top-candidates overview
  api/research/route.ts    # MLA research agent
components/                # Portal, MapView, CandidateDetail, ResearchPanel
lib/                       # data loaders, AI provider, formatters, types
```

---

## Dataset

> **Election scope:** 2023 Karnataka Legislative Assembly (MLA race only).
> **Constituency targeted by this dataset:** C.V. Raman Nagar (SC), AC 161.
> ⚠️ See "Boundary discrepancy" below — the house coordinates actually fall in
> **Shanti Nagar (AC 163)** per the official boundary data. Confirm before building on this.

## Directory structure

```
Vote-Vista/
├── README.md                  # this file
├── data/
│   ├── location_meta.json     # house coords + boundary point-in-polygon check
│   ├── constituency.geojson   # CV Raman Nagar (AC 161) boundary polygon (LGD)
│   ├── candidates.json        # all 2023 candidates + assets/criminal/education
│   └── winning_party.json     # winner (BJP / S. Raghu) + pointers to source text
└── sources/                   # raw text that feeds the AI features
    ├── winner_affidavit.txt              # → candidate AI summary (Feature 3)
    ├── winner_mla_news.json              # → research agent (Feature 5)
    └── winner_party_manifesto_2023.txt   # → promise-vs-result (Feature 5)
```

## Feature → data mapping

| App feature | Backed by |
|---|---|
| 1. Map + list view | `data/constituency.geojson` |
| 2. Candidate list, mark winning party | `data/candidates.json` (`is_seat_winner`) |
| 3. Per-candidate links + AI summary | `candidates.json` + `sources/winner_affidavit.txt` |
| 4. Summary of popular candidates | `candidates.json` (vote_share_pct) |
| 5. On-demand research agent | `sources/winner_mla_news.json` + `winner_party_manifesto_2023.txt` |

## Data sources & provenance

- **Results / candidate list:** Election Commission of India —
  https://results.eci.gov.in/ResultAcGenMay2023/ConstituencywiseS10161.htm?ac=161
- **Assets, liabilities, criminal cases, education:** ADR / MyNeta —
  https://myneta.info/Karnataka2023/index.php?action=show_candidates&constituency_id=828
- **Constituency boundary:** LGD Assembly Constituencies via
  `yashveeeeeeer/india-geodata` (CC0/CC-BY). Single feature extracted for AC 161.
- **MLA news / manifesto:** linked per-item inside the `sources/` files.

All MyNeta data is **self-declared affidavit** data (archived); current status may differ.

## ⚠️ Boundary discrepancy (must resolve)

A point-in-polygon test of the house (`12.9684577, 77.6387454`) against the official
LGD boundaries shows the house inside **Shanti Nagar (AC 163)**, ~700m outside the
southern edge of **C.V. Raman Nagar (AC 161)**. The house is near the CV Raman Nagar /
Shanti Nagar / Mahadevapura junction, and LGD polygons are simplified.

This dataset currently describes **AC 161 (CV Raman Nagar)** per explicit user
confirmation. If the intended target is the constituency that actually contains the
house, the candidate/winner/source data must be re-gathered for **AC 163 (Shanti Nagar)**.
Verify on https://voters.eci.gov.in (enter the address/EPIC) before proceeding.

## Numeric conventions
- All monetary fields (`assets_total_inr`, `liabilities_inr`) are in **INR (rupees)**, integer.
- `null` = not declared / not available in source.
