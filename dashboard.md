### Status

Design is resolved as of 2026-06-22. The original task brief below (Sections 1–4) is kept for reference but is **superseded** by the "Resolved Decisions" and "Indicators & Direction Logic" sections — implement against those, not the original brief.

---

### Resolved Decisions

**No hardcoded/mock data.** The original brief asked to hardcode 19 indicators with "realistic June 2026" numbers and call it production-ready. Rejected — see schema below. Real values come from a fetch pipeline (FRED covers actuals for nearly all of these), not constants in a `.tsx` file.

**No forecast/consensus column.** There's no reliable free API for consensus estimates (real ones are a commercial product — Trading Economics, Bloomberg, Econoday), and manual entry was explicitly ruled out. The "Predicted/Model Target" column from the original brief is dropped entirely. Layout is now just:

- **Indicator name**, with cycle type / release cadence / source as sub-text underneath.
- **Actual (latest)** and **Previous** values, right-aligned.
- A **Stat Direction** indicator — not "sentiment badge" (that name is already used elsewhere in this app for news-item tone with different semantics; renamed to avoid confusion).

**Stat Direction, not Sentiment Badge.** Component: `StatDirectionBadge`. Value: `"up" | "down" | null`. Renders a green/red marker, or nothing at all when `null` (genuinely not deducible — see table below, marked N/A rather than guessed).

**Click-through is resolved, not ambiguous.** Every row opens an internal detail view (cycle type, threshold rule, lead/lag window, the analyst note below). The external source link (ismworld.org, FRED, etc.) lives inside that detail view as a separate link, not as the row's click target.

