import { NextResponse } from "next/server";
import {
  getMlaNews,
  getManifestoText,
  getAffidavitText,
  getWinningParty,
} from "@/lib/data";
import { generateText } from "@/lib/ai";
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
  const issues = news.articles.filter((a) =>
    a.category.includes("controversy") || a.category.includes("corruption"),
  );

  const workSummary =
    `${party.winning_candidate} (${party.party_short}) is the sitting MLA for C.V. Raman Nagar. ` +
    party.tenure_note +
    (work.length
      ? " Reported work/profile highlights: " +
        work.map((w) => w.summary).join(" ")
      : "");

  const integrityScan =
    issues.length === 0
      ? "Initial scan found no adjudicated corruption cases. The candidate's 2023 affidavit declared zero criminal cases."
      : "Flagged items from the scan: " +
        issues
          .map(
            (i) =>
              `[${i.publisher}, ${i.date}] ${i.summary} (status: ${i.verification}).`,
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

  try {
    const llm = await generateText(
      "You are an investigative but strictly neutral civic-research analyst. Using ONLY the provided sources, produce a JSON object with keys: workSummary, integrityScan, promiseVsResult. Be factual, cite the nature of allegations as allegations (not facts), and never fabricate. Keep each field to a short paragraph.",
      `SOURCES:\n\nNEWS:\n${JSON.stringify(news, null, 2)}\n\nAFFIDAVIT:\n${getAffidavitText()}\n\nMANIFESTO:\n${getManifestoText()}\n\nReturn ONLY valid JSON.`,
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
        generatedBy: llm.provider,
        workSummary: parsed.workSummary ?? "",
        integrityScan: parsed.integrityScan ?? "",
        promiseVsResult: parsed.promiseVsResult ?? "",
        sources: news.articles.map((a) => ({ title: a.title, url: a.url })),
      };
      return NextResponse.json(report);
    }
  } catch (err) {
    const report = fallbackReport();
    report.generatedBy = `fallback (LLM error: ${String(err)})`;
    return NextResponse.json(report);
  }

  return NextResponse.json(fallbackReport());
}
