// Load Bangalore Assembly constituency boundaries into the DB.
// Upserts by ac_no: inserts new constituencies (boundary + names) and, for
// existing rows (e.g. AC 161 with curated election data), updates ONLY the
// boundary so curated fields are preserved.
//
// Run:  npm run db:seed:constituencies   (needs DATABASE_URL in .env.local)
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set (add it to .env.local).");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const fc = JSON.parse(readFileSync("data/bangalore_constituencies.geojson", "utf-8"));

async function main() {
  console.log("Ensuring PostGIS + MultiPolygon boundary column…");
  await sql.query("create extension if not exists postgis");
  await sql.query(
    "alter table constituency alter column boundary type geometry(MultiPolygon, 4326) using ST_Multi(boundary)",
  );

  let inserted = 0;
  for (const f of fc.features) {
    const p = f.properties;
    const geom = JSON.stringify(f.geometry);
    await sql`
      insert into constituency (ac_no, ac_name, pc_name, district, state, boundary)
      values (${p.ac_no}, ${p.ac_name}, ${p.pc_name}, ${p.district}, ${p.state},
        ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${geom}), 4326)))
      on conflict (ac_no) do update set boundary = excluded.boundary`;
    inserted++;
  }

  const [{ n }] = await sql`select count(*)::int as n from constituency`;
  const [{ w }] =
    await sql`select count(*)::int as w from constituency where boundary is not null`;
  console.log(`Upserted ${inserted} constituencies. Total rows=${n}, with boundary=${w}.`);
}

main().catch((e) => {
  console.error("Constituency seed failed:", e);
  process.exit(1);
});
