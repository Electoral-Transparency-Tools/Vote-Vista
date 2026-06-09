"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Candidate, ConstituencyMeta, LocationMeta } from "@/lib/types";
import { formatINR, partyColor } from "@/lib/format";
import CandidateDetail from "./CandidateDetail";
import ResearchPanel from "./ResearchPanel";
import ThemeToggle from "./ThemeToggle";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-slate-200 text-slate-500">
      Loading map…
    </div>
  ),
});

interface Detail {
  constituency: ConstituencyMeta;
  candidates: Candidate[];
  winningParty: { party: string; party_short: string; winning_candidate: string } | null;
}

interface PortalProps {
  initialDetail: Detail;
  initialAc: number;
  location: LocationMeta;
}

export default function Portal({ initialDetail, initialAc, location }: PortalProps) {
  const [selectedAc, setSelectedAc] = useState(initialAc);
  const [detail, setDetail] = useState<Detail>(initialDetail);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [researchOpen, setResearchOpen] = useState(false);
  const [highlightWinner, setHighlightWinner] = useState(false);
  const [overview, setOverview] = useState("");
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [focusPoint, setFocusPoint] = useState<{ lat: number; lng: number } | null>(null);

  // Cache fetched constituency details so re-selecting one doesn't refetch.
  const detailCacheRef = useRef<Map<number, Detail>>(
    new Map([[initialAc, initialDetail]]),
  );

  // On load, if the user grants live location and it falls inside a known
  // constituency, switch to it and recentre the map.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        try {
          const res = await fetch(`/api/locate?lat=${lat}&lng=${lng}`);
          if (!res.ok) return;
          const { ac } = await res.json();
          if (cancelled || !ac) return;
          setFocusPoint({ lat, lng });
          const cached = detailCacheRef.current.get(ac);
          if (cached) {
            setDetail(cached);
            setSelectedAc(ac);
            return;
          }
          const dres = await fetch(`/api/constituency/${ac}`);
          if (dres.ok) {
            const d: Detail = await dres.json();
            detailCacheRef.current.set(ac, d);
            setDetail(d);
            setSelectedAc(ac);
          }
        } catch {
          /* ignore */
        }
      },
      () => {
        /* permission denied / unavailable: keep server default */
      },
      { timeout: 8000, maximumAge: 600000 },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const { constituency, candidates, winningParty } = detail;

  // Stable reference so MapView doesn't re-initialise (and reset its view)
  // every time another constituency is selected.
  const house = useMemo(
    () => ({
      lat: location.poc_location.lat,
      lon: location.poc_location.lon,
      label: location.poc_location.label,
    }),
    [location],
  );

  async function selectAc(ac: number) {
    if (ac === selectedAc) return;
    setSelected(null);
    setOverview("");
    const cached = detailCacheRef.current.get(ac);
    if (cached) {
      setDetail(cached);
      setSelectedAc(ac);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/constituency/${ac}`);
      if (res.ok) {
        const d: Detail = await res.json();
        detailCacheRef.current.set(ac, d);
        setDetail(d);
        setSelectedAc(ac);
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadOverview(force = false) {
    setOverviewLoading(true);
    try {
      const res = await fetch("/api/overview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ac: selectedAc, force }),
      });
      const data = await res.json();
      if (res.status === 429) {
        setOverview(data.message ?? "Rate limit reached. Please try again later.");
        return;
      }
      setOverview(data.overview ?? "");
    } finally {
      setOverviewLoading(false);
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="z-10 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div>
          <h1 className="text-lg font-extrabold tracking-tight">
            Vote<span className="text-brand">Vista</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {constituency.ac_name} · {constituency.pc_name || "Bengaluru"} · 2023 Assembly
          </p>
        </div>
        <div className="flex items-center gap-2">
          {winningParty && (
            <span
              className="rounded-full px-3 py-1 text-xs font-semibold text-white"
              style={{ background: partyColor(winningParty.party_short) }}
            >
              Won by {winningParty.winning_candidate} ({winningParty.party_short})
            </span>
          )}
          <button
            onClick={() => setResearchOpen(true)}
            className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            🔍 Research the MLA
          </button>
          <ThemeToggle />
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 grid-rows-[45vh_1fr] overflow-hidden lg:grid-cols-[420px_1fr] lg:grid-rows-1">
        <aside className="relative order-2 flex flex-col overflow-y-auto border-r border-slate-200 bg-white scrollbar-thin dark:border-slate-700 dark:bg-slate-800 lg:order-1">
          {loading && (
            <div className="absolute inset-x-0 top-0 z-20 bg-brand/90 py-1 text-center text-xs font-medium text-white">
              Loading constituency…
            </div>
          )}
          <ConstituencyStats constituency={constituency} />

          <div className="border-b border-slate-200 p-4 dark:border-slate-700">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                AI overview · top candidates
              </h2>
              <button
                onClick={() => loadOverview(overview !== "")}
                disabled={overviewLoading}
                className="rounded-md bg-slate-800 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-600 dark:hover:bg-slate-500"
              >
                {overviewLoading ? "…" : overview ? "Regenerate" : "Generate"}
              </button>
            </div>
            {overview && (
              <p className="mt-2 whitespace-pre-line rounded-lg bg-slate-50 p-3 text-sm leading-relaxed text-slate-600 dark:bg-slate-700/50 dark:text-slate-300">
                {overview}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between px-4 pt-4">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Candidates ({candidates.length})
            </h2>
            <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <input
                type="checkbox"
                checked={highlightWinner}
                onChange={(e) => setHighlightWinner(e.target.checked)}
              />
              Highlight winner
            </label>
          </div>

          {candidates.length === 0 && (
            <p className="px-4 py-6 text-sm text-slate-400">
              No candidate data loaded for this constituency yet.
            </p>
          )}

          <ul className="space-y-2 p-4">
            {candidates.map((c) => (
              <li key={c.name}>
                <button
                  onClick={() => setSelected(c)}
                  className={`w-full rounded-xl border p-3 text-left transition hover:shadow-md ${
                    c.is_seat_winner && highlightWinner
                      ? "border-brand ring-2 ring-brand/30"
                      : "border-slate-200 dark:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ background: partyColor(c.party_short) }}
                      />
                      <span className="font-semibold text-slate-800 dark:text-slate-100">{c.name}</span>
                      {c.is_seat_winner && (
                        <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-bold text-amber-700">
                          ★ WINNER
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {c.vote_share_pct ? `${c.vote_share_pct}%` : "—"}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>{c.party_short}</span>
                    <span>
                      {c.votes ? `${c.votes.toLocaleString("en-IN")} votes` : "votes n/a"} ·{" "}
                      {c.criminal_cases_count > 0 ? (
                        <span className="text-red-600">{c.criminal_cases_count} case(s)</span>
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

        <main className="relative order-1 min-h-[320px] lg:order-2">
          <MapView
            house={house}
            selectedAc={selectedAc}
            onSelect={selectAc}
            focusPoint={focusPoint}
          />
          <div className="pointer-events-none absolute bottom-6 left-3 rounded-lg bg-white/90 px-3 py-2 text-xs text-slate-600 shadow dark:bg-slate-800/90 dark:text-slate-300">
            Hover for a name · click a constituency to view its candidates
          </div>
        </main>
      </div>

      {selected && (
        <CandidateDetail
          candidate={selected}
          ac={selectedAc}
          onClose={() => setSelected(null)}
        />
      )}
      {researchOpen && (
        <ResearchPanel ac={selectedAc} onClose={() => setResearchOpen(false)} />
      )}
    </div>
  );
}

function ConstituencyStats({ constituency }: { constituency: ConstituencyMeta }) {
  const fmt = (n: number) => (n ? n.toLocaleString("en-IN") : "—");
  const items = [
    { label: "Electors", value: fmt(constituency.total_electors) },
    { label: "Valid votes", value: fmt(constituency.total_valid_votes) },
    { label: "Turnout", value: constituency.turnout_pct ? `${constituency.turnout_pct}%` : "—" },
    { label: "Reservation", value: constituency.reservation || "General" },
  ];
  return (
    <div className="border-b border-slate-200 p-4 dark:border-slate-700">
      <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
        Constituency overview
      </h2>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {items.map((i) => (
          <div key={i.label} className="rounded-lg bg-slate-50 p-2 dark:bg-slate-700/50">
            <div className="text-[11px] uppercase tracking-wide text-slate-400">{i.label}</div>
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {i.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
