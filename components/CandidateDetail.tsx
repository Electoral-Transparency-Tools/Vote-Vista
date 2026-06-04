"use client";

import { useState } from "react";
import type { Candidate } from "@/lib/types";
import { formatINR, partyColor } from "@/lib/format";

function LinkRow({ label, url }: { label: string; url: string }) {
  const disabled = !url;
  return (
    <a
      href={disabled ? undefined : url}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
        disabled
          ? "cursor-not-allowed border-slate-200 text-slate-400"
          : "border-slate-200 text-brand hover:border-brand hover:bg-blue-50"
      }`}
    >
      <span>{label}</span>
      <span aria-hidden>{disabled ? "—" : "↗"}</span>
    </a>
  );
}

export default function CandidateDetail({
  candidate,
  ac,
  onClose,
}: {
  candidate: Candidate;
  ac: number;
  onClose: () => void;
}) {
  const [summary, setSummary] = useState<string>(candidate.ai_summary || "");
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<string>("");
  const [cached, setCached] = useState(false);

  async function generate(force = false) {
    setLoading(true);
    try {
      const res = await fetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: candidate.name, ac, force }),
      });
      const data = await res.json();
      setSummary(data.summary ?? "");
      setSource(data.source ?? "");
      setCached(Boolean(data.cached));
    } catch {
      setSummary("Could not generate summary. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="h-full w-full max-w-md overflow-y-auto bg-white shadow-2xl scrollbar-thin"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-start justify-between p-5 text-white"
          style={{ background: partyColor(candidate.party_short) }}
        >
          <div>
            <h2 className="text-xl font-bold">{candidate.name}</h2>
            <p className="text-sm opacity-90">{candidate.party}</p>
            {candidate.is_seat_winner && (
              <span className="mt-2 inline-block rounded-full bg-white/25 px-2 py-0.5 text-xs font-semibold">
                ★ Seat winner · Ruling party (this seat)
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-full bg-white/20 px-2 text-lg leading-none hover:bg-white/40"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Votes" value={candidate.votes.toLocaleString("en-IN")} />
            <Stat label="Vote share" value={`${candidate.vote_share_pct}%`} />
            <Stat label="Age" value={candidate.age ? String(candidate.age) : "—"} />
            <Stat label="Education" value={candidate.education || "—"} />
            <Stat label="Assets" value={formatINR(candidate.assets_total_inr)} />
            <Stat label="Liabilities" value={formatINR(candidate.liabilities_inr)} />
          </div>

          <div
            className={`rounded-lg p-3 text-sm ${
              candidate.criminal_cases_count > 0
                ? "bg-red-50 text-red-800"
                : "bg-green-50 text-green-800"
            }`}
          >
            <strong>
              {candidate.criminal_cases_count > 0
                ? `${candidate.criminal_cases_count} criminal case(s) declared`
                : "No criminal cases declared"}
            </strong>
            {candidate.criminal_cases_note && (
              <p className="mt-1 opacity-90">{candidate.criminal_cases_note}</p>
            )}
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Records & links
            </h3>
            <LinkRow label="Assets & affidavit (MyNeta)" url={candidate.affidavit_url} />
            <LinkRow label="Manifesto" url={candidate.manifesto_url} />
            <LinkRow label="Work history (PRS)" url={candidate.prs_url} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                AI summary
              </h3>
              <button
                onClick={() => generate(summary !== "")}
                disabled={loading}
                className="rounded-md bg-brand px-3 py-1 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
              >
                {loading ? "Generating…" : summary ? "Regenerate" : "Generate"}
              </button>
            </div>
            {summary ? (
              <div className="rounded-lg bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">
                {summary}
                {source && (
                  <p className="mt-2 text-[11px] text-slate-400">
                    via {source}
                    {cached ? " · cached" : " · freshly generated"}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-400">
                Click Generate for an AI-written, data-based profile.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-2">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="font-semibold text-slate-800">{value}</div>
    </div>
  );
}