**Schema (new tables, flagging per this repo's no-uninstructed-schema-change rule — needs confirmation before migrating):**

```sql
create table macro_indicators (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  name text not null,                          -- "ISM Manufacturing PMI"
  cycle_type text not null check (cycle_type in ('leading', 'coincident', 'lagging')),
  frequency text not null,                      -- "Monthly (1st business day)", "Weekly (Thursday)", ...
  source_name text not null,                    -- "Institute for Supply Management"
  source_url text not null,                     -- ismworld.org / fred.stlouisfed.org / ...
  fred_series_id text,                          -- e.g. "MANEMP"; null if not on FRED
  lead_lag_months text,                         -- "1–3 months", "Concurrent", "−3 to −6 months"
  threshold_rule text not null,                 -- free text: ">50 expanding, <45 recession risk"
  analyst_note text,                            -- long-form practitioner note, shown in detail view
  sub_indices text[],                           -- ["New Orders", "Employment"]
  sort_order int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table macro_indicator_readings (
  id uuid primary key default gen_random_uuid(),
  indicator_id uuid not null references macro_indicators(id),
  user_id uuid not null references users(id),
  period_date date not null,                    -- period this reading covers, e.g. 2026-06-01
  actual_value numeric,
  previous_value numeric,                       -- prior period's actual ("Previous" column)
  released_at timestamptz,
  direction text check (direction in ('up', 'down')),  -- null = N/A, computed per the rules below
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (indicator_id, period_date)
);
```

---

### Indicators & Direction Logic

19 indicators total (the original brief's heading said 16, which didn't match its own list or Section 4 — corrected). For each, `direction` is computed from `actual_value` (and, where noted, a rolling window of prior readings) — **18 of 19 are deducible**; only TIPS Breakeven is structurally N/A (explained below). Two others (NFP, CPI) fall to N/A only in their narrow dead-zone.

#### Leading Indicators

| Indicator | Frequency | Source | Lead/Lag | Threshold rule | Direction logic | Analyst note |
|---|---|---|---|---|---|---|
| ISM Manufacturing PMI | Monthly (1st business day) | Institute for Supply Management | 1–3 months | >50 = expanding; <45 sustained = recession risk; watch New Orders sub-index | `actual ≥ 50` → up, else down | Read the full report, not just the headline — New Orders and Employment sub-indices often diverge from the composite and carry more forward signal. Flash PMIs (S&P Global) release ~1 week earlier and give an advance read; the ISM final is the definitive number. Market-moving on release day; one data point alone is noise, a trend over 3+ months is signal. |
| ISM Services PMI | Monthly (3rd business day) | Institute for Supply Management | 1–2 months | Same 50 threshold; services is ~70% of US GDP — often diverges from manufacturing | `actual ≥ 50` → up, else down | Read alongside manufacturing PMI — divergence between the two (services strong, manufacturing weak) is common in post-pandemic cycles and doesn't automatically signal recession. Prices Paid sub-index within ISM Services is a supplementary inflation read the Fed monitors closely. |
| Conference Board LEI | Monthly (~3rd week) | Conference Board | 2–20 months | Conference Board's published "3Ds" rule: recession signal when 6-month annualized growth < −4.3% **and** diffusion index ≤50 *(corrected — original brief's "3+ consecutive declines" was an inaccurate paraphrase of this)* | down if 6-month annualized growth < −4.3% **and** diffusion ≤50; else up (rolling window over readings, not a single row) — **sourced**, exact official methodology | Don't react to a single month's reading — the signal requires both depth and breadth of decline simultaneously. Check which of the ten components are dragging: financial components (yield curve, stock prices) vs real-economy components (permits, claims) — the signal quality differs. Low noise, high signal — probably the single most useful monthly macro report to read in full. |
| Initial Jobless Claims | Weekly (Thursday) | Dept of Labor | 1–3 months | 4-week MA rising above ~300K = labour deterioration | down if 4-week MA rising and crosses ~300K; else up (rolling 4-week window) | Never trade off a single weekly print. Individual weeks are distorted by holidays, natural disasters, seasonal adjustment errors, and state-level processing backlogs. The 4-week moving average is the only number practitioners use. Confirm with two or more consecutive weeks of 4-week MA movement before drawing conclusions. |
| Building Permits | Monthly (~3rd week) | US Census Bureau | 2–4 months | Sustained decline in single-family permits = construction slowdown ahead | down if single-family permits' 3-month average is falling; else up | The headline number is volatile month-to-month due to multi-family permit lumping (a single large apartment complex permit can swing it). Always separate single-family from multi-family — single-family is the rate-sensitive, leading signal. Look at 3-month averages to smooth weather and local permit-processing delays. |
| Consumer Confidence (CB) | Monthly (last Tuesday) | Conference Board | 2–6 months | Expectations component leads spending; sharp falls signal upcoming pullback | down if Expectations sub-index falls MoM; up if it rises *(judgment call: simple MoM sign, since "sharp" has no defined magnitude in source data)* | Read Present Situation and Expectations separately — they often diverge. Falling expectations with stable present situation is early-warning; falling present situation confirms deterioration already underway. The "Plentiful vs Hard to Get" jobs differential is one of the timeliest labour reads available, ahead of official unemployment data. |
| Univ. of Michigan Sentiment | Bi-monthly (2 releases) | Univ. of Michigan | 1–4 months | Correlates with equity prices and petrol prices; 1yr inflation expectations component market-moving | down if headline falls MoM **or** 5yr inflation expectation > 3%; else up | Preliminary (~2nd Friday) moves markets; final (~last Friday) is rarely a surprise. The 1yr/5yr inflation expectation components are explicitly watched by the Fed. If 5yr expectation rises above ~3%, it signals expectation de-anchoring — a hawkish Fed signal. Don't confuse this survey with Conference Board's — they measure different constructs and can diverge sharply. |
| Yield Curve (2s10s) | Daily | US Treasury / Fed | 6–24 months | Inversion (below 0) preceded every recession since 1955; not reliable on timing | `actual ≥ 0` → up, else down | The signal is direction and duration of inversion, not one day's reading — brief intraday inversions are noise. Also watch the 3-month/10-year spread (3m10y), considered by some more reliable since the 3-month rate is more purely anchored to current Fed policy. Curve can stay inverted 12–24 months before a recession arrives — a regime-awareness signal, not a tactical sell trigger. |
| S&P 500 | Continuous | Market | 6–9 months | Sustained >20% decline = bear market; typically leads recession by 6–9 months | down if sustained >20% drawdown from rolling peak; else up (needs running peak tracked across readings) | Noisy as an economic indicator precisely because it moves on non-economic factors constantly. Use as one input in the composite, not standalone — it has "predicted" 12 of the last 8 recessions. Most useful combined with credit spread widening and LEI deterioration simultaneously. |
| Baltic Dry Index (BDI) | Daily | Baltic Exchange | 3–6 months | Rapid collapse signals global trade contraction ahead; no speculative distortion | down if ≥30% decline over trailing 6–8 weeks; else up | Particularly relevant for Singapore investors given the STI's trade-finance exposure. Daily moves are volatile (vessel supply imbalances on specific routes) — track the trend over weeks. Distinguish Capesize (iron ore/coal, dominated by China steel demand — most economically significant), Panamax (grain/coal), and Supramax (diverse bulk) sub-indices. |
| TIPS Breakeven (5y, 10y) | Daily | Fed / Treasury | Forward-looking | Market's inflation expectation | **N/A** — non-monotonic; too-low (deflation/recession fear) and too-high (un-anchored inflation) are both bad, so a simple up/down badge would misrepresent a "sweet spot in the middle" signal | The most direct real-time read on where the market thinks inflation will average. 5-year breakeven is more volatile/near-term; 10-year is more structural. A rising 10-year breakeven signals inflation becoming entrenched — a hawkish Fed input. FRED series T5YIE / T10YIE. The 5y vs 5y5y-forward spread isolates near-term vs medium-term expectations. |

