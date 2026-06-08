import "server-only";
import { sql, dbConfigured } from "./db";
import { AI_INSIGHT_TTL_MS } from "./config";
import { checkAiRateLimit } from "./ratelimit";

export interface InsightResult<T> {
  payload: T | null;
  cached: boolean;
  generatedAt: string;
  rateLimited?: boolean; // served a stale cached copy because the limit was hit
  blocked?: boolean; // no cache available and the limit was hit
  retryAfterSec?: number;
}

/**
 * Return a cached AI insight if one exists and is younger than the TTL;
 * otherwise run `generate`, store the result, and return it.
 *
 * Generation is rate-limited per visitor (`identifier`) and globally. If the
 * limit is hit, a stale cached copy is served when available, else the result
 * is `blocked` (the route should respond 429).
 */
export async function getOrGenerateInsight<T>(
  kind: "summary" | "overview" | "research",
  acNo: number,
  ref: string,
  force: boolean,
  identifier: string,
  generate: () => Promise<{ payload: T; source: string }>,
): Promise<InsightResult<T>> {
  let existing: { payload: T; generated_at: string; age_ms: string } | null = null;
  if (dbConfigured() && sql) {
    const rows = (await sql`
      select payload, generated_at,
             extract(epoch from (now() - generated_at)) * 1000 as age_ms
      from ai_insight
      where kind = ${kind} and ac_no = ${acNo} and ref = ${ref}
      limit 1
    `) as { payload: T; generated_at: string; age_ms: string }[];
    if (rows.length) existing = rows[0];
  }

  if (!force && existing && Number(existing.age_ms) < AI_INSIGHT_TTL_MS) {
    return { payload: existing.payload, cached: true, generatedAt: String(existing.generated_at) };
  }

  // A real generation is about to happen — enforce the rate limit.
  const rl = await checkAiRateLimit(identifier);
  if (!rl.allowed) {
    if (existing) {
      return {
        payload: existing.payload,
        cached: true,
        generatedAt: String(existing.generated_at),
        rateLimited: true,
        retryAfterSec: rl.retryAfterSec,
      };
    }
    return { payload: null, cached: false, generatedAt: "", blocked: true, retryAfterSec: rl.retryAfterSec };
  }

  const { payload, source } = await generate();
  if (dbConfigured() && sql) {
    await sql`
      insert into ai_insight (kind, ac_no, ref, payload, source, generated_at)
      values (${kind}, ${acNo}, ${ref}, ${JSON.stringify(payload)}::jsonb, ${source}, now())
      on conflict (kind, ac_no, ref) do update set
        payload = excluded.payload, source = excluded.source, generated_at = now()
    `;
  }
  return { payload, cached: false, generatedAt: new Date().toISOString() };
}
