import { NextResponse } from "next/server";
import { getCandidatesFile } from "@/lib/data";
import { generateText } from "@/lib/ai";
import { formatINR } from "@/lib/format";

export const runtime = "nodejs";

export async function POST() {
  const file = await getCandidatesFile();
  const contenders = file.candidates
    .filter((c) => c.party_short !== "NOTA")
    .sort((a, b) => b.votes - a.votes)
    .slice(0, 3);

  const lines = contenders.map(
    (c) =>
      `- ${c.name} (${c.party_short}): ${c.vote_share_pct}% | assets ${formatINR(c.assets_total_inr)} | ${c.criminal_cases_count} criminal case(s)`,
  );

  const fallback =
    `Top contenders in ${file.constituency.ac_name} (2023):\n` +
    lines.join("\n") +
    `\n\n${contenders[0].name} (${contenders[0].party_short}) won with ${contenders[0].vote_share_pct}% of the vote.`;

  try {
    const llm = await generateText(
      "You are a neutral civic-information assistant. In one short paragraph, give a balanced overview of the most popular candidates in this constituency using only the provided data. No partisanship.",
      `Constituency: ${file.constituency.ac_name}\nTop candidates by votes:\n${lines.join("\n")}\n\nWrite the overview.`,
    );
    if (llm) {
      return NextResponse.json({ overview: llm.text, source: llm.provider });
    }
  } catch (err) {
    return NextResponse.json({
      overview: fallback,
      source: `fallback (LLM error: ${String(err)})`,
    });
  }

  return NextResponse.json({
    overview: fallback,
    source: "fallback (no API key configured)",
  });
}