#### Coincident Indicators

| Indicator | Frequency | Source | Lead/Lag | Threshold rule | Direction logic | Analyst note |
|---|---|---|---|---|---|---|
| Nonfarm Payrolls (NFP) | Monthly (1st Friday) | Bureau of Labor Statistics | Concurrent | Beat = expansion signal; miss = slowdown signal | down if 3-month average payroll growth < ~75K; up if > ~150K; between → N/A *(redefined from beat/miss-vs-consensus, since no forecast data exists — see Average Hourly Earnings note for secondary context)* | Headline is revised twice in the following two months, often by ±50,000 or more — don't over-react to a single print. Read Average Hourly Earnings alongside the headline: strong jobs + rising wages is more hawkish than strong jobs + flat wages. Rising participation rate alongside rising unemployment can be a healthy combination, not alarming. |
| Industrial Production Index | Monthly (~mid-month) | Federal Reserve | Concurrent | Declining 2+ months = real-time contraction; Capacity Utilisation >80% = inflationary *(the >80% figure is downgraded to judgment call below — Chicago Fed's own published research says this aggregate-economy threshold isn't actually a reliable predictor and varies by industry)* | down if production declines 2+ consecutive months; else up — judgment call (cap. utilization >80% kept only as a separate contextual flag, not folded into direction, given the research above) | Rarely market-moving alone — treated as confirmation, not surprise. Most useful for sector-level analysis: manufacturing, mining, and utilities sub-indices move independently. Utilities spiking in summer/winter is seasonal, not growth signal. Mining is a direct read on domestic energy/materials output. |
| Personal Income & Spending | Monthly (last week) | Bureau of Economic Analysis | Concurrent | Real income negative = unsustainable spending without savings draw-down | down if real income YoY growth is negative; else up *(simplified to the one headline condition; savings-rate trend kept as supplementary context, not primary)* | Also contains the PCE deflator — the Fed's preferred inflation measure — so this report doubles as both the consumer-spending and the official-inflation read. Declining savings rate (collapsed from ~8% in 2021 to ~3.5% by 2026) means consumers are drawing down savings to sustain spending despite flat real income — a late-cycle warning sign. |
| Manufacturing & Trade Sales | Monthly | US Census Bureau | Concurrent | Decline across all three (mfg/wholesale/retail) = broadest real-time contraction signal | down if all three components declining 2+ months; else up | Lower-profile than NFP/PMI but one of the four indicators NBER officially uses to date recessions. Its value is as a cross-check against PMI/industrial production — if PMI suggests expansion but sales are declining, the discrepancy warrants investigation. Rising wholesale inventory/sales ratio can foreshadow future production cuts. |

