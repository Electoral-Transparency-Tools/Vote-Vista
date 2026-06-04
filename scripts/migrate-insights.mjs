// Create the ai_insight cache table. Run: npm run db:migrate:insights
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set (add it to .env.local).");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

await sql.query(`
  create table if not exists ai_insight (
    id            bigserial primary key,
    kind          text not null,
    ac_no         int not null,
    ref           text not null default '',
    payload       jsonb not null,
    source        text,
    generated_at  timestamptz not null default now(),
    unique (kind, ac_no, ref)
  )
`);
const [{ n }] = await sql`select count(*)::int n from ai_insight`;
console.log("ai_insight table ready, rows:", n);
