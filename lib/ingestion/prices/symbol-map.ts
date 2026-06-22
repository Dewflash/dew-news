import type { createServiceClient } from "@/lib/supabase/server";
import { writeLog } from "@/lib/ingestion/log";
import { fetchYahooQuote } from "@/lib/ingestion/prices/yahoo";
import { fetchTwelveDataQuote } from "@/lib/ingestion/prices/twelvedata";
import type { EntityType } from "@/types/database";

export interface ResolvedSymbol {
  provider: "yahoo" | "twelvedata";
  symbol: string;
}

/** Common commodity names -> Yahoo Finance futures symbols. Free text on `entities.name`, so this is a name lookup, not exhaustive — unmapped names fall through to "Data unavailable" + a logged warning rather than a guess. */
const COMMODITY_SYMBOLS: Record<string, string> = {
  gold: "GC=F",
  silver: "SI=F",
  "crude oil": "CL=F",
  oil: "CL=F",
  "natural gas": "NG=F",
  copper: "HG=F",
  platinum: "PL=F",
};

/** Common index names -> Yahoo Finance index symbols. Includes Singapore's STI given this app's SGD/Singapore-investor context. */
const INDEX_SYMBOLS: Record<string, string> = {
  "s&p 500": "^GSPC",
  "sp 500": "^GSPC",
  sp500: "^GSPC",
  nasdaq: "^IXIC",
  "nasdaq composite": "^IXIC",
  "dow jones": "^DJI",
  dow: "^DJI",
  "straits times index": "^STI",
  sti: "^STI",
  "ftse 100": "^FTSE",
  "nikkei 225": "^N225",
  nikkei: "^N225",
};

const PRICEABLE_TYPES: EntityType[] = ["equity", "crypto", "currency", "commodity", "index"];

export function isPriceableType(type: EntityType): boolean {
  return PRICEABLE_TYPES.includes(type);
}

function normalise(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Pure mapping rule, no IO. `country`/`person`/`institution`/`other` are
 * intentionally never mapped — they have no price to track and are skipped
 * silently by design (dewnews.md decision), not logged as a failure.
 * A priceable type with no symbol found (missing ticker, or a commodity/
 * index name not in the lookup tables above) also returns null — the
 * caller (fetchEntityPrice below) is what decides whether that's worth
 * logging.
 */
export function resolvePriceSymbol(entity: { type: EntityType; name: string; ticker: string | null }): ResolvedSymbol | null {
  switch (entity.type) {
    case "equity":
      return entity.ticker ? { provider: "twelvedata", symbol: entity.ticker } : null;
    case "crypto":
      return entity.ticker ? { provider: "twelvedata", symbol: `${entity.ticker.toUpperCase()}/USD` } : null;
    case "currency": {
      if (!entity.ticker) return null;
      const t = entity.ticker.toUpperCase();
      return { provider: "twelvedata", symbol: t.includes("/") ? t : `${t}/USD` };
    }
    case "commodity": {
      const symbol = COMMODITY_SYMBOLS[normalise(entity.name)];
      return symbol ? { provider: "yahoo", symbol } : null;
    }
    case "index": {
      const symbol = INDEX_SYMBOLS[normalise(entity.name)];
      return symbol ? { provider: "yahoo", symbol } : null;
    }
    case "country":
    case "person":
    case "institution":
    case "other":
      return null;
    default:
      return null;
  }
}

export interface EntityPriceQuote {
  price: number;
  previousClose: number | null;
  asOf: string;
}

/**
 * Resolves a watchlist entity to a symbol and fetches its current price.
 * Every failure mode is logged to processing_log (visible in Settings) and
 * returns null rather than throwing or fabricating a value — "Data
 * unavailable" upstream, same pattern as the Macro Indicators Dashboard's
 * FRED-failure case. The two failure cases are logged at different
 * severities deliberately: a priceable type with no resolvable symbol is a
 * config gap worth a warning; an actual fetch failure (Yahoo's unofficial
 * endpoint breaking, Twelve Data erroring) is an error.
 */
export async function fetchEntityPrice(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  entity: { id: string; type: EntityType; name: string; ticker: string | null }
): Promise<EntityPriceQuote | null> {
  const resolved = resolvePriceSymbol(entity);
  if (!resolved) {
    if (isPriceableType(entity.type)) {
      await writeLog(supabase, {
        userId,
        level: "warning",
        stage: "system",
        message: `No price symbol mapping for watchlist entity "${entity.name}" (type: ${entity.type}, ticker: ${entity.ticker ?? "none"}) — skipping.`,
      });
    }
    return null;
  }

  try {
    const quote =
      resolved.provider === "yahoo" ? await fetchYahooQuote(resolved.symbol) : await fetchTwelveDataQuote(resolved.symbol);
    return { price: quote.price, previousClose: quote.previousClose, asOf: quote.asOf };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await writeLog(supabase, {
      userId,
      level: "error",
      stage: "system",
      message: `Price fetch failed for "${entity.name}" (${resolved.provider}:${resolved.symbol}): ${message}`,
    });
    return null;
  }
}
