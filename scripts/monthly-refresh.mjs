// Monthly refresh entrypoint for the GitHub Actions cron job.
//
// Order of operations (each step exits non-zero on failure, which fails the
// whole job):
//   1. scrape-myneta.mjs        -> data/bangalore_candidates.json
//   2. migrate-insights.mjs     -> ensure ai_insight + rate_limit tables
//   3. seed-constituencies.mjs  -> upsert boundary rows (idempotent)
//   4. seed-bangalore-candidates.mjs -> replace candidates per AC
//   5. backfill-votes.mjs (only if data/bangalore_votes.json exists)
//
// Why this order:
// - The scrape runs first so we fail fast if MyNeta is unreachable, without
//   touching the DB.
// - migrate-insights is idempotent and cheap; it's here so a fresh DB still
//   has the cache tables.
// - seed-constituencies only updates boundaries (preserves curated AC 161).
// - seed-bangalore-candidates does delete+insert per AC, so it's idempotent
//   and reflects the freshly scraped data.
// - votes backfill is opt-in: the votes JSON isn't scraped (results are
//   final for 2023), so we only run it if a local file is present.
//
// DATABASE_URL must be set in the environment.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

function run(cmd, args, { allowEmptyExit = false } = {}) {
  return new Promise((resolve, reject) => {
    console.log(`\n=== ${cmd} ${args.join(" ")} ===`);
    const child = spawn(cmd, args, {
      stdio: "inherit",
      env: process.env,
    });
    child.on("exit", (code) => {
      if (code === 0 || (allowEmptyExit && code === null)) resolve();
      else reject(new Error(`${args.join(" ")} exited with code ${code}`));
    });
    child.on("error", reject);
  });
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const node = process.execPath;
  const t0 = Date.now();

  // 1. Scrape MyNeta -> data/bangalore_candidates.json.
  await run(node, ["scripts/scrape-myneta.mjs"]);

  // 2. Ensure AI cache tables exist (no-op if already created).
  await run(node, ["scripts/migrate-insights.mjs"]);

  // 3. Upsert constituency boundaries.
  await run(node, ["scripts/seed-constituencies.mjs"]);

  // 4. Replace candidate rows with freshly-scraped data.
  await run(node, ["scripts/seed-bangalore-candidates.mjs"]);

  // 5. Optional votes backfill.
  if (existsSync("data/bangalore_votes.json")) {
    await run(node, ["scripts/backfill-votes.mjs"]);
  } else {
    console.log("\n=== skipping backfill-votes (data/bangalore_votes.json not present) ===");
  }

  const secs = Math.round((Date.now() - t0) / 1000);
  console.log(`\nmonthly-refresh OK (${secs}s).`);
}

main().catch((e) => {
  console.error("monthly-refresh FAILED:", e.message);
  process.exit(1);
});