#### Lagging Indicators

| Indicator | Frequency | Source | Lead/Lag | Threshold rule | Direction logic | Analyst note |
|---|---|---|---|---|---|---|
| Unemployment Rate | Monthly (1st Friday, with NFP) | Bureau of Labor Statistics | −3 to −6 months | Lags cycle turns; Sahm Rule (0.5pp rise from 12-month low) = timelier signal | down if current rate ≥0.5pp above trailing 12-month low (Sahm Rule); else up (rolling 12-month window) | The headline rate is the most lagging major indicator — by the time it peaks, recovery is typically already underway. Also watch U-6 underemployment (more sensitive to cycle turns than headline U-3) — the U-3/U-6 gap narrowing signals genuine tightening, widening signals deteriorating quality of employment even if headline is stable. |
| Prime Lending Rate | As changed | Wall Street Journal survey | Concurrent to lagging | Fed Funds + 3%; confirms tightening/easing already implemented | down on a hike, up on a cut, **N/A** if unchanged *(direction-of-change; no forced guess when nothing happened)* | Not market-moving — everyone knows it mechanically follows Fed Funds. Practical value is as the reference rate for consumer/floating-rate loan pricing. For Singapore, the equivalent reference is SORA, not this US-only convention. |
| C&I Loan Volume | Weekly (H.8 release) | Federal Reserve | −2 to −4 months | Peaks after expansion tops; bottoms after recovery begins | down if YoY growth decelerating; up if accelerating | Released every Friday on the Fed's H.8 release — one of the least-read but most informative weekly Fed publications. Track YoY growth rate, not absolute level. Slowing C&I loan growth is a direct headwind to net interest income for commercial lenders (DBS, OCBC, JPMorgan) — relevant for bank equity analysis. |
| Consumer Price Index (CPI) | Monthly (~2nd week) | Bureau of Labor Statistics | −1 to −3 months | Reflects prior months' conditions; shelter component lags market rents by 12–18 months | down if "supercore" (core services ex-shelter) YoY > 3%; up if < 2.5%; between → N/A *(judgment-call cutoff, but uses your own emphasis on supercore over headline)* | Most market-moving of the lagging indicators — Fed targets PCE, but CPI dominates headlines. Break down into: (1) supercore — the sticky-inflation measure the Fed watches most, (2) shelter — ignore for real-time signal due to the 12–18 month lag, (3) energy — volatile, supply-driven, strip for underlying trend. A beat driven by energy is less hawkish than one driven by services. |

---

### Final Decisions (2026-06-22) — build against this, nothing above is still open

