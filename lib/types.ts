export interface ConstituencyMeta {
  ac_no: number;
  ac_name: string;
  pc_name: string;
  district: string;
  state: string;
  election: string;
  poll_date: string;
  result_date: string;
  total_electors: number;
  total_valid_votes: number;
  turnout_pct: number;
  reservation: string;
}

export interface Candidate {
  name: string;
  party: string;
  party_short: string;
  is_seat_winner: boolean;
  is_incumbent: boolean;
  result: "won" | "lost";
  votes: number;
  vote_share_pct: number;
  age: number | null;
  education: string;
  profession: string;
  assets_total_inr: number | null;
  liabilities_inr: number | null;
  criminal_cases_count: number;
  criminal_cases_note: string;
  affidavit_url: string;
  manifesto_url: string;
  prs_url: string;
  photo_url: string;
  ai_summary: string;
}

export interface CandidatesFile {
  constituency: ConstituencyMeta;
  sources: Record<string, string>;
  candidates: Candidate[];
}

export interface WinningParty {
  party: string;
  party_short: string;
  winning_candidate: string;
  constituency: string;
  term: string;
  tenure_note: string;
  state_government_party: string;
  manifesto_2023_url: string;
  manifesto_2023_title: string;
  manifesto_text_file: string;
  affidavit_text_file: string;
  news_file: string;
}

export interface LocationMeta {
  poc_location: { label: string; google_maps: string; lat: number; lon: number };
  boundary_check: Record<string, unknown>;
}

export interface NewsArticle {
  title: string;
  publisher: string;
  date: string;
  url: string;
  category: string;
  summary: string;
  verification: string;
}

export interface MlaNews {
  subject: string;
  purpose: string;
  collected_on: string;
  articles: NewsArticle[];
  gaps_to_fill_by_agent: string[];
}

export interface ResearchReport {
  generatedBy: string;
  workSummary: string;
  integrityScan: string;
  promiseVsResult: string;
  sources: { title: string; url: string }[];
}
