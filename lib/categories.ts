/** SPEC.md Section 5 — canonical category taxonomy. */

export const GICS_SECTORS = [
  "Energy",
  "Materials",
  "Industrials",
  "Consumer Discretionary",
  "Consumer Staples",
  "Healthcare",
  "Financials",
  "Information Technology",
  "Communication Services",
  "Utilities",
  "Real Estate",
] as const;

export const EXTENDED_CATEGORIES = [
  "Macro & Central Banks",
  "Markets & Commodities",
  "Geopolitics & Trade",
  "Policy & Regulation",
  "Sustainability & ESG",
  "Governance",
  "Miscellaneous",
] as const;

export const ALL_CATEGORIES = [...GICS_SECTORS, ...EXTENDED_CATEGORIES];
