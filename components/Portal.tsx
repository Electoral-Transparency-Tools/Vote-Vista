"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import type {
  Candidate,
  ConstituencyMeta,
  WinningParty,
  LocationMeta,
} from "@/lib/types";
import { formatINR, partyColor } from "@/lib/format";
import CandidateDetail from "./CandidateDetail";
import ResearchPanel from "./ResearchPanel";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-slate-200 text-slate-500">
      Loading map…
    </div>
  ),
});

interface PortalProps {
  constituency: ConstituencyMeta;
  candidates: Candidate[];
  winningParty: WinningParty;
  geojson: GeoJSON.FeatureCollection;
  location: LocationMeta;
}

export default function Portal({
  constituency,
  candidates,
  winningParty,
  geojson,
  location,
}: PortalProps) {
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [researchOpen, setResearchOpen] = useState(false);
  const [highlightWinner, setHighlightWinner] = useState(false);
  const [overview, setOverview] = useState<string>("");
  const [overviewLoading, setOverviewLoading] = useState(false);

  const sorted = useMemo(
    () => [...candidates].sort((a, b) => b.votes - a.votes),
    [candidates],
  );

  async function loadOverview() {
    setOverviewLoading(true);
    try {
      const res = await fetch("/api/overview", { method: "POST" });
      const data = await res.json();
      setOverview(data.overview ?? "");
    } finally {
      setOverviewLoading(false);
    }
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="z-10 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3 shadow-sm">
        <div>
          <h1 className="text-lg font-extrabold tracking-tight">
            Vote<span className="text-brand">Vista</span>
          </h1>
          <p className="text-xs text-slate-500">
            {constituency.ac_name} · {constituency.pc_name} · {constituency.election}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="rounded-full px-3 py-1 text-xs font-semibold text-white"
            style={{ background: partyColor(winningParty.party_short) }}
          >
            Won by {winningParty.winning_candidate} ({winningParty.party_short})
          </span>
          <button
            onClick={() => setResearchOpen(true)}
            className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            🔍 Research the MLA
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[420px_1fr]">
        {/* Left: list */}
        <aside className="flex flex-col overflow-y-auto border-r border-slate-200 bg-white scrollbar-thin">
          <ConstituencyStats constituency={constituency} />

          {/* Feature 4: AI overview of popular candidates */}
          <div className="border-b border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">
                AI overview · top candidates
              </h2>
              <button
                onClick={loadOverview}
                disabled={overviewLoading}
                className="rounded-md bg-slate-800 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
              >
                {overviewLoading ? "…" : overview ? "Refresh" : "Generate"}
              </button>
            </div>
            {overview && (
              <p className="mt-2 whitespace-pre-line rounded-lg bg-slate-50 p-3 text-sm leading-relaxed text-slate-600">
                {overview}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between px-4 pt-4">
            <h2 className="text-sm font-semibold text-slate-700">
              Candidates ({candidates.length})
            </h2>
            <label className="flex items-center gap-1.5 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={highlightWinner}
                onChange={(e) => setHighlightWinner(e.target.checked)}
              />
              Highlight winner
            </label>
          </div>

          <ul className="space-y-2 p-4">
            {sorted.map((c) => (
              <li key={c.name}>
                <button
                  onClick={() => setSelected(c)}
                  className={`w-full rounded-xl border p-3 text-left transition hover:shadow-md ${
                    c.is_seat_winner && highlightWinner
                      ? "border-brand ring-2 ring-brand/30"
                      : "border-slate-200"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ background: partyColor(c.party_short) }}
                      />
                      <span className="font-semibold text-slate-800">
                        {c.name}
                      </span>
                      {c.is_seat_winner && (
                        <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-bold text-amber-700">
                          ★ WINNER
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-medium text-slate-500">
                      {c.vote_share_pct}%
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                    <span>{c.party_short}</span>
                    <span>
                      {c.votes.toLocaleString("en-IN")} votes ·{" "}
                      {c.criminal_cases_count > 0 ? (
                        <span className="text-red-600">
                          {c.criminal_cases_count} case(s)
                        </span>
                      ) : (
                        "clean"
                      )}{" "}
                      · {formatINR(c.assets_total_inr)}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* Right: map */}
        <main className="relative min-h-[320px]">
          <MapView
            geojson={geojson}
            house={{
              lat: location.poc_location.lat,
              lon: location.poc_location.lon,
              label: location.poc_location.label,
            }}
            winnerPartyShort={winningParty.party_short}
            highlight={highlightWinner}
          />
        </main>
      </div>

      {selected && (
        <CandidateDetail candidate={selected} onClose={() => setSelected(null)} />
      )}
      {researchOpen && <ResearchPanel onClose={() => setResearchOpen(false)} />}
    </div>
  );
}

function ConstituencyStats({
  constituency,
}: {
  constituency: ConstituencyMeta;
}) {
  const items = [
    { label: "Electors", value: constituency.total_electors.toLocaleString("en-IN") },
    { label: "Valid votes", value: constituency.total_valid_votes.toLocaleString("en-IN") },
    { label: "Turnout", value: `${constituency.turnout_pct}%` },
    { label: "Reservation", value: constituency.reservation },
  ];
  return (
    <div className="border-b border-slate-200 p-4">
      <h2 className="text-sm font-semibold text-slate-700">
        Constituency overview
      </h2>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {items.map((i) => (
          <div key={i.label} className="rounded-lg bg-slate-50 p-2">
            <div className="text-[11px] uppercase tracking-wide text-slate-400">
              {i.label}
            </div>
            <div className="text-sm font-semibold text-slate-800">{i.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
