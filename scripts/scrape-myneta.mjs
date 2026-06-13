// Scrape candidate affidavit summaries from MyNeta (ADR) for the configured
// assembly constituencies and emit data/bangalore_candidates.json in the
// shape expected by scripts/seed-bangalore-candidates.mjs:
//
// {
//   "<ac_no>": {
//     "candidates": [ { name, party, party_short, is_seat_winner,
//                       criminal_cases_count, education, age,
//                       assets_total_inr, liabilities_inr, affidavit_url } ],
//     "winner": <same shape or null>
//   }
// }
//
// Source: https://www.myneta.info/karnataka2023/
//
// The set of constituencies to scrape is derived from
// data/bangalore_constituencies.geojson (committed in the repo), so the
// scraper stays in sync with whatever the rest of the app already covers.
//
// Run:  node scripts/scrape-myneta.mjs
//   --election=karnataka2023            (MyNeta folder; default karnataka2023)
//   --output=data/bangalore_candidates.json
//   --limit=N                            (scrape only first N ACs; for testing)
//   --delay=750                          (ms between requests; politeness)

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  }),
);

const ELECTION = args.election || "karnataka2023";
const OUTPUT = args.output || "data/bangalore_candidates.json";
const LIMIT = args.limit ? Number(args.limit) : Infinity;
const DELAY_MS = args.delay ? Number(args.delay) : 750;
const BASE = `https://www.myneta.info/${ELECTION}`;
const UA =
  "Mozilla/5.0 (compatible; VoteVistaRefresh/1.0; +https://github.com/Rutvij-1/Vote-Vista)";

// ------- helpers ---------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url, { tries = 3 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
      await sleep(1000 * (i + 1));
    }
  }
  throw lastErr;
}

// Strip diacritics, lowercase, keep [a-z0-9].
const normalize = (s) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

// Known typo / spelling differences between the LGD-derived geojson names
// and MyNeta's site labels. Maps geojson normalized name -> MyNeta normalized name.
const NAME_ALIASES = {
  yeshvanthapura: "yeshwanthapura",                // v vs w
  chamrajpet: "chamrajapet",                       // missing 'a'
  govindrajnagar: "govindarajanagar",              // missing a's
  vijaynagar: "vijayanagar",                       // missing 'a'
  cvramannagarsc: "cvramannnagarsc",               // MyNeta has triple-n typo
  mahadevapura: "mahadevapurasc",                  // MyNeta marks SC, geojson doesn't
};

// Party short -> full name. Falls back to using the MyNeta string for both
// fields if the short isn't in this map.
const PARTY_LONG = {
  INC: "Indian National Congress",
  BJP: "Bharatiya Janata Party",
  "JD(S)": "Janata Dal (Secular)",
  AAP: "Aam Aadmi Party",
  BSP: "Bahujan Samaj Party",
  CPI: "Communist Party of India",
  "CPI(M)": "Communist Party of India (Marxist)",
  SP: "Samajwadi Party",
  NCP: "Nationalist Congress Party",
  IND: "Independent",
  NOTA: "None of the Above",
};

// Rs 1,23,45,678  ->  12345678 (integer INR). Returns null on no digits.
// Some candidates render their amount as a PNG via image_v2.php — those are
// unscrapable from this page and become null. The cell HTML looks like
// "Rs&nbsp;1,23,45,678<br>~ 1 Crore+", so we strip tags + entities first.
function parseRupees(html) {
  if (/<img\b/i.test(html)) return null;
  const text = html.replace(/&nbsp;/g, " ").replace(/<[^>]+>/g, " ");
  const m = text.match(/Rs\s*([\d,]+)/i);
  if (!m) return null;
  const digits = m[1].replace(/,/g, "");
  return digits ? Number(digits) : null;
}