1. **Schema approved.** `macro_indicators` and `macro_indicator_readings` as specified above. Proceed with migration.
2. **Nav placement.** Desktop top nav gets a 6th item. Mobile bottom bar stays at its existing 5 slots — this page is reachable on mobile via a link inside Settings, not by replacing a tab.
3. **FRED-failure state.** If a FRED (or press-release extraction) call returns no data or fails, the row's value renders as "Data unavailable", styled grey/muted. Never hide the row, never fabricate a value.
4. **Rolling-window backfill.** Every indicator whose direction logic needs a window (4-week MA, 3-month average, rolling peak, Sahm Rule 12-month low, LEI's 6-month annualized rate/diffusion, etc.) backfills historical readings from the source's own history on first load, so the window is populated immediately — no broken/fabricated values during a "warm-up" period.
5. **Loading/empty/error states** follow the same `loading.tsx` / error-boundary pattern already established for every other route in Phase 6c — not a one-off.
6. **Mobile layout** — name + sub-text on the left, Actual/Previous + `StatDirectionBadge` on the right works as one row at desktop width; at 375px the two value columns stack under the name (same pattern as the rest of the app's Phase 6c mobile pass).

### Non-FRED data sources (resolved — none require manual entry)

| Indicator | Source | Notes |
|---|---|---|
| ISM Manufacturing PMI | ismworld.org monthly press release (mirrored on PRNewswire) | FRED dropped all ISM series in June 2016 over licensing — this press release is the only free path. No JSON API; headline % stated in a consistent sentence pattern. |
| ISM Services PMI | Same — ismworld.org press release | Same pattern, services report. |
| Conference Board LEI | conference-board.org monthly press release (mirrored on PRNewswire) | Headline level + % change stated directly in the release text. |
| Conference Board Consumer Confidence | conference-board.org monthly press release (mirrored on PRNewswire) | Headline index value stated directly. |
| UMich Consumer Sentiment | FRED series `UMCSENT` for history/backfill, **but** delayed 1 month at the source's own request. Same-day number is published free at sca.isr.umich.edu and in financial press ahead of FRED's mirror. | Use FRED for backfill, the live source for the current month. |

None of these have a structured API — all are free press releases/pages. Rather than CSS-selector scraping (fragile, breaks on layout changes), reuse this app's existing AI extraction pipeline pointed at the release text each month with a small "extract the headline number" prompt — it already has retry/backoff and error logging built in. On extraction failure: "Data unavailable" per decision 3 above, never manual, never fabricated.

### Threshold sourcing audit

Every direction-logic threshold in the table above, split by whether it's a real official methodology/convention or a judgment call I made. Two corrections came out of this pass: Conference Board LEI's rule was a paraphrase and has been corrected to the actual published "3Ds" rule (−4.3% six-month annualized growth **and** diffusion ≤50) in the table above; Industrial Production's ">80% = inflationary" has been downgraded to judgment call since the Chicago Fed's own research disputes it as a reliable aggregate threshold.

**Sourced — official methodology or universal convention:**

| Indicator | Number | Source |
|---|---|---|
| ISM Mfg/Services PMI | 50 = expansion/contraction breakeven | Literal diffusion-index construction (ISM's own methodology) |
| Conference Board LEI | 6-month annualized rate < −4.3% and diffusion ≤50 | Conference Board's published "3Ds" recession-signal rule |
| Yield Curve (2s10s) | Inversion < 0 | Definitional; empirical relationship documented in Fed research |
| S&P 500 | >20% decline = bear market | Universal index-provider/Wall Street convention |
| Unemployment Rate | 0.5pp rise from 12-month low (Sahm Rule) | Named rule, exact academic definition (Claudia Sahm); published on FRED as `SAHMREALTIME` |
| Prime Lending Rate | Prime = Fed Funds + 3% | Mechanical/definitional (WSJ Prime Rate convention) |
| Manufacturing & Trade Sales | Relevance as a recession-dating input | NBER officially uses this series as one of its 4 coincident recession-dating indicators |

**Judgment call — no official source, flagged so it can be overridden later:**

| Indicator | Number | Why |
|---|---|---|
| Initial Jobless Claims | ~300K on the 4-week MA | Commonly cited market level, not an official DOL threshold; drifts with labor-force size over time |
| Building Permits | 3-month average, declining | Chosen window; Census Bureau doesn't define one |
| Consumer Confidence (CB) | MoM sign of Expectations sub-index | "Sharp falls" in the original note has no defined magnitude |
| UMich Sentiment | 5yr inflation expectation > 3% | Informed by the Fed's 2% target and Fed commentary on this series, but no single canonical cutoff |
| Baltic Dry Index | ≥30% decline over 6–8 weeks | Picked the floor of the practitioner note's "30–40%" range |
| NFP | 3-mo avg payroll growth <75K (down) / >150K (up) | Invented to replace the forecast-dependent original rule |
| Industrial Production | Capacity utilization >80% = inflationary | Downgraded — Chicago Fed's own research disputes this as a clean threshold |
| Personal Income & Spending | Real income YoY < 0 | Directionally sound economics, no official threshold body |
| Manufacturing & Trade Sales | "2+ months declining across all three" | The series' relevance is NBER-sourced (above); this specific operationalization is mine |
| C&I Loan Volume | Accelerating/decelerating YoY | No numeric cutoff at all — pure sign-of-trend, lowest-risk judgment call since no arbitrary number is involved |
| CPI | Supercore YoY >3% (down) / <2.5% (up) | My own cutoffs |

**Not applicable:** TIPS Breakeven (no direction computed, per the N/A decision already made).
