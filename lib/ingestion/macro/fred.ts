/**
 * Thin client for FRED's free observations API. Needs FRED_API_KEY (free,
 * https://fred.stlouisfed.org/docs/api/api_key.html) — not yet provisioned
 * in this app's env as of the Macro Indicators build, so every call here
 * will fail until it's added to .env.local / Vercel. Callers must treat a
 * thrown/null result as "Data unavailable" (per dashboard.md decision 3),
 * never fabricate a value.
 */

export interface FredObservation {
  date: string; // YYYY-MM-DD
  value: number | null; // null if FRED's own "." (missing) marker
}

const FRED_BASE_URL = "https://api.stlouisfed.org/fred/series/observations";

function parseObservation(raw: { date: string; value: string }): FredObservation {
  return { date: raw.date, value: raw.value === "." ? null : Number(raw.value) };
}

/** Fetches the most recent `limit` observations for a series, newest first. */
export async function fetchFredSeries(seriesId: string, limit = 24): Promise<FredObservation[]> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) throw new Error("FRED_API_KEY is not set");

  const url = new URL(FRED_BASE_URL);
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("sort_order", "desc");
  url.searchParams.set("limit", String(limit));

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`FRED request for ${seriesId} failed: ${res.status} ${res.statusText}`);

  const body = (await res.json()) as { observations?: Array<{ date: string; value: string }> };
  if (!body.observations) throw new Error(`FRED response for ${seriesId} had no observations`);

  return body.observations.map(parseObservation).filter((o) => o.value !== null);
}

/** Convenience wrapper for callers that only need the latest reading + the one before it. */
export async function fetchFredLatestAndPrevious(
  seriesId: string
): Promise<{ latest: FredObservation; previous: FredObservation | null } | null> {
  const observations = await fetchFredSeries(seriesId, 2);
  if (observations.length === 0) return null;
  return { latest: observations[0], previous: observations[1] ?? null };
}
