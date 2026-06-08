import { NextResponse } from "next/server";
import { getConstituencyDetail } from "@/lib/data";
import { generateText } from "@/lib/ai";
import { getOrGenerateInsight } from "@/lib/insights";
import { clientId } from "@/lib/ratelimit";
import { formatINR } from "@/lib/format";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { ac = 161, force = false } = await req
    .json()
    .catch(() => ({ ac: 161, force: false }));
  const acNo = Number(ac);
  const detail = await getConstituencyDetail(acNo);
  if (!detail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const result = await getOrGenerateInsight("overview", acNo, "", Boolean(force), clientId(req), async () => {
    const contenders = detail.candidates
      .filter((c) => c.party_short !== "NOTA")
      .sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0))
      .slice(0, 3);
    const lines = contenders.map(
      (c) =>
        `- ${c.name} (${c.party_short}): ${c.vote_share_pct ? c.vote_share_pct + "%" : "vote share n/a"} | assets ${formatINR(c.assets_total_inr)} | ${c.criminal_cases_count} criminal case(s)`,
    );
    const winner = contenders.find((c) => c.is_seat_winner) ?? contenders[0];
    const fallback =
      `Top contenders in ${detail.constituency.ac_name} (2023):\n` +
      lines.join("\n") +
      (winner ? `\n\n${winner.name} (${winner.party_short}) won the seat.` : "");
    try {
      const llm = await generateText(
        "You are a neutral civic-information assistant. In one short paragraph, give a balanced overview of the most popular candidates in this constituency using only the provided data. No partisanship.",
        `Constituency: ${detail.constituency.ac_name}\nTop candidates by votes:\n${lines.join("\n")}\n\nWrite the overview.`,
      );
      if (llm) return { payload: { overview: llm.text, source: llm.provider }, source: llm.provider };
    } catch (err) {
      const src = `fallback (LLM error: ${String(err)})`;
      return { payload: { overview: fallback, source: src }, source: src };
    }
    const src = "fallback (no API key configured)";
    return { payload: { overview: fallback, source: src }, source: src };
  });

  if (result.blocked) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many AI requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(result.retryAfterSec ?? 600) } },
    );
  }
  return NextResponse.json({
    ...result.payload,
    cached: result.cached,
    rateLimited: result.rateLimited,
    generatedAt: result.generatedAt,
  });
}
