import { NextResponse } from "next/server";
import { getConstituencyDetail, getAffidavitText } from "@/lib/data";
import { generateText } from "@/lib/ai";
import { formatINR } from "@/lib/format";
import type { Candidate } from "@/lib/types";

export const runtime = "nodejs";

function fallbackSummary(c: Candidate, constituency: string): string {
  const bits: string[] = [];
  const votesTxt = c.votes
    ? `, polling ${c.votes.toLocaleString("en-IN")} votes (${c.vote_share_pct}%)`
    : "";
  bits.push(
    `${c.name} contested ${constituency} for the ${c.party} (${c.party_short}) in 2023 and ${c.result === "won" ? "won the seat" : "did not win"}${votesTxt}.`,
  );
  if (c.age) bits.push(`Aged ${c.age}, educated to "${c.education}".`);
  bits.push(
    `Declared assets of ${formatINR(c.assets_total_inr)} against liabilities of ${formatINR(c.liabilities_inr)}.`,
  );
  bits.push(
    c.criminal_cases_count > 0
      ? `Declared ${c.criminal_cases_count} criminal case(s).`
      : "Declared no criminal cases.",
  );
  return bits.join(" ");
}

export async function POST(req: Request) {
  const { name, ac = 161 } = await req.json().catch(() => ({ name: "", ac: 161 }));
  const detail = await getConstituencyDetail(Number(ac));
  const candidate = detail?.candidates.find((c) => c.name === name);
  if (!detail || !candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }
  const constituency = detail.constituency.ac_name;

  const facts = {
    ...candidate,
    constituency,
    assets_readable: formatINR(candidate.assets_total_inr),
    liabilities_readable: formatINR(candidate.liabilities_inr),
  };
  // Curated affidavit text exists only for the POC seat (AC 161).
  const extraContext =
    Number(ac) === 161 && candidate.is_seat_winner ? await getAffidavitText() : "";

  try {
    const llm = await generateText(
      "You are a neutral, factual civic-information assistant. Write a concise 3-4 sentence profile of an Indian election candidate using ONLY the provided structured data. Be balanced and non-partisan. Do not invent facts.",
      `Candidate data (JSON):\n${JSON.stringify(facts, null, 2)}\n\n${extraContext ? `Additional affidavit context:\n${extraContext}\n\n` : ""}Write the profile.`,
    );
    if (llm) {
      return NextResponse.json({ summary: llm.text, source: llm.provider });
    }
  } catch (err) {
    return NextResponse.json({
      summary: fallbackSummary(candidate, constituency),
      source: "fallback (LLM error)",
      warning: String(err),
    });
  }

  return NextResponse.json({
    summary: fallbackSummary(candidate, constituency),
    source: "fallback (no API key configured)",
  });
}
