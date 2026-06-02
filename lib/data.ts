import "server-only";
import fs from "node:fs";
import path from "node:path";
import { sql, dbConfigured } from "./db";
import type {
  CandidatesFile,
  ConstituencyMeta,
  Candidate,
  WinningParty,
  LocationMeta,
  MlaNews,
} from "./types";

const ROOT = process.cwd();
const AC_NO = 161;

function readJson<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf-8")) as T;
}
function readText(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf-8");
}

// --- coercion helpers (Neon returns numeric/bigint/date as strings) ---
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}
function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

function rowToCandidate(r: Record<string, unknown>): Candidate {
  return {
    name: str(r.name),
    party: str(r.party),
    party_short: str(r.party_short),
    is_seat_winner: Boolean(r.is_seat_winner),
    is_incumbent: Boolean(r.is_incumbent),
    result: (str(r.result) as "won" | "lost") || "lost",
    votes: num(r.votes) ?? 0,
    vote_share_pct: num(r.vote_share_pct) ?? 0,
    age: num(r.age),
    education: str(r.education),
    profession: str(r.profession),
    assets_total_inr: num(r.assets_total_inr),
    liabilities_inr: num(r.liabilities_inr),
    criminal_cases_count: num(r.criminal_cases_count) ?? 0,
    criminal_cases_note: str(r.criminal_cases_note),
    affidavit_url: str(r.affidavit_url),
    manifesto_url: str(r.manifesto_url),
    prs_url: str(r.prs_url),
    photo_url: str(r.photo_url),
    ai_summary: str(r.ai_summary),
  };
}

export async function getCandidatesFile(): Promise<CandidatesFile> {
  if (dbConfigured() && sql) {
    const [c] = (await sql`select * from constituency where ac_no = ${AC_NO}`) as Record<
      string,
      unknown
    >[];
    const rows = (await sql`
      select * from candidate where ac_no = ${AC_NO} order by votes desc
    `) as Record<string, unknown>[];
    const constituency: ConstituencyMeta = {
      ac_no: num(c.ac_no) ?? AC_NO,
      ac_name: str(c.ac_name),
      pc_name: str(c.pc_name),
      district: str(c.district),
      state: str(c.state),
      election: str(c.election),
      poll_date: str(c.poll_date),
      result_date: str(c.result_date),
      total_electors: num(c.total_electors) ?? 0,
      total_valid_votes: num(c.total_valid_votes) ?? 0,
      turnout_pct: num(c.turnout_pct) ?? 0,
      reservation: str(c.reservation),
    };
    return { constituency, sources: {}, candidates: rows.map(rowToCandidate) };
  }
  return readJson<CandidatesFile>("data/candidates.json");
}

export async function getWinningParty(): Promise<WinningParty> {
  if (dbConfigured() && sql) {
    const [w] = (await sql`select * from winning_party where ac_no = ${AC_NO}`) as Record<
      string,
      unknown
    >[];
    return {
      party: str(w.party),
      party_short: str(w.party_short),
      winning_candidate: str(w.winning_candidate),
      constituency: "C.V. Raman Nagar (SC), AC 161",
      term: str(w.term),
      tenure_note: str(w.tenure_note),
      state_government_party: str(w.state_government_party),
      manifesto_2023_url: str(w.manifesto_2023_url),
      manifesto_2023_title: str(w.manifesto_2023_title),
      manifesto_text_file: "",
      affidavit_text_file: "",
      news_file: "",
    };
  }
  return readJson<WinningParty>("data/winning_party.json");
}

export async function getConstituencyGeoJson(): Promise<unknown> {
  if (dbConfigured() && sql) {
    const [row] = (await sql`
      select ac_no, ac_name, pc_name, district, state,
             ST_AsGeoJSON(boundary)::text as geom
      from constituency where ac_no = ${AC_NO}
    `) as Record<string, unknown>[];
    if (row?.geom) {
      return {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {
              ac_no: num(row.ac_no),
              ac_name: str(row.ac_name),
              pc_name: str(row.pc_name),
              district: str(row.district),
              state: str(row.state),
            },
              geometry: JSON.parse(row.geom as string),
          },
        ],
      };
    }
  }
  return readJson<unknown>("data/constituency.geojson");
}

export async function getMlaNews(): Promise<MlaNews> {
  if (dbConfigured() && sql) {
    const rows = (await sql`
      select * from source_doc where ac_no = ${AC_NO} and kind = 'news'
      order by id
    `) as Record<string, unknown>[];
    if (rows.length) {
      return {
        subject: "",
        purpose: "",
        collected_on: "",
        articles: rows.map((r) => ({
          title: str(r.title),
          publisher: str(r.publisher),
          date: str(r.doc_date),
          url: str(r.url),
          category: str(r.category),
          summary: str(r.body),
          verification: str(r.verification),
        })),
        gaps_to_fill_by_agent: [],
      };
    }
  }
  return readJson<MlaNews>("sources/winner_mla_news.json");
}

async function getSourceBody(kind: string, fallbackFile: string): Promise<string> {
  if (dbConfigured() && sql) {
    const rows = (await sql`
      select body from source_doc where ac_no = ${AC_NO} and kind = ${kind}
      order by id limit 1
    `) as Record<string, unknown>[];
    if (rows.length) return str(rows[0].body);
  }
  return readText(fallbackFile);
}

export function getAffidavitText(): Promise<string> {
  return getSourceBody("affidavit", "sources/winner_affidavit.txt");
}

export function getManifestoText(): Promise<string> {
  return getSourceBody("manifesto", "sources/winner_party_manifesto_2023.txt");
}

// Location metadata is app config (house coords), not gathered electoral
// data, so it stays file-based.
export function getLocationMeta(): LocationMeta {
  return readJson<LocationMeta>("data/location_meta.json");
}
