import "server-only";
import { sql, dbConfigured } from "./db";
import { AI_INSIGHT_TTL_MS } from "./config";

export interface InsightResult<T> {
  payload: T;
  cached: boolean;
  generatedAt: string;
}

/**
 * Return a cached AI insight if one exists and is younger than the TTL
 * (lib/config.ts); otherwise run `generate`, store the result, and return it.
 * Pass `force` to bypass the cache and regenerate on demand.
 */
export async function getOrGenerateInsight<T>(
  kind: "summary" | "overview" | "research",
  acNo: number,
  ref: string,
  force: boolean,
  generate: () => Promise<{ payload: T; source: string }>,
): Promise<InsightResult<T>> {
  if (!force && dbConfigured() && sql) {
    const rows = (await sql`
      select payload, generated_at,
             extract(epoch from (now() - generated_at)) * 1000 as age_ms
      from ai_insight
      where kind = ${kind} and ac_no = ${acNo} and ref = ${ref}
      limit 1
    `) as { payload: T; generated_at: string; age_ms: string }[];
    if (rows.length && Number(rows[0].age_ms) < AI_INSIGHT_TTL_MS) {
      return {
        payload: rows[0].payload,
        cached: true,
        generatedAt: String(rows[0].generated_at),
      };
    }
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
