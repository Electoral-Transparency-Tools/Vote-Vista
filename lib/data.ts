import "server-only";
import fs from "node:fs";
import path from "node:path";
import type {
  CandidatesFile,
  WinningParty,
  LocationMeta,
  MlaNews,
} from "./types";

const ROOT = process.cwd();

function readJson<T>(rel: string): T {
  const full = path.join(ROOT, rel);
  return JSON.parse(fs.readFileSync(full, "utf-8")) as T;
}

function readText(rel: string): string {
  const full = path.join(ROOT, rel);
  return fs.readFileSync(full, "utf-8");
}

export function getCandidatesFile(): CandidatesFile {
  return readJson<CandidatesFile>("data/candidates.json");
}

export function getWinningParty(): WinningParty {
  return readJson<WinningParty>("data/winning_party.json");
}

export function getLocationMeta(): LocationMeta {
  return readJson<LocationMeta>("data/location_meta.json");
}

export function getConstituencyGeoJson(): unknown {
  return readJson<unknown>("data/constituency.geojson");
}

export function getMlaNews(): MlaNews {
  return readJson<MlaNews>("sources/winner_mla_news.json");
}

export function getAffidavitText(): string {
  return readText("sources/winner_affidavit.txt");
}

export function getManifestoText(): string {
  return readText("sources/winner_party_manifesto_2023.txt");
}
