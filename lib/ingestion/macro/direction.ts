import type { Direction } from "@/types/database";

export interface DirectionHistoryPoint {
  periodDate: string;
  value: number;
}

export interface DirectionContext {
  /** Ascending by periodDate, last element is the just-fetched current reading. */
  history: DirectionHistoryPoint[];
  /** Precomputed secondary value some rules need (e.g. FRED's own Sahm Rule series for unemployment). */
  auxValue?: number | null;
}

function values(ctx: DirectionContext): number[] {
  return ctx.history.map((h) => h.value);
}

function last(ctx: DirectionContext): number | undefined {
  return values(ctx).at(-1);
}

function nAgo(ctx: DirectionContext, n: number): number | undefined {
  return values(ctx).at(-1 - n);
}

function average(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** Month-over-month (or period-over-period, for the series' own native cadence) diffs, oldest-first. */
function diffs(nums: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < nums.length; i++) out.push(nums[i] - nums[i - 1]);
  return out;
}

/** 50 = expansion/contraction breakeven (ISM Mfg/Services PMI — sourced, literal diffusion-index construction). */
function pmi50(ctx: DirectionContext): Direction | null {
  const cur = last(ctx);
  if (cur === undefined) return null;
  return cur >= 50 ? "up" : "down";
}

/**
 * Conference Board's "3Ds" rule (sourced) — depth: 6-month annualized growth < -4.3%.
 * APPROXIMATION: the diffusion (breadth across 10 components) leg of the official
 * rule isn't available from the free headline-only press release, so only the
 * depth condition is checked here. Flagged in the indicator's analyst_note too.
 */
function lei3ds(ctx: DirectionContext): Direction | null {
  const cur = last(ctx);
  const sixMoAgo = nAgo(ctx, 6);
  if (cur === undefined || sixMoAgo === undefined || sixMoAgo === 0) return null;
  const annualizedRate = (Math.pow(cur / sixMoAgo, 2) - 1) * 100;
  return annualizedRate < -4.3 ? "down" : "up";
}

/** ~300K 4-week MA level (judgment call) — needs at least 4 weekly readings. */
function claims4wkMa300k(ctx: DirectionContext): Direction | null {
  const v = values(ctx);
  if (v.length < 4) return null;
  const ma = average(v.slice(-4));
  return ma > 300_000 ? "down" : "up";
}

/** 3-month average, declining (judgment call) — needs 6 months to compare two consecutive 3-month windows. */
function permits3moAvg(ctx: DirectionContext): Direction | null {
  const v = values(ctx);
  if (v.length < 6) return null;
  const recent = average(v.slice(-3));
  const prior = average(v.slice(-6, -3));
  return recent < prior ? "down" : "up";
}

/** Simple MoM sign (judgment call — "sharp falls" in the source has no defined magnitude). */
function momSign(ctx: DirectionContext): Direction | null {
  const cur = last(ctx);
  const prev = nAgo(ctx, 1);
  if (cur === undefined || prev === undefined) return null;
  return cur < prev ? "down" : "up";
}

/** Inversion < 0 (sourced — definitional). */
function yieldCurveInversion(ctx: DirectionContext): Direction | null {
  const cur = last(ctx);
  if (cur === undefined) return null;
  return cur >= 0 ? "up" : "down";
}

/** >20% drawdown from rolling peak = bear market (sourced — universal convention). */
function drawdown20(ctx: DirectionContext): Direction | null {
  const v = values(ctx);
  const cur = last(ctx);
  if (cur === undefined || v.length === 0) return null;
  const peak = Math.max(...v);
  return cur <= peak * 0.8 ? "down" : "up";
}

/** >=30% decline over ~6-8 weeks (judgment call, picked the floor of the source's "30-40%" range). */
function bdiDecline30pct(ctx: DirectionContext): Direction | null {
  const v = values(ctx);
  const cur = last(ctx);
  // ~6-8 weeks of daily readings; using 42 trading-day lookback as a reasonable proxy.
  const lookback = v.at(-43);
  if (cur === undefined || lookback === undefined || lookback === 0) return null;
  const pctChange = (cur - lookback) / lookback;
  return pctChange <= -0.3 ? "down" : "up";
}

/** TIPS Breakeven: non-monotonic, no two-state mapping fits (per dashboard.md decision). */
function nonMonotonic(): Direction | null {
  return null;
}

/** 3-month average payroll growth, <75K down / >150K up (judgment call, replaces forecast-dependent original rule). */
function nfp3moAvg(ctx: DirectionContext): Direction | null {
  const v = values(ctx);
  if (v.length < 4) return null;
  const monthlyDiffs = diffs(v.slice(-4)); // 3 diffs from 4 levels
  const avg = average(monthlyDiffs);
  if (avg < 75) return "down";
  if (avg > 150) return "up";
  return null;
}

/** Production declining 2+ consecutive months = contraction (judgment call on the operationalization; relevance is well-established). */
function decline2mo(ctx: DirectionContext): Direction | null {
  const v = values(ctx);
  if (v.length < 3) return null;
  const last2 = diffs(v.slice(-3)); // last 2 month-over-month diffs
  return last2.every((d) => d < 0) ? "down" : "up";
}

/** Real income YoY < 0 (judgment call) — needs ~13 periods at the series' native monthly cadence. */
function yoyNegative(ctx: DirectionContext): Direction | null {
  const cur = last(ctx);
  const yearAgo = nAgo(ctx, 12);
  if (cur === undefined || yearAgo === undefined || yearAgo === 0) return null;
  const yoy = (cur - yearAgo) / yearAgo;
  return yoy < 0 ? "down" : "up";
}

/** Sahm Rule (sourced, named academic rule) — uses FRED's own pre-computed SAHMREALTIME series via auxValue, not recomputed locally. */
function sahmRule(ctx: DirectionContext): Direction | null {
  if (ctx.auxValue === undefined || ctx.auxValue === null) return null;
  return ctx.auxValue >= 0.5 ? "down" : "up";
}

/** Direction of rate change: hike = down, cut = up, unchanged = N/A (no forced guess). */
function rateChangeDirection(ctx: DirectionContext): Direction | null {
  const cur = last(ctx);
  const prev = nAgo(ctx, 1);
  if (cur === undefined || prev === undefined || cur === prev) return null;
  return cur > prev ? "down" : "up";
}

/** Accelerating/decelerating YoY growth (lowest-risk judgment call — pure sign-of-trend, no arbitrary number). Needs ~14 periods. */
function yoyGrowthDirection(ctx: DirectionContext): Direction | null {
  const v = values(ctx);
  if (v.length < 14) return null;
  const yoyNow = (v.at(-1)! - v.at(-13)!) / v.at(-13)!;
  const yoyPrev = (v.at(-2)! - v.at(-14)!) / v.at(-14)!;
  return yoyNow < yoyPrev ? "down" : "up";
}

/** Core CPI (proxy for "supercore" — see analyst_note) YoY >3% down / <2.5% up (judgment call). Needs ~13 months. */
function cpiSupercore(ctx: DirectionContext): Direction | null {
  const cur = last(ctx);
  const yearAgo = nAgo(ctx, 12);
  if (cur === undefined || yearAgo === undefined || yearAgo === 0) return null;
  const yoy = ((cur - yearAgo) / yearAgo) * 100;
  if (yoy > 3) return "down";
  if (yoy < 2.5) return "up";
  return null;
}

const RULES: Record<string, (ctx: DirectionContext) => Direction | null> = {
  pmi_50: pmi50,
  lei_3ds: lei3ds,
  claims_4wk_ma_300k: claims4wkMa300k,
  permits_3mo_avg: permits3moAvg,
  confidence_mom_sign: momSign,
  umich_mom_or_inflation: momSign, // inflation-expectation override not wired in — see dashboard.md
  yield_curve_inversion: yieldCurveInversion,
  sp500_drawdown_20: drawdown20,
  bdi_decline_30pct: bdiDecline30pct,
  na_non_monotonic: nonMonotonic,
  nfp_3mo_avg: nfp3moAvg,
  ip_2mo_decline: decline2mo,
  real_income_yoy: yoyNegative,
  mts_decline: decline2mo,
  sahm_rule: sahmRule,
  rate_change_direction: rateChangeDirection,
  yoy_growth_direction: yoyGrowthDirection,
  cpi_supercore: cpiSupercore,
};

/** Dispatches to the rule named by `macro_indicators.direction_rule_key`. Returns null (N/A) for unknown keys rather than guessing. */
export function computeDirection(ruleKey: string, ctx: DirectionContext): Direction | null {
  return RULES[ruleKey]?.(ctx) ?? null;
}
