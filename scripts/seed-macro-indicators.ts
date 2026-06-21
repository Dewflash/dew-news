/**
 * Macro Indicators Dashboard catalog seed (see dashboard.md).
 *
 * Idempotent: deletes this user's existing macro_indicators rows (which
 * cascades to macro_indicator_readings) before re-inserting, so it can be
 * re-run freely as the catalog evolves. This only seeds the static catalog
 * (name, thresholds, sources) — actual readings come from
 * lib/ingestion/macro/run.ts, never from this script.
 *
 * Run with: npm run seed:macro
 */
import { createServiceClient } from "../lib/supabase/server";
import { getUserId } from "../lib/user";
import type { MacroIndicatorsInsert } from "../types/database";

async function main() {
  const supabase = createServiceClient();
  const userId = await getUserId(supabase);

  const { error: deleteError } = await supabase.from("macro_indicators").delete().eq("user_id", userId);
  if (deleteError) throw new Error(deleteError.message);

  const rows: MacroIndicatorsInsert[] = [
    // -------------------------------------------------------------- Leading
    {
      user_id: userId,
      name: "ISM Manufacturing PMI",
      cycle_type: "leading",
      frequency: "Monthly (1st business day)",
      source_name: "Institute for Supply Management",
      source_url: "https://www.ismworld.org/supply-management-news-and-reports/reports/ism-pmi-reports/pmi/",
      fred_series_id: null,
      press_release_url: "https://www.ismworld.org/supply-management-news-and-reports/reports/ism-pmi-reports/pmi/",
      lead_lag_months: "1-3 months",
      threshold_rule: ">50 = expanding; <45 sustained = recession risk; watch New Orders sub-index",
      direction_rule_key: "pmi_50",
      analyst_note:
        "Read the full report, not just the headline — New Orders and Employment sub-indices often diverge from the composite and carry more forward signal. Flash PMIs (S&P Global) release ~1 week earlier and give an advance read; the ISM final is the definitive number. Market-moving on release day; one data point alone is noise, a trend over 3+ months is signal.",
      sub_indices: ["New Orders", "Employment"],
      sort_order: 1,
    },
    {
      user_id: userId,
      name: "ISM Services PMI",
      cycle_type: "leading",
      frequency: "Monthly (3rd business day)",
      source_name: "Institute for Supply Management",
      source_url: "https://www.ismworld.org/supply-management-news-and-reports/reports/ism-pmi-reports/services/",
      fred_series_id: null,
      press_release_url: "https://www.ismworld.org/supply-management-news-and-reports/reports/ism-pmi-reports/services/",
      lead_lag_months: "1-2 months",
      threshold_rule: "Same 50 threshold; services is ~70% of US GDP — often diverges from manufacturing",
      direction_rule_key: "pmi_50",
      analyst_note:
        "Read alongside manufacturing PMI — divergence between the two (services strong, manufacturing weak) is common in post-pandemic cycles and doesn't automatically signal recession. Prices Paid sub-index within ISM Services is a supplementary inflation read the Fed monitors closely.",
      sub_indices: ["Prices Paid"],
      sort_order: 2,
    },
    {
      user_id: userId,
      name: "Conference Board LEI",
      cycle_type: "leading",
      frequency: "Monthly (~3rd week)",
      source_name: "Conference Board",
      source_url: "https://www.conference-board.org/topics/us-leading-indicators/",
      fred_series_id: null,
      press_release_url: "https://www.conference-board.org/topics/us-leading-indicators/",
      lead_lag_months: "2-20 months",
      threshold_rule:
        "Conference Board's published \"3Ds\" rule: recession signal when 6-month annualized growth < -4.3% and diffusion index <= 50",
      direction_rule_key: "lei_3ds",
      analyst_note:
        "Don't react to a single month's reading — the signal requires both depth and breadth of decline simultaneously. Check which of the ten components are dragging: financial components (yield curve, stock prices) vs real-economy components (permits, claims) — the signal quality differs. Low noise, high signal — probably the single most useful monthly macro report to read in full.",
      sub_indices: [],
      sort_order: 3,
    },
    {
      user_id: userId,
      name: "Initial Jobless Claims",
      cycle_type: "leading",
      frequency: "Weekly (Thursday)",
      source_name: "Dept of Labor",
      source_url: "https://fred.stlouisfed.org/series/ICSA",
      fred_series_id: "ICSA",
      press_release_url: null,
      lead_lag_months: "1-3 months",
      threshold_rule: "4-week MA rising above ~300K = labour deterioration",
      direction_rule_key: "claims_4wk_ma_300k",
      analyst_note:
        "Never trade off a single weekly print. Individual weeks are distorted by holidays, natural disasters, seasonal adjustment errors, and state-level processing backlogs. The 4-week moving average is the only number practitioners use. Confirm with two or more consecutive weeks of 4-week MA movement before drawing conclusions.",
      sub_indices: [],
      sort_order: 4,
    },
    {
      user_id: userId,
      name: "Building Permits",
      cycle_type: "leading",
      frequency: "Monthly (~3rd week)",
      source_name: "US Census Bureau",
      source_url: "https://fred.stlouisfed.org/series/PERMIT1",
      fred_series_id: "PERMIT1",
      press_release_url: null,
      lead_lag_months: "2-4 months",
      threshold_rule: "Sustained decline in single-family permits = construction slowdown ahead",
      direction_rule_key: "permits_3mo_avg",
      analyst_note:
        "The headline number is volatile month-to-month due to multi-family permit lumping (a single large apartment complex permit can swing it). Always separate single-family from multi-family — single-family is the rate-sensitive, leading signal. Look at 3-month averages to smooth weather and local permit-processing delays.",
      sub_indices: [],
      sort_order: 5,
    },
    {
      user_id: userId,
      name: "Consumer Confidence (CB)",
      cycle_type: "leading",
      frequency: "Monthly (last Tuesday)",
      source_name: "Conference Board",
      source_url: "https://www.conference-board.org/topics/consumer-confidence/",
      fred_series_id: null,
      press_release_url: "https://www.conference-board.org/topics/consumer-confidence/",
      lead_lag_months: "2-6 months",
      threshold_rule: "Expectations component leads spending; sharp falls signal upcoming pullback",
      direction_rule_key: "confidence_mom_sign",
      analyst_note:
        "Read Present Situation and Expectations separately — they often diverge. Falling expectations with stable present situation is early-warning; falling present situation confirms deterioration already underway. The \"Plentiful vs Hard to Get\" jobs differential is one of the timeliest labour reads available, ahead of official unemployment data.",
      sub_indices: ["Present Situation", "Expectations"],
      sort_order: 6,
    },
    {
      user_id: userId,
      name: "Univ. of Michigan Sentiment",
      cycle_type: "leading",
      frequency: "Bi-monthly (2 releases)",
      source_name: "Univ. of Michigan",
      source_url: "https://www.sca.isr.umich.edu/",
      fred_series_id: "UMCSENT",
      press_release_url: "https://www.sca.isr.umich.edu/",
      lead_lag_months: "1-4 months",
      threshold_rule: "Correlates with equity prices and petrol prices; 1yr inflation expectations component market-moving",
      direction_rule_key: "umich_mom_or_inflation",
      analyst_note:
        "Preliminary (~2nd Friday) moves markets; final (~last Friday) is rarely a surprise. The 1yr/5yr inflation expectation components are explicitly watched by the Fed. If 5yr expectation rises above ~3%, it signals expectation de-anchoring — a hawkish Fed signal. Don't confuse this survey with Conference Board's — they measure different constructs and can diverge sharply. FRED's copy (UMCSENT) is delayed 1 month at the source's own request; the live source is used for the current month.",
      sub_indices: ["1yr Inflation Expectations", "5yr Inflation Expectations"],
      sort_order: 7,
    },
    {
      user_id: userId,
      name: "Yield Curve (2s10s)",
      cycle_type: "leading",
      frequency: "Daily",
      source_name: "US Treasury / Fed",
      source_url: "https://fred.stlouisfed.org/series/T10Y2Y",
      fred_series_id: "T10Y2Y",
      press_release_url: null,
      lead_lag_months: "6-24 months",
      threshold_rule: "Inversion (below 0) preceded every recession since 1955; not reliable on timing",
      direction_rule_key: "yield_curve_inversion",
      analyst_note:
        "The signal is direction and duration of inversion, not one day's reading — brief intraday inversions are noise. Also watch the 3-month/10-year spread (3m10y), considered by some more reliable since the 3-month rate is more purely anchored to current Fed policy. Curve can stay inverted 12-24 months before a recession arrives — a regime-awareness signal, not a tactical sell trigger.",
      sub_indices: [],
      sort_order: 8,
    },
    {
      user_id: userId,
      name: "S&P 500",
      cycle_type: "leading",
      frequency: "Continuous",
      source_name: "Market",
      source_url: "https://fred.stlouisfed.org/series/SP500",
      fred_series_id: "SP500",
      press_release_url: null,
      lead_lag_months: "6-9 months",
      threshold_rule: "Sustained >20% decline = bear market; typically leads recession by 6-9 months",
      direction_rule_key: "sp500_drawdown_20",
      analyst_note:
        "Noisy as an economic indicator precisely because it moves on non-economic factors constantly. Use as one input in the composite, not standalone — it has \"predicted\" 12 of the last 8 recessions. Most useful combined with credit spread widening and LEI deterioration simultaneously.",
      sub_indices: [],
      sort_order: 9,
    },
    {
      user_id: userId,
      name: "Baltic Dry Index (BDI)",
      cycle_type: "leading",
      frequency: "Daily",
      source_name: "Baltic Exchange",
      source_url: "https://www.balticexchange.com/en/data-services/market-information0/indices.html",
      fred_series_id: null,
      press_release_url: null,
      lead_lag_months: "3-6 months",
      threshold_rule: "Rapid collapse signals global trade contraction ahead; no speculative distortion",
      direction_rule_key: "bdi_decline_30pct",
      analyst_note:
        "Particularly relevant for Singapore investors given the STI's trade-finance exposure. Track the trend over weeks. Distinguish Capesize (iron ore/coal, China steel demand), Panamax (grain/coal), and Supramax (diverse bulk) sub-indices. NOTE: no free automated source was found during implementation — the Baltic Exchange's own API is subscription-only and there is no free press release carrying the headline number. This row will show \"Data unavailable\" until a paid source is wired in.",
      sub_indices: ["Capesize", "Panamax", "Supramax"],
      sort_order: 10,
    },
    {
      user_id: userId,
      name: "TIPS Breakeven (5y, 10y)",
      cycle_type: "leading",
      frequency: "Daily",
      source_name: "Fed / Treasury",
      source_url: "https://fred.stlouisfed.org/series/T5YIE",
      fred_series_id: "T5YIE",
      press_release_url: null,
      lead_lag_months: "Forward-looking",
      threshold_rule: "Market's inflation expectation",
      direction_rule_key: "na_non_monotonic",
      analyst_note:
        "The most direct real-time read on where the market thinks inflation will average. 5-year breakeven is more volatile/near-term; 10-year is more structural. A rising 10-year breakeven signals inflation becoming entrenched — a hawkish Fed input. FRED series T5YIE / T10YIE. No direction badge shown — non-monotonic, both too-low and too-high readings are bad, so a simple up/down badge would misrepresent it.",
      sub_indices: [],
      sort_order: 11,
    },
    // ----------------------------------------------------------- Coincident
    {
      user_id: userId,
      name: "Nonfarm Payrolls (NFP)",
      cycle_type: "coincident",
      frequency: "Monthly (1st Friday)",
      source_name: "Bureau of Labor Statistics",
      source_url: "https://fred.stlouisfed.org/series/PAYEMS",
      fred_series_id: "PAYEMS",
      press_release_url: null,
      lead_lag_months: "Concurrent",
      threshold_rule: "Beat = expansion signal; miss = slowdown signal",
      direction_rule_key: "nfp_3mo_avg",
      analyst_note:
        "Headline is revised twice in the following two months, often by ±50,000 or more — don't over-react to a single print. Read Average Hourly Earnings alongside the headline: strong jobs + rising wages is more hawkish than strong jobs + flat wages. Direction here uses an absolute 3-month average level (no consensus/forecast data is wired in) rather than beat/miss vs estimate.",
      sub_indices: ["Average Hourly Earnings", "Participation Rate"],
      sort_order: 12,
    },
    {
      user_id: userId,
      name: "Industrial Production Index",
      cycle_type: "coincident",
      frequency: "Monthly (~mid-month)",
      source_name: "Federal Reserve",
      source_url: "https://fred.stlouisfed.org/series/INDPRO",
      fred_series_id: "INDPRO",
      press_release_url: null,
      lead_lag_months: "Concurrent",
      threshold_rule: "Declining 2+ months = real-time contraction; Capacity Utilisation >80% = inflationary (contested heuristic, see analyst note)",
      direction_rule_key: "ip_2mo_decline",
      analyst_note:
        "Rarely market-moving alone — treated as confirmation, not surprise. Most useful for sector-level analysis. The >80% capacity-utilization \"inflationary\" threshold is widely repeated in financial commentary, but the Chicago Fed's own published research disputes it as a reliable aggregate-economy predictor — kept here as context only, not folded into the direction logic.",
      sub_indices: ["Manufacturing", "Mining", "Utilities"],
      sort_order: 13,
    },
    {
      user_id: userId,
      name: "Personal Income & Spending",
      cycle_type: "coincident",
      frequency: "Monthly (last week)",
      source_name: "Bureau of Economic Analysis",
      source_url: "https://fred.stlouisfed.org/series/DSPIC96",
      fred_series_id: "DSPIC96",
      press_release_url: null,
      lead_lag_months: "Concurrent",
      threshold_rule: "Real income negative = unsustainable spending without savings draw-down",
      direction_rule_key: "real_income_yoy",
      analyst_note:
        "This release also contains the PCE deflator — the Fed's preferred inflation measure — so it doubles as both the consumer-spending and the official-inflation read. Declining savings rate (collapsed from ~8% in 2021 to ~3.5% by 2026) means consumers are drawing down savings to sustain spending despite flat real income — a late-cycle warning sign.",
      sub_indices: ["PCE Deflator", "Personal Savings Rate"],
      sort_order: 14,
    },
    {
      user_id: userId,
      name: "Manufacturing & Trade Sales",
      cycle_type: "coincident",
      frequency: "Monthly",
      source_name: "US Census Bureau",
      source_url: "https://fred.stlouisfed.org/series/CMRMTSPL",
      fred_series_id: "CMRMTSPL",
      press_release_url: null,
      lead_lag_months: "Concurrent",
      threshold_rule: "Decline across all three (mfg/wholesale/retail) = broadest real-time contraction signal",
      direction_rule_key: "mts_decline",
      analyst_note:
        "Lower-profile than NFP/PMI but one of the four indicators NBER officially uses to date recessions. Its value is as a cross-check against PMI/industrial production — if PMI suggests expansion but sales are declining, the discrepancy warrants investigation. CMRMTSPL is the combined real manufacturing+trade sales series; component-level mfg/wholesale/retail breakdown isn't separately wired in.",
      sub_indices: ["Wholesale Inventory/Sales Ratio"],
      sort_order: 15,
    },
    // -------------------------------------------------------------- Lagging
    {
      user_id: userId,
      name: "Unemployment Rate",
      cycle_type: "lagging",
      frequency: "Monthly (1st Friday, with NFP)",
      source_name: "Bureau of Labor Statistics",
      source_url: "https://fred.stlouisfed.org/series/UNRATE",
      fred_series_id: "UNRATE",
      press_release_url: null,
      lead_lag_months: "-3 to -6 months",
      threshold_rule: "Lags cycle turns; Sahm Rule (0.5pp rise from 12-month low) = timelier signal",
      direction_rule_key: "sahm_rule",
      analyst_note:
        "The headline rate is the most lagging major indicator — by the time it peaks, recovery is typically already underway. Direction uses FRED's own pre-computed Sahm Rule series (SAHMREALTIME) rather than recomputing the 12-month-low logic locally. Also watch U-6 underemployment (more sensitive to cycle turns than headline U-3).",
      sub_indices: ["U-3", "U-6"],
      sort_order: 16,
    },
    {
      user_id: userId,
      name: "Prime Lending Rate",
      cycle_type: "lagging",
      frequency: "As changed",
      source_name: "Wall Street Journal survey",
      source_url: "https://fred.stlouisfed.org/series/DPRIME",
      fred_series_id: "DPRIME",
      press_release_url: null,
      lead_lag_months: "Concurrent to lagging",
      threshold_rule: "Fed Funds + 3%; confirms tightening/easing already implemented",
      direction_rule_key: "rate_change_direction",
      analyst_note:
        "Not market-moving — everyone knows it mechanically follows Fed Funds. Practical value is as the reference rate for consumer/floating-rate loan pricing. For Singapore, the equivalent reference is SORA, not this US-only convention.",
      sub_indices: [],
      sort_order: 17,
    },
    {
      user_id: userId,
      name: "C&I Loan Volume",
      cycle_type: "lagging",
      frequency: "Weekly (H.8 release)",
      source_name: "Federal Reserve",
      source_url: "https://fred.stlouisfed.org/series/BUSLOANS",
      fred_series_id: "BUSLOANS",
      press_release_url: null,
      lead_lag_months: "-2 to -4 months",
      threshold_rule: "Peaks after expansion tops; bottoms after recovery begins",
      direction_rule_key: "yoy_growth_direction",
      analyst_note:
        "Released every Friday on the Fed's H.8 release — one of the least-read but most informative weekly Fed publications. Track YoY growth rate, not absolute level. Slowing C&I loan growth is a direct headwind to net interest income for commercial lenders (DBS, OCBC, JPMorgan).",
      sub_indices: [],
      sort_order: 18,
    },
    {
      user_id: userId,
      name: "Consumer Price Index (CPI)",
      cycle_type: "lagging",
      frequency: "Monthly (~2nd week)",
      source_name: "Bureau of Labor Statistics",
      source_url: "https://fred.stlouisfed.org/series/CPILFESL",
      fred_series_id: "CPILFESL",
      press_release_url: null,
      lead_lag_months: "-1 to -3 months",
      threshold_rule: "Reflects prior months' conditions; shelter component lags market rents by 12-18 months",
      direction_rule_key: "cpi_supercore",
      analyst_note:
        "Most market-moving of the lagging indicators — Fed targets PCE, but CPI dominates headlines. NOTE: there is no single official FRED series for \"supercore\" (core services ex-shelter); this uses Core CPI (CPILFESL, ex food & energy) as the closest available proxy, which is a coarser cut than the supercore concept described in the original analyst note. A beat driven by energy is less hawkish than one driven by services.",
      sub_indices: [],
      sort_order: 19,
    },
  ];

  const { error: insertError } = await supabase.from("macro_indicators").insert(rows);
  if (insertError) throw new Error(insertError.message);

  console.log(`Seeded ${rows.length} macro indicators.`);
}

main();
