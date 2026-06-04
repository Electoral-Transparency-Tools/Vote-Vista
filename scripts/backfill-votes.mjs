// Backfill votes/vote_share onto existing candidate rows from Wikipedia's
// 2023 result tables (data/bangalore_votes.json). Matches Wikipedia candidate
// names to DB names via token-set (Jaccard) similarity, since the name order
// and spelling differ between sources. AC 161 keeps its curated votes.
//
// Run:  npm run db:backfill:votes   (needs DATABASE_URL in .env.local)
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set (add it to .env.local).");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const votes = JSON.parse(readFileSync("data/bangalore_votes.json", "utf-8"));

// strip Wikipedia disambiguation "(...)", aliases "@ ...", honorifics
const cleanName = (s) =>
  s.replace(/\(.*?\)/g, " ").replace(/@.*$/, " ").trim();
const collapse = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const tokens = (s) =>
  new Set(cleanName(s).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean));
function score(a, b) {
  const A = tokens(a), B = tokens(b);
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const jac = inter / (A.size + B.size - inter || 1);
  const ca = collapse(cleanName(a)), cb = collapse(cleanName(b));
  const collapsed = ca && cb && (ca === cb || ca.includes(cb) || cb.includes(ca));
  return collapsed ? Math.max(jac, 0.9) : jac;
}
const isNota = (n) => /none of the above/i.test(n);

async function main() {
  let updated = 0, unmatched = 0;
  for (const acStr of Object.keys(votes)) {
    const ac = Number(acStr);
    const dbCands = await sql`select id, name, is_seat_winner from candidate where ac_no = ${ac}`;
    const wiki = votes[acStr].filter((w) => !isNota(w.name)).sort((a, b) => b.votes - a.votes);
    const used = new Set();

    async function apply(dc, wc) {
      await sql`update candidate set votes = ${wc.votes}, vote_share_pct = ${wc.vote_share} where id = ${dc.id}`;
      used.add(dc.id);
      updated++;
    }

    // 1) Map the top wiki vote-getter to the DB seat winner directly.
    const dbWinner = dbCands.find((d) => d.is_seat_winner);
    const consumed = new Set();
    if (dbWinner && wiki.length) {
      await apply(dbWinner, wiki[0]);
      consumed.add(0);
    }

    // 2) Match remaining wiki candidates by name similarity.
    for (let i = 0; i < wiki.length; i++) {
      if (consumed.has(i)) continue;
      const wc = wiki[i];
      let best = null, bestScore = 0;
      for (const dc of dbCands) {
        if (used.has(dc.id)) continue;
        const s = score(wc.name, dc.name);
        if (s > bestScore) { bestScore = s; best = dc; }
      }
      if (best && bestScore >= 0.5) {
        await apply(best, wc);
      } else {
        unmatched++;
        console.log(`  no match: ac ${ac} "${wc.name}" (best ${bestScore.toFixed(2)})`);
      }
    }
  }
  const [{ n }] =
    await sql`select count(*)::int n from candidate where votes is not null`;
  console.log(`\nUpdated ${updated} rows, ${unmatched} unmatched. Candidates with votes now: ${n}.`);
}

main().catch((e) => {
  console.error("Vote backfill failed:", e);
  process.exit(1);
});
