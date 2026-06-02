import "server-only";

export interface SearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
  publishedDate?: string;
}

export interface WebSearchResponse {
  results: SearchResult[];
  provider: string;
}

export interface WebSearchOptions {
  maxResultsPerQuery?: number;
  searchDepth?: "basic" | "advanced";
  topic?: "general" | "news";
  /** Drop results below this Tavily relevance score (0-1). */
  minScore?: number;
}

export function searchConfigured(): boolean {
  return Boolean(process.env.TAVILY_API_KEY);
}

/**
 * Canonical key for deduping URLs that point to the same page, e.g.
 * http vs https, "www." vs not, and trailing slashes. Query strings are
 * kept (they often identify the page, e.g. ?candidate_id=7163); fragments
 * are dropped. Falls back to the lowercased input if parsing fails.
 */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    const host = u.host.toLowerCase().replace(/^www\./, "");
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return `${host}${path}${u.search}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

async function tavilyQuery(
  query: string,
  opts: Required<Pick<WebSearchOptions, "maxResultsPerQuery" | "searchDepth" | "topic">>,
): Promise<SearchResult[]> {
  const key = process.env.TAVILY_API_KEY!;
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      query,
      topic: opts.topic,
      search_depth: opts.searchDepth,
      max_results: opts.maxResultsPerQuery,
      include_answer: false,
    }),
  });
  if (!res.ok) {
    throw new Error(`Tavily error ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return (data.results ?? []).map(
    (r: {
      title?: string;
      url?: string;
      content?: string;
      score?: number;
      published_date?: string;
    }) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      content: r.content ?? "",
      score: typeof r.score === "number" ? r.score : 0,
      publishedDate: r.published_date,
    }),
  );
}

/**
 * Run multiple queries, merge/dedupe by URL (keeping the highest score),
 * drop low-relevance hits, and sort by score. Returns null if not configured.
 */
export async function webSearch(
  queries: string[],
  opts: WebSearchOptions = {},
): Promise<WebSearchResponse | null> {
  if (!searchConfigured()) return null;

  const resolved = {
    maxResultsPerQuery: opts.maxResultsPerQuery ?? 8,
    searchDepth: opts.searchDepth ?? "advanced",
    topic: opts.topic ?? "general",
  } as const;
  const minScore = opts.minScore ?? 0;

  const batches = await Promise.all(
    queries.map((q) => tavilyQuery(q, resolved)),
  );

  const byUrl = new Map<string, SearchResult>();
  for (const batch of batches) {
    for (const r of batch) {
      if (!r.url) continue;
      const key = normalizeUrl(r.url);
      const existing = byUrl.get(key);
      if (!existing || r.score > existing.score) byUrl.set(key, r);
    }
  }

  const results = [...byUrl.values()]
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score);

  return { results, provider: "tavily" };
}
