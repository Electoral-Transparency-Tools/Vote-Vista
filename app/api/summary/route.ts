import { NextResponse } from "next/server";
import { getConstituencyDetail, getAffidavitText } from "@/lib/data";
import { generateText } from "@/lib/ai";
import { getOrGenerateInsight } from "@/lib/insights";
import { webSearch, normalizeUrl, type SearchResult } from "@/lib/search";
import { formatINR } from "@/lib/format";
import type { Candidate } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

function nameTerms(name: string): string[] {
  return name
    .split(/\s+/)
    .map((t) => t.replace(/[.]/g, ""))
    .filter((t) => t.length > 2)
    .map((t) => t.toLowerCase());
}

function fallbackSummary(c: Candidate, constituency: string): string {
  const role =
    c.result === "won" ? `the winning candidate (now MLA)` : `a candidate`;
  const crime =
    c.criminal_cases_count > 0
      ? ` Their 2023 affidavit declared ${c.criminal_cases_count} criminal case(s).`
      : " Their 2023 affidavit declared no criminal cases.";
  return (
    `${c.name} was ${role} for the ${c.party} (${c.party_short}) in ${constituency} (2023). ` +
    `Declared assets ${formatINR(c.assets_total_inr)}, liabilities ${formatINR(c.liabilities_inr)}; education "${c.education || "n/a"}".` +
    crime +
    " Live web research was unavailable, so prior-role work history could not be compiled."
  );
}

export async function POST(req: Request) {
  const { name, ac = 161, force = false } = await req
    .json()
    .catch(() => ({ name: "", ac: 161, force: false }));
  const acNo = Number(ac);
  const detail = await getConstituencyDetail(acNo);
  const candidate = detail?.candidates.find((c) => c.name === name);
  if (!detail || !candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }
  const constituency = detail.constituency.ac_name;

  const result = await getOrGenerateInsight("summary", acNo, name, Boolean(force), async () => {
    // 1. Live web research about the candidate.
    let live: SearchResult[] = [];
    let provider = "";
    try {
      const search = await webSearch(
        [
          `"${name}" ${candidate.party} politician ${constituency} Bengaluru Karnataka background work record`,
          `"${name}" ${candidate.party} ${constituency} Bengaluru corruption OR scam OR crime OR case OR allegation OR controversy`,
        ],
        { topic: "general", searchDepth: "advanced", maxResultsPerQuery: 8, minScore: 0.4 },
      );
      if (search) {
        provider = search.provider;
        const terms = nameTerms(name);
        live = search.results
          .filter((r) => {
            const hay = `${r.title} ${r.content}`.toLowerCase();
            // require at least the surname (longest token) to appear
            return terms.some((t) => t.length >= 4 && hay.includes(t));
          })
          .slice(0, 6);
      }
    } catch {
      /* ignore search errors */
    }

    const sourceMap = new Map<string, { title: string; url: string }>();
    for (const r of live) if (r.url) sourceMap.set(normalizeUrl(r.url), { title: r.title, url: r.url });
    const sources = [...sourceMap.values()];

    const liveBlock = live.length
      ? `\n\nWEB_SEARCH_RESULTS (${provider}):\n${live.map((r) => `- ${r.title} (${r.url})\n  ${r.content}`).join("\n")}`
      : "";
    const affidavit = acNo === 161 && candidate.is_seat_winner ? await getAffidavitText() : "";
    const facts = {
      name: candidate.name,
      party: candidate.party,
      constituency,
      result: candidate.result,
      education: candidate.education,
      profession: candidate.profession,
      assets: formatINR(candidate.assets_total_inr),
      liabilities: formatINR(candidate.liabilities_inr),
      criminal_cases_count: candidate.criminal_cases_count,
      criminal_cases_note: candidate.criminal_cases_note,
    };

    try {
      const llm = await generateText(
        "You are a neutral, factual civic-research analyst. Using ONLY the provided candidate data and web search results, write a concise profile (4-6 sentences) that covers: (1) who the candidate is and the work they have done in previous political/professional roles, and (2) any corruption, criminal cases, or controversy associated with them. Report unproven matters explicitly as allegations. Prefer the web search results for work history; use the affidavit data for declared assets/criminal cases. If web evidence is thin, state what is known and avoid speculation. Never fabricate.",
        `CANDIDATE DATA (JSON):\n${JSON.stringify(facts, null, 2)}\n${affidavit ? `\nAFFIDAVIT:\n${affidavit}\n` : ""}${liveBlock}\n\nWrite the research profile.`,
      );
      if (llm) {
        const src = live.length ? `${llm.provider} + web search (${provider})` : llm.provider;
        return { payload: { summary: llm.text, source: src, sources }, source: src };
      }
    } catch (err) {
      const src = `fallback (LLM error: ${String(err)})`;
      return { payload: { summary: fallbackSummary(candidate, constituency), source: src, sources }, source: src };
    }
    const src = "fallback (no API key configured)";
    return { payload: { summary: fallbackSummary(candidate, constituency), source: src, sources }, source: src };
  });

  return NextResponse.json({
    ...result.payload,
    cached: result.cached,
    generatedAt: result.generatedAt,
  });
}
