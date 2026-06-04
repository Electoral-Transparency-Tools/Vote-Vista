// Seed the Neon database from the gathered JSON/text files.
// Applies db/schema.sql first, then loads data, so it is a one-shot setup.
//
// Run:  npm run db:seed   (needs DATABASE_URL in .env.local)
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set (add it to .env.local).");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const readJson = (p) => JSON.parse(readFileSync(p, "utf-8"));

const cand = readJson("data/candidates.json");
const geo = readJson("data/constituency.geojson");
const wp = readJson("data/winning_party.json");
const mlaNews = readJson("sources/winner_mla_news.json");
const affidavit = readFileSync("sources/winner_affidavit.txt", "utf-8");
const manifesto = readFileSync("sources/winner_party_manifesto_2023.txt", "utf-8");

const c = cand.constituency;
const winner = cand.candidates.find((k) => k.is_seat_winner) ?? {};
const geometry = JSON.stringify(geo.features[0].geometry);

async function main() {
  // 1. Schema (split db/schema.sql into statements; strip line comments).
  console.log("Applying schema…");
  const ddl = readFileSync("db/schema.sql", "utf-8")
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const stmt of ddl) await sql.query(stmt);

  // 2. Clear existing rows (children first for FK safety).
  console.log("Clearing existing rows…");
  await sql`delete from source_doc`;
  await sql`delete from candidate`;
  await sql`delete from winning_party`;
  await sql`delete from constituency`;

  // 3. Constituency (boundary from the geojson, metadata from candidates.json).
  console.log("Inserting constituency…");
  await sql`
    insert into constituency (ac_no, ac_name, pc_name, district, state, election,
      poll_date, result_date, total_electors, total_valid_votes, turnout_pct,
      reservation, boundary)
    values (${c.ac_no}, ${c.ac_name}, ${c.pc_name}, ${c.district}, ${c.state},
      ${c.election}, ${c.poll_date}, ${c.result_date}, ${c.total_electors},
      ${c.total_valid_votes}, ${c.turnout_pct}, ${c.reservation},
      ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${geometry}), 4326)))`;

  // 4. Candidates.
  console.log(`Inserting ${cand.candidates.length} candidates…`);
  for (const k of cand.candidates) {
    await sql`
      insert into candidate (ac_no, name, party, party_short, is_seat_winner,
        is_incumbent, result, votes, vote_share_pct, age, education, profession,
        assets_total_inr, liabilities_inr, criminal_cases_count, criminal_cases_note,
        affidavit_url, manifesto_url, prs_url, photo_url, ai_summary)
      values (${c.ac_no}, ${k.name}, ${k.party}, ${k.party_short}, ${k.is_seat_winner},
        ${k.is_incumbent}, ${k.result}, ${k.votes}, ${k.vote_share_pct}, ${k.age},
        ${k.education}, ${k.profession}, ${k.assets_total_inr}, ${k.liabilities_inr},
        ${k.criminal_cases_count}, ${k.criminal_cases_note}, ${k.affidavit_url},
        ${k.manifesto_url}, ${k.prs_url}, ${k.photo_url}, ${k.ai_summary})`;
  }

  // 5. Winning party.
  console.log("Inserting winning party…");
  await sql`
    insert into winning_party (ac_no, party, party_short, winning_candidate, term,
      tenure_note, state_government_party, manifesto_2023_url, manifesto_2023_title)
    values (${c.ac_no}, ${wp.party}, ${wp.party_short}, ${wp.winning_candidate},
      ${wp.term}, ${wp.tenure_note}, ${wp.state_government_party},
      ${wp.manifesto_2023_url}, ${wp.manifesto_2023_title})`;

  // 6. Source docs (affidavit, manifesto, news).
  console.log("Inserting source docs…");
  await sql`
    insert into source_doc (ac_no, kind, title, url, body)
    values (${c.ac_no}, 'affidavit', 'Winner affidavit (MyNeta)',
      ${winner.affidavit_url ?? ""}, ${affidavit})`;
  await sql`
    insert into source_doc (ac_no, kind, title, url, body)
    values (${c.ac_no}, 'manifesto', ${wp.manifesto_2023_title},
      ${wp.manifesto_2023_url}, ${manifesto})`;
  for (const a of mlaNews.articles) {
    await sql`
      insert into source_doc (ac_no, kind, title, publisher, doc_date, url, category,
        verification, body)
      values (${c.ac_no}, 'news', ${a.title}, ${a.publisher}, ${a.date}, ${a.url},
        ${a.category}, ${a.verification}, ${a.summary})`;
  }

  const [{ n: cc }] = await sql`select count(*)::int as n from candidate`;
  const [{ n: sc }] = await sql`select count(*)::int as n from source_doc`;
  console.log(`Done. candidates=${cc}, source_docs=${sc}.`);
}

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
