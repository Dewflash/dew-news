import YahooFinance from "yahoo-finance2";

/**
 * Market Explanation Engine price source for commodities/indices (dewnews.md
 * scoping decisions): Twelve Data's free tier doesn't cover these asset
 * classes, but Yahoo Finance's unofficial endpoint does, for free, with no
 * API key. Trade-off: it's unofficial and has a documented history of
 * breaking (crumb/cookie auth changes — see github.com/gadicc/yahoo-finance2
 * issues #741, #764, #977, recurring as recently as Dec 2025). Every call
 * here is expected to fail loudly and visibly (processing_log, "Data
 * unavailable" in the UI) rather than silently, per the same pattern as the
 * FRED-failure case in the Macro Indicators Dashboard — never fabricate a
 * value if this breaks.
 */
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export interface YahooQuote {
  symbol: string;
  price: number;
  /** Previous trading session's close, for a same-symbol "did it move" comparison without needing intraday history. */
  previousClose: number | null;
  asOf: string; // ISO timestamp
}

export async function fetchYahooQuote(symbol: string): Promise<YahooQuote> {
  const result = await yahooFinance.quote(symbol);
  if (typeof result.regularMarketPrice !== "number") {
    throw new Error(`Yahoo Finance returned no regularMarketPrice for "${symbol}"`);
  }
  return {
    symbol,
    price: result.regularMarketPrice,
    previousClose: typeof result.regularMarketPreviousClose === "number" ? result.regularMarketPreviousClose : null,
    asOf: new Date().toISOString(),
  };
}
