/**
 * Market Explanation Engine price source for equities/crypto/forex (dewnews.md
 * scoping decisions) — confirmed free-tier coverage for these three asset
 * classes (Twelve Data's own pricing page repeatedly scopes the free tier to
 * "US markets, forex, and cryptocurrencies"; commodities and indices are
 * paid-only, hence the separate Yahoo Finance client for those). Needs a
 * TWELVEDATA_API_KEY env var, not yet provisioned in this app — every call
 * will fail until it's added (free signup: https://twelvedata.com/pricing).
 */

const TWELVE_DATA_QUOTE_URL = "https://api.twelvedata.com/quote";

export interface TwelveDataQuote {
  symbol: string;
  price: number;
  previousClose: number | null;
  asOf: string; // ISO timestamp
}

export async function fetchTwelveDataQuote(symbol: string): Promise<TwelveDataQuote> {
  const apiKey = process.env.TWELVEDATA_API_KEY;
  if (!apiKey) throw new Error("TWELVEDATA_API_KEY is not set");

  const url = new URL(TWELVE_DATA_QUOTE_URL);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("apikey", apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Twelve Data request for "${symbol}" failed: ${res.status} ${res.statusText}`);

  const body = (await res.json()) as { status?: string; message?: string; close?: string; previous_close?: string };
  if (body.status === "error") throw new Error(`Twelve Data error for "${symbol}": ${body.message ?? "unknown error"}`);

  const price = body.close ? Number(body.close) : NaN;
  if (Number.isNaN(price)) throw new Error(`Twelve Data returned no usable price for "${symbol}"`);

  return {
    symbol,
    price,
    previousClose: body.previous_close ? Number(body.previous_close) : null,
    asOf: new Date().toISOString(),
  };
}