// "<span class='w3-badge w3-padding w3-red'><b> 5 </b></span>" or plain "0".
function parseCriminalCases(html) {
  const stripped = html.replace(/<[^>]+>/g, " ").trim();
  const m = stripped.match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

function stripTags(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ------- index page: name -> constituency_id ----------------------------

function parseConstituencyIndex(html) {
  // Skip bye-election links (they have absolute https URLs and "BYE ELECTION").
  const re =
    /href=index\.php\?action=show_candidates&constituency_id=(\d+)[^>]*>([^<]+)<\/a>/g;
  const out = {};
  let m;
  while ((m = re.exec(html)) !== null) {
    const id = Number(m[1]);
    const name = m[2].trim();
    if (/BYE ELECTION/i.test(name)) continue;
    out[normalize(name)] = { id, raw: name };
  }
  return out;
}

// ------- constituency page: candidate table -----------------------------

function parseCandidates(html) {
  // Find the candidates table by its class.
  const tStart = html.indexOf("<table class='w3-table w3-bordered'>");
  if (tStart < 0) return [];
  const tEnd = html.indexOf("</table>", tStart);
  const tableHtml = html
    .slice(tStart, tEnd)
    // Strip embedded <script>...</script> blocks MyNeta injects mid-table.
    .replace(/<script\b[\s\S]*?<\/script>/gi, "");

  // Each candidate row is a <tr>...</tr> containing 8 <td>s.
  const rows = [...tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(
    (m) => m[1],
  );

  const candidates = [];
  for (const row of rows) {
    if (/<th\b/i.test(row)) continue; // header
    const tds = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
    if (tds.length < 8) continue;
    // tds = [SNo, Candidate, Party, CrimCases, Education, Age, Assets, Liab]

    // Candidate cell: <a href=candidate.php?candidate_id=NNN>Name</a> [winner badge]
    const candCell = tds[1];
    const link = candCell.match(/href=candidate\.php\?candidate_id=(\d+)/i);
    const nameMatch = candCell.match(/<a[^>]*>([^<]+)<\/a>/i);
    const name = nameMatch ? stripTags(nameMatch[1]) : stripTags(candCell);
    if (!name) continue;
    const isWinner = /Winner/i.test(candCell);
    const candidateId = link ? Number(link[1]) : null;

    const partyShort = stripTags(tds[2]);
    const party = PARTY_LONG[partyShort] || partyShort;

    const criminalCasesCount = parseCriminalCases(tds[3]);
    const education = stripTags(tds[4]) || null;
    const ageRaw = stripTags(tds[5]);
    const age = ageRaw && /^\d+$/.test(ageRaw) ? Number(ageRaw) : null;
    const assets = parseRupees(tds[6]);
    const liabilities = parseRupees(tds[7]);

    candidates.push({
      name,
      party,
      party_short: partyShort,
      is_seat_winner: isWinner,
      criminal_cases_count: criminalCasesCount,
      education,
      age,
      assets_total_inr: assets,
      liabilities_inr: liabilities,
      affidavit_url: candidateId
        ? `${BASE}/candidate.php?candidate_id=${candidateId}`
        : "",
    });
  }
  return candidates;
}

// ------- main ------------------------------------------------------------

async function main() {
  console.log(`[scrape-myneta] Election folder: ${ELECTION}`);
  console.log(`[scrape-myneta] Reading geojson for AC list…`);
  const fc = JSON.parse(
    readFileSync("data/bangalore_constituencies.geojson", "utf-8"),
  );
  const targets = fc.features
    .map((f) => f.properties)
    .filter((p) => p && p.ac_no && p.ac_name)
    .sort((a, b) => a.ac_no - b.ac_no);
  console.log(`[scrape-myneta] ${targets.length} target constituencies.`);

  console.log(`[scrape-myneta] Fetching index page…`);
  const indexHtml = await fetchText(`${BASE}/`);
  const index = parseConstituencyIndex(indexHtml);
  console.log(`[scrape-myneta] Index has ${Object.keys(index).length} entries.`);

  const out = {};
  let scraped = 0,
    skipped = 0,
    totalCandidates = 0;

  for (const t of targets.slice(0, LIMIT)) {
    const norm = normalize(t.ac_name);
    const aliased = NAME_ALIASES[norm] || norm;
    const entry = index[aliased] || index[norm];
    if (!entry) {
      console.warn(
        `[scrape-myneta] AC ${t.ac_no} "${t.ac_name}" -> no MyNeta match (normalized "${norm}")`,
      );
      skipped++;
      continue;
    }

    const url = `${BASE}/index.php?action=show_candidates&constituency_id=${entry.id}`;
    process.stdout.write(
      `[scrape-myneta] AC ${t.ac_no} "${t.ac_name}" -> ${entry.raw} (id ${entry.id}) … `,
    );
    let candidates;
    try {
      const html = await fetchText(url);
      candidates = parseCandidates(html);
    } catch (e) {
      console.log(`FAIL (${e.message})`);
      skipped++;
      continue;
    }
    const winner = candidates.find((c) => c.is_seat_winner) || null;
    out[String(t.ac_no)] = { candidates, winner };
    scraped++;
    totalCandidates += candidates.length;
    console.log(`${candidates.length} candidates${winner ? ` (winner: ${winner.name})` : ""}`);

    if (DELAY_MS > 0) await sleep(DELAY_MS);
  }

  // Safety check: refuse to overwrite the output file if the scrape clearly
  // failed (covered very few ACs). The seed script does delete+insert per AC,
  // so an empty/partial output isn't destructive, but it's still worth
  // alerting on.
  const minOk = Math.max(1, Math.floor(targets.length * 0.5));
  if (scraped < minOk && Number.isFinite(LIMIT) === false) {
    console.error(
      `[scrape-myneta] ABORT: only ${scraped}/${targets.length} ACs scraped (< 50% threshold). Refusing to write ${OUTPUT}.`,
    );
    process.exit(2);
  }

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, JSON.stringify(out, null, 2) + "\n");
  console.log(
    `[scrape-myneta] Wrote ${OUTPUT}: ${scraped} ACs, ${totalCandidates} candidates (${skipped} skipped).`,
  );
}

main().catch((e) => {
  console.error("[scrape-myneta] FAILED:", e);
  process.exit(1);
});
