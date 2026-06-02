import "server-only";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

/**
 * Neon serverless SQL client. `null` when DATABASE_URL is not configured,
 * so the data layer can fall back to the bundled JSON/text files and keep
 * the app runnable without a database.
 */
export const sql: NeonQueryFunction<false, false> | null = process.env
  .DATABASE_URL
  ? neon(process.env.DATABASE_URL)
  : null;

export function dbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}
