import { NextResponse } from "next/server";
import {
  getConstituencyDetail,
  getMlaNews,
  getManifestoText,
  getAffidavitText,
} from "@/lib/data";
import { generateText } from "@/lib/ai";
import { webSearch, normalizeUrl, type SearchResult } from "@/lib/search";
import type { ResearchReport, MlaNews } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const CURATED_AC = 161; // only this seat has curated affidavit/news/manifesto

function relevanceTerms(mla: string, constituency: string): string[] {
  const nameTokens = mla
    .split(/\s+/)
    .map((t) => t.replace(/\.$/, ""))
    .filter((t) => t.length > 2)
    .map((t) => t.toLowerCase());
  const lowerConst = constituency.toLowerCase();
  const constToken = lowerConst.includes("raman nagar") ? "raman nagar" : lowerConst;
  return [...new Set([...nameTokens, constToken])];
}

function fallbackReport(
  mla: string,
  partyShort: string,
  constituency: string,
  news: MlaNews,
  winnerCriminalCases: number,
): ResearchReport {
  const work = news.articles.filter((a) =>
    ["profile/positive", "profile/record"].includes(a.category),
  );
  const issues = news.articles.filter(
    (a) => a.category.includes("controversy") || a.category.includes("corruption"),
  );
  const workSummary =
    `${mla} (${partyShort}) is the sitting MLA for ${constituency}.` +
    (work.length ? " " + work.map((w) => w.summary).join(" ") : " Detailed work record not yet compiled in this POC.");
  const integrityScan = issues.length
    ? "Flagged items: " +
      issues.map((i) => `[${i.publisher}, ${i.date}] ${i.summary} (status: ${i.verification}).`).join(" ")
    : `No adjudicated corruption cases compiled. The winner declared ${winnerCriminalCases} criminal case(s) in their 2023 affidavit.`;
  const promiseVsResult =
    "Promise-vs-result comparison requires the party manifesto and local-works data, which are not yet populated for this constituency in the POC.";
  return {
    generatedBy: "fallback (no API key / no live search)",
    workSummary,
    integrityScan,
    promiseVsResult,
    sources: news.articles.map((a) => ({ title: a.title, url: a.url })),
  };
}

export async function POST(req: Request) {
  const { ac = 161 } = await req.json().catch(() => ({ ac: 161 }));
  const acNo = Number(ac);
  const detail = await getConstituencyDetail(acNo);
  const mla = detail?.winningParty?.winning_candidate ?? "";
  const partyShort = detail?.winningParty?.party_short ?? "";
  const constituency = detail?.constituency.ac_name ?? "";
  const winner = detail?.candidates.find((c) => c.is_seat_winner);
  const district = "Bengaluru, Karnataka";

  // Curated sources only for the POC seat; others rely on live search.
  let news: MlaNews = { subject: "", purpose: "", collected_on: "", articles: [], gaps_to_fill_by_agent: [] };
  let affidavit = "";
  let manifesto = "";
  if (acNo === CURATED_AC) {
    [news, affidavit, manifesto] = await Promise.all([
      getMlaNews(),
      getAffidavitText(),
      getManifestoText(),
    ]);
  }

  let live: SearchResult[] = [];
  let searchProvider = "";
  if (mla) {
    try {
      const search = await webSearch(
        [
          `"${mla}" MLA "${constituency}" ${district} development work projects funds`,
          `"${mla}" MLA "${constituency}" ${district} corruption OR scam OR allegation OR controversy`,
        ],
        { topic: "general", searchDepth: "advanced", maxResultsPerQuery: 8, minScore: 0.4 },
      );
      if (search) {
        searchProvider = search.provider;
        const terms = relevanceTerms(mla, constituency);
        live = search.results
          .filter((r) => {
            const hay = `${r.title} ${r.content}`.toLowerCase();
            return terms.some((t) => hay.includes(t));
          })
          .slice(0, 6);
      }
    } catch {
      // ignore search failures
    }
  }

  const sourceMap = new Map<string, { title: string; url: string }>();
  for (const a of news.articles) sourceMap.set(normalizeUrl(a.url), { title: a.title, url: a.url });
  for (const r of live) if (r.url) sourceMap.set(normalizeUrl(r.url), { title: r.title, url: r.url });
  const sources = [...sourceMap.values()];

  const liveBlock = live.length
    ? `\n\nLIVE_WEB_SEARCH (fresh, ${searchProvider}):\n${live.map((r) => `- ${r.title} (${r.url})\n  ${r.content}`).join("\n")}`
    : "";
  const winnerFacts = winner
    ? `WINNER: ${winner.name} (${winner.party_short}); assets ${winner.assets_total_inr ?? "n/a"}; criminal cases ${winner.criminal_cases_count}.`
    : "";

  try {
    const llm = await generateText(
      "You are an investigative but strictly neutral civic-research analyst. Using ONLY the provided sources, produce a JSON object with keys: workSummary, integrityScan, promiseVsResult. Be factual, cite allegations as allegations (not facts), prefer the freshest LIVE_WEB_SEARCH items, and never fabricate. If evidence is thin, say so. Keep each field to a short paragraph.",
      `MLA: ${mla} (${partyShort}) — ${constituency}.\n${winnerFacts}\n\nCURATED_NEWS:\n${JSON.stringify(news.articles, null, 2)}\n\nAFFIDAVIT:\n${affidavit}\n\nMANIFESTO:\n${manifesto}${liveBlock}\n\nReturn ONLY valid JSON.`,
    );
    if (llm) {
      let parsed: Partial<ResearchReport> = {};
      try {
        parsed = JSON.parse(llm.text.replace(/^```json\s*|\s*```$/g, "").trim());
      } catch {
        parsed = { workSummary: llm.text };
      }
      return NextResponse.json({
        generatedBy: live.length ? `${llm.provider} + live web search (${searchProvider})` : llm.provider,
        workSummary: parsed.workSummary ?? "",
        integrityScan: parsed.integrityScan ?? "",
        promiseVsResult: parsed.promiseVsResult ?? "",
        sources,
      } satisfies ResearchReport);
    }
  } catch (err) {
    const report = fallbackReport(mla, partyShort, constituency, news, winner?.criminal_cases_count ?? 0);
    report.generatedBy = `fallback (LLM error: ${String(err)})`;
    report.sources = sources;
    return NextResponse.json(report);
  }

  const report = fallbackReport(mla, partyShort, constituency, news, winner?.criminal_cases_count ?? 0);
  report.sources = sources;
  return NextResponse.json(report);
}
