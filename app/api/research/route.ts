import { NextResponse } from "next/server";
import {
  getMlaNews,
  getManifestoText,
  getAffidavitText,
  getWinningParty,
} from "@/lib/data";
import { generateText } from "@/lib/ai";
import { webSearch, type SearchResult } from "@/lib/search";
import type { ResearchReport } from "@/lib/types";

export const runtime = "nodejs";
// The research agent can take a while; allow more time on platforms that honour it.
export const maxDuration = 60;

function fallbackReport(): ResearchReport {
  const news = getMlaNews();
  const party = getWinningParty();
  const work = news.articles.filter((a) =>
    ["profile/positive", "profile/record"].includes(a.category),
  );
  const issues = news.articles.filter(
    (a) => a.category.includes("controversy") || a.category.includes("corruption"),
  );

  const workSummary =
    `${party.winning_candidate} (${party.party_short}) is the sitting MLA for C.V. Raman Nagar. ` +
    party.tenure_note +
    (work.length
      ? " Reported work/profile highlights: " + work.map((w) => w.summary).join(" ")
      : "");

  const integrityScan =
    issues.length === 0
      ? "Initial scan found no adjudicated corruption cases. The candidate's 2023 affidavit declared zero criminal cases."
      : "Flagged items from the scan: " +
        issues
          .map(
            (i) => `[${i.publisher}, ${i.date}] ${i.summary} (status: ${i.verification}).`,
          )
          .join(" ");

  const promiseVsResult =
    "BJP lost the 2023 Karnataka election statewide (Congress formed the government), so most state-level manifesto promises were outside the winning MLA's power to deliver. " +
    "At the constituency level, the relevant comparison is local works and MLA-LAD fund utilisation, which this POC has not yet populated. " +
    `Manifesto reference: ${party.manifesto_2023_title}.`;

  return {
    generatedBy: "fallback (no API key configured) - summarised from gathered sources/",
    workSummary,
    integrityScan,
    promiseVsResult,
    sources: news.articles.map((a) => ({ title: a.title, url: a.url })),
  };
}

export async function POST() {
  const news = getMlaNews();
  const party = getWinningParty();
  const mla = party.winning_candidate;
  const constituency = "C.V. Raman Nagar";

  // Feature 5 upgrade: live web search (Tavily) when configured.
  let live: SearchResult[] = [];
  let searchProvider = "";
  try {
    const search = await webSearch([
      `${mla} MLA ${constituency} development work fund`,
      `${mla} MLA ${constituency} corruption scam allegation controversy`,
    ]);
    if (search) {
      live = search.results;
      searchProvider = search.provider;
    }
  } catch {
    // Search failed; continue with curated sources only.
  }

  // Merge curated + live sources for citation (dedupe by URL).
  const sourceMap = new Map<string, { title: string; url: string }>();
  for (const a of news.articles) sourceMap.set(a.url, { title: a.title, url: a.url });
  for (const r of live) if (r.url) sourceMap.set(r.url, { title: r.title, url: r.url });
  const sources = [...sourceMap.values()];

  const liveBlock = live.length
    ? `\n\nLIVE_WEB_SEARCH (fresh, ${searchProvider}):\n${live
        .map((r) => `- ${r.title} (${r.url})\n  ${r.content}`)
        .join("\n")}`
    : "";

  try {
    const llm = await generateText(
      "You are an investigative but strictly neutral civic-research analyst. Using ONLY the provided sources, produce a JSON object with keys: workSummary, integrityScan, promiseVsResult. Be factual, cite the nature of allegations as allegations (not facts), prefer the freshest LIVE_WEB_SEARCH items where available, and never fabricate. Keep each field to a short paragraph.",
      `SOURCES:\n\nCURATED_NEWS:\n${JSON.stringify(news, null, 2)}\n\nAFFIDAVIT:\n${getAffidavitText()}\n\nMANIFESTO:\n${getManifestoText()}${liveBlock}\n\nReturn ONLY valid JSON.`,
    );
    if (llm) {
      let parsed: Partial<ResearchReport> = {};
      try {
        const jsonStr = llm.text.replace(/^```json\s*|\s*```$/g, "").trim();
        parsed = JSON.parse(jsonStr);
      } catch {
        parsed = { workSummary: llm.text };
      }
      const report: ResearchReport = {
        generatedBy:
          live.length > 0
            ? `${llm.provider} + live web search (${searchProvider})`
            : llm.provider,
        workSummary: parsed.workSummary ?? "",
        integrityScan: parsed.integrityScan ?? "",
        promiseVsResult: parsed.promiseVsResult ?? "",
        sources,
      };
      return NextResponse.json(report);
    }
  } catch (err) {
    const report = fallbackReport();
    report.generatedBy = `fallback (LLM error: ${String(err)})`;
    report.sources = sources;
    return NextResponse.json(report);
  }

  const report = fallbackReport();
  report.sources = sources;
  return NextResponse.json(report);
}
