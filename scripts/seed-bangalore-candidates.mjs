// Load Bangalore candidate data (from MyNeta/ADR) into the DB.
// Source file: data/bangalore_candidates.json (parsed affidavit summaries).
//
// Notes:
// - AC 161 (C.V. Raman Nagar) is SKIPPED to preserve its curated data
//   (which includes vote counts and AI source text).
// - Vote counts are NOT available from MyNeta (ECI's 2023 archive is offline),
//   so votes / vote_share are left null for these constituencies.
//
// Run:  npm run db:seed:candidates   (needs DATABASE_URL in .env.local)
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set (add it to .env.local).");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const data = JSON.parse(readFileSync("data/bangalore_candidates.json", "utf-8"));

const SKIP_AC = new Set([161]); // curated separately

// Known winners missing from MyNeta's analyzed list (manual, sourced).
const WINNER_OVERRIDES = {
  160: { name: "K. J. George", party: "Indian National Congress", party_short: "INC" },
};

async function main() {
  let acCount = 0;
  let candCount = 0;
  let wpCount = 0;

  for (const acStr of Object.keys(data)) {
    const ac = Number(acStr);
    if (SKIP_AC.has(ac)) continue;

    const entry = data[acStr];
    const candidates = [...entry.candidates];
    let winner = entry.winner;

    // Patch a known-missing winner if needed.
    const ov = WINNER_OVERRIDES[ac];
    if (!winner && ov) {
      const wc = {
        name: ov.name,
        party: ov.party,
        party_short: ov.party_short,
        is_seat_winner: true,
        criminal_cases_count: 0,
        education: "",
        age: null,
        assets_total_inr: null,
        liabilities_inr: null,
        affidavit_url: "",
      };
      candidates.push(wc);
      winner = wc;
    }

    // Replace this constituency's candidates (idempotent).
    await sql`delete from candidate where ac_no = ${ac}`;
    for (const c of candidates) {
      await sql`
        insert into candidate (ac_no, name, party, party_short, is_seat_winner,
          is_incumbent, result, votes, vote_share_pct, age, education, profession,
          assets_total_inr, liabilities_inr, criminal_cases_count, criminal_cases_note,
          affidavit_url, manifesto_url, prs_url, photo_url, ai_summary)
        values (${ac}, ${c.name}, ${c.party}, ${c.party_short}, ${c.is_seat_winner},
          false, ${c.is_seat_winner ? "won" : "lost"}, null, null, ${c.age},
          ${c.education}, '', ${c.assets_total_inr}, ${c.liabilities_inr},
          ${c.criminal_cases_count}, '', ${c.affidavit_url}, '', '', '', '')
        on conflict (ac_no, name) do nothing`;
      candCount++;
    }

    // Winning party.
    if (winner) {
      await sql`
        insert into winning_party (ac_no, party, party_short, winning_candidate)
        values (${ac}, ${winner.party}, ${winner.party_short}, ${winner.name})
        on conflict (ac_no) do update set
          party = excluded.party,
          party_short = excluded.party_short,
          winning_candidate = excluded.winning_candidate`;
      wpCount++;
    }
    acCount++;
  }

  const [{ n }] = await sql`select count(*)::int n from candidate`;
  const [{ w }] = await sql`select count(*)::int w from winning_party`;
  console.log(
    `Loaded ${acCount} constituencies, ${candCount} candidates. ` +
      `DB totals: candidates=${n}, winning_party=${w}.`,
  );
}

main().catch((e) => {
  console.error("Candidate seed failed:", e);
  process.exit(1);
});
