import "server-only";
import { sql, dbConfigured } from "./db";
import {
  AI_RATELIMIT_PER_IP_MAX,
  AI_RATELIMIT_PER_IP_WINDOW_MS,
  AI_RATELIMIT_GLOBAL_DAILY_MAX,
  AI_RATELIMIT_GLOBAL_WINDOW_MS,
} from "./config";

export interface RateCheck {
  allowed: boolean;
  reason?: "per-ip" | "global-daily";
  retryAfterSec?: number;
}

/** Best-effort client identifier from proxy headers (Vercel sets these). */
export function clientId(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

function windowStartISO(windowMs: number): string {
  return new Date(Math.floor(Date.now() / windowMs) * windowMs).toISOString();
}

/** Atomically increment a fixed-window counter and report if within limit. */
async function bump(bucket: string, windowMs: number, limit: number): Promise<boolean> {
  if (!dbConfigured() || !sql) return true; // no DB → don't block
  const ws = windowStartISO(windowMs);
  const rows = (await sql`
    insert into rate_limit (bucket, window_start, count)
    values (${bucket}, ${ws}, 1)
    on conflict (bucket, window_start) do update set count = rate_limit.count + 1
    returning count
  `) as { count: number }[];
  return Number(rows[0]?.count ?? 0) <= limit;
}

/**
 * Enforce per-IP and global daily limits on AI generations. Called only when a
 * real generation (cache miss / forced regenerate) is about to happen.
 */
export async function checkAiRateLimit(identifier: string): Promise<RateCheck> {
  const ipOk = await bump(
    `ai:ip:${identifier}`,
    AI_RATELIMIT_PER_IP_WINDOW_MS,
    AI_RATELIMIT_PER_IP_MAX,
  );
  if (!ipOk) {
    return { allowed: false, reason: "per-ip", retryAfterSec: Math.ceil(AI_RATELIMIT_PER_IP_WINDOW_MS / 1000) };
  }
  const globalOk = await bump(
    "ai:global",
    AI_RATELIMIT_GLOBAL_WINDOW_MS,
    AI_RATELIMIT_GLOBAL_DAILY_MAX,
  );
  if (!globalOk) {
    return { allowed: false, reason: "global-daily", retryAfterSec: 3600 };
  }
  return { allowed: true };
}
