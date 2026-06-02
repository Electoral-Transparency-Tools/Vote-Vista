import "server-only";

export interface SearchResult {
  title: string;
  url: string;
  content: string;
  publishedDate?: string;
}

export interface WebSearchResponse {
  results: SearchResult[];
  provider: string;
}

export function searchConfigured(): boolean {
  return Boolean(process.env.TAVILY_API_KEY);
}

/**
 * Run one Tavily query. Returns cleaned results ready for an LLM.
 * Returns null when no TAVILY_API_KEY is set, so callers fall back to
 * the curated source files.
 */
async function tavilyQuery(
  query: string,
  maxResults: number,
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
      topic: "news",
      search_depth: "basic",
      max_results: maxResults,
      include_answer: false,
    }),
  });
  if (!res.ok) {
    throw new Error(`Tavily error ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return (data.results ?? []).map(
    (r: { title?: string; url?: string; content?: string; published_date?: string }) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      content: r.content ?? "",
      publishedDate: r.published_date,
    }),
  );
}

/**
 * Run multiple queries and merge/dedupe results by URL.
 * Returns null if search is not configured.
 */
export async function webSearch(
  queries: string[],
  maxResultsPerQuery = 5,
): Promise<WebSearchResponse | null> {
  if (!searchConfigured()) return null;

  const batches = await Promise.all(
    queries.map((q) => tavilyQuery(q, maxResultsPerQuery)),
  );

  const byUrl = new Map<string, SearchResult>();
  for (const batch of batches) {
    for (const r of batch) {
      if (r.url && !byUrl.has(r.url)) byUrl.set(r.url, r);
    }
  }

  return { results: [...byUrl.values()], provider: "tavily" };
}
