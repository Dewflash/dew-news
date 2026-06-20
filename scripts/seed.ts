/**
 * Phase 2a seed data script (SPEC.md Section 16).
 *
 * Idempotent: deletes previously-seeded rows for this user before
 * re-inserting, so it can be re-run freely during UI development.
 * Does not touch `users`, `settings`, or the Phase 1 "Reuters Newsletter"
 * source — only adds a second source alongside it.
 *
 * Run with: npm run seed
 */
import { createServiceClient } from "../lib/supabase/server";
import type {
  EntitiesInsert,
  EntityType,
  ConflictsInsert,
  CorrelationsInsert,
  CorrelationDirection,
  Sentiment,
  Significance,
  ItemSentence,
  SummariesInsert,
} from "../types/database";

const EMAIL = "dewlearns@gmail.com";

function isoDate(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function isoDateTime(daysAgo: number, hour: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).length;
}

function readingTimeSeconds(text: string): number {
  return Math.ceil(wordCount(text) / 200);
}

function sentencesFromParagraph(paragraph: string): ItemSentence[] {
  return paragraph
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean)
    .map((text, index) => ({ index, text }));
}

// ---------------------------------------------------------------------------
// Entities (Section 11.1 mandates CEG, Gold/XAU, MAS, Fed, STI on the static
// watchlist — the rest exist purely to give items realistic variety).
// ---------------------------------------------------------------------------
const ENTITY_DEFS: Array<
  Pick<EntitiesInsert, "name" | "type" | "ticker" | "exchange" | "gics_sector" | "aliases">
> = [
  { name: "CEG", type: "equity", ticker: "CEG", exchange: "NASDAQ", gics_sector: "Utilities", aliases: ["Constellation Energy"] },
  { name: "Gold", type: "commodity", ticker: "XAU", exchange: "COMEX", gics_sector: null, aliases: ["XAU/USD", "Gold Spot"] },
  { name: "Federal Reserve", type: "institution", ticker: null, exchange: null, gics_sector: null, aliases: ["Fed", "FOMC"] },
  { name: "MAS", type: "institution", ticker: null, exchange: null, gics_sector: null, aliases: ["Monetary Authority of Singapore"] },
  { name: "STI", type: "index", ticker: "STI", exchange: "SGX", gics_sector: null, aliases: ["Straits Times Index", "SGX Composite Index"] },
  { name: "Brent Crude", type: "commodity", ticker: "BRENT", exchange: "ICE", gics_sector: null, aliases: ["crude oil", "oil"] },
  { name: "TSMC", type: "equity", ticker: "TSM", exchange: "NYSE", gics_sector: "Information Technology", aliases: ["Taiwan Semiconductor"] },
  { name: "US 10-Year Treasury", type: "other", ticker: "US10Y", exchange: null, gics_sector: null, aliases: ["10-year Treasury", "UST 10Y"] },
  { name: "Copper", type: "commodity", ticker: "HG", exchange: "COMEX", gics_sector: null, aliases: [] },
  { name: "Nvidia", type: "equity", ticker: "NVDA", exchange: "NASDAQ", gics_sector: "Information Technology", aliases: ["NVIDIA Corp"] },
  { name: "USD", type: "currency", ticker: "DXY", exchange: null, gics_sector: null, aliases: ["US Dollar", "Dollar Index"] },
];

const WATCHLIST_DEFS: Array<{
  entity: string;
  priority: number;
  alert_threshold: number;
  notes: string;
}> = [
  { entity: "CEG", priority: 0, alert_threshold: 2, notes: "core position" },
  { entity: "Gold", priority: 1, alert_threshold: 2, notes: "macro hedge, watching for entry" },
  { entity: "MAS", priority: 2, alert_threshold: 2, notes: "policy watch" },
  { entity: "Federal Reserve", priority: 3, alert_threshold: 2, notes: "policy watch" },
  { entity: "STI", priority: 4, alert_threshold: 1, notes: "home market benchmark" },
];

// ---------------------------------------------------------------------------
// Items (Section 16: 20 items, 14-day spread, 8+ categories, 3+ watchlist
// mentions, 1+ conflict pair, 1+ correlation pair, 2+ significance=3,
// 2+ sources).
// ---------------------------------------------------------------------------
type SourceKey = "reuters" | "bloomberg";

interface ItemDef {
  daysAgo: number;
  source: SourceKey;
  summary: string;
  fullContext: string;
  significance: Significance;
  sentiment: Sentiment;
  sentimentReasoning: string;
  gicsSector: string | null;
  secondaryCategories: string[];
  entities: Array<{ name: string; relevance: "primary" | "secondary" | "contextual" }>;
}

const ITEM_DEFS: ItemDef[] = [
  {
    daysAgo: 13, source: "reuters",
    summary: "Federal Reserve signals likely rate cuts in Q3 amid cooling inflation data.",
    fullContext: "Federal Reserve signals likely rate cuts in Q3 amid cooling inflation data. Several FOMC members pointed to softening core PCE readings as justification. Markets priced in two cuts by year-end following the remarks.",
    significance: 3, sentiment: "bullish",
    sentimentReasoning: "Rate cut signals are broadly supportive of risk assets and bond prices.",
    gicsSector: null, secondaryCategories: ["Macro & Central Banks"],
    entities: [{ name: "Federal Reserve", relevance: "primary" }],
  },
  {
    daysAgo: 12, source: "reuters",
    summary: "Gold rallies to a multi-month high on safe-haven demand amid Middle East tensions.",
    fullContext: "Gold rallies to a multi-month high on safe-haven demand amid Middle East tensions. Spot prices broke through key resistance as investors sought shelter from escalating regional conflict. Analysts flagged central bank buying as an additional tailwind.",
    significance: 3, sentiment: "bullish",
    sentimentReasoning: "Safe-haven flows and central bank accumulation are pushing gold higher.",
    gicsSector: "Materials", secondaryCategories: ["Markets & Commodities", "Geopolitics & Trade"],
    entities: [{ name: "Gold", relevance: "primary" }],
  },
  {
    daysAgo: 11, source: "bloomberg",
    summary: "Constellation Energy announces new small modular reactor partnership.",
    fullContext: "Constellation Energy announces new small modular reactor partnership. The deal pairs CEG with a leading SMR developer to co-locate new nuclear capacity at an existing plant site. Management framed it as core to meeting surging data-centre power demand.",
    significance: 2, sentiment: "bullish",
    sentimentReasoning: "New generation capacity tied to AI power demand supports the long-term growth thesis.",
    gicsSector: "Utilities", secondaryCategories: ["Sustainability & ESG"],
    entities: [{ name: "CEG", relevance: "primary" }],
  },
  {
    daysAgo: 10, source: "reuters",
    summary: "Oil prices spike 4% on Middle East supply disruption fears.",
    fullContext: "Oil prices spike 4% on Middle East supply disruption fears. Brent crude jumped after reports of shipping disruptions near a key strait. Traders are watching for further escalation that could tighten global supply.",
    significance: 3, sentiment: "bullish",
    sentimentReasoning: "Supply disruption risk is pushing crude prices sharply higher.",
    gicsSector: "Energy", secondaryCategories: ["Markets & Commodities", "Geopolitics & Trade"],
    entities: [{ name: "Brent Crude", relevance: "primary" }],
  },
  {
    daysAgo: 10, source: "bloomberg",
    summary: "Airline stocks slide as fuel costs climb on the oil price surge.",
    fullContext: "Airline stocks slide as fuel costs climb on the oil price surge. Carriers with the least fuel hedging fell hardest in early trading. Analysts warned margin guidance may need to be revised if crude stays elevated.",
    significance: 2, sentiment: "bearish",
    sentimentReasoning: "Higher jet fuel costs directly pressure airline operating margins.",
    gicsSector: "Industrials", secondaryCategories: ["Markets & Commodities"],
    entities: [],
  },
  {
    daysAgo: 9, source: "reuters",
    summary: "Singapore's Straits Times Index closes flat as investors digest mixed earnings.",
    fullContext: "Singapore's Straits Times Index closes flat as investors digest mixed earnings. Bank stocks offset weakness in REITs. Trading volume remained light ahead of the central bank's policy statement.",
    significance: 1, sentiment: "neutral",
    sentimentReasoning: "Gains and losses across sectors broadly offset each other.",
    gicsSector: null, secondaryCategories: ["Markets & Commodities"],
    entities: [{ name: "STI", relevance: "primary" }],
  },
  {
    daysAgo: 9, source: "bloomberg",
    summary: "MAS holds monetary policy stance steady, citing balanced growth and inflation outlook.",
    fullContext: "MAS holds monetary policy stance steady, citing balanced growth and inflation outlook. The central bank kept the S$NEER policy band unchanged for a third straight review. Economists see little urgency to shift before year-end.",
    significance: 2, sentiment: "neutral",
    sentimentReasoning: "An unchanged policy stance signals confidence in the current growth-inflation balance.",
    gicsSector: null, secondaryCategories: ["Macro & Central Banks", "Policy & Regulation"],
    entities: [{ name: "MAS", relevance: "primary" }],
  },
  {
    daysAgo: 8, source: "reuters",
    summary: "TSMC reports record quarterly revenue on surging AI chip demand.",
    fullContext: "TSMC reports record quarterly revenue on surging AI chip demand. Advanced node capacity remains sold out through next year. Management raised full-year capex guidance to keep pace with orders.",
    significance: 2, sentiment: "bullish",
    sentimentReasoning: "Record revenue and raised guidance point to durable AI-driven demand.",
    gicsSector: "Information Technology", secondaryCategories: [],
    entities: [{ name: "TSMC", relevance: "primary" }],
  },
  {
    daysAgo: 8, source: "bloomberg",
    summary: "US 10-year Treasury yield climbs above 4.5% on hawkish Fed commentary.",
    fullContext: "US 10-year Treasury yield climbs above 4.5% on hawkish Fed commentary. A regional Fed president pushed back on near-term cut expectations. The move pressured rate-sensitive equity sectors.",
    significance: 2, sentiment: "bearish",
    sentimentReasoning: "Rising long-end yields tighten financial conditions and pressure equities.",
    gicsSector: null, secondaryCategories: ["Macro & Central Banks"],
    entities: [{ name: "US 10-Year Treasury", relevance: "primary" }, { name: "Federal Reserve", relevance: "secondary" }],
  },
  {
    daysAgo: 7, source: "reuters",
    summary: "Copper prices rise on renewed China stimulus hopes.",
    fullContext: "Copper prices rise on renewed China stimulus hopes. Reports of additional infrastructure spending lifted base metals broadly. Inventories at major warehouses continued to draw down.",
    significance: 1, sentiment: "bullish",
    sentimentReasoning: "Stimulus expectations are reviving industrial demand expectations.",
    gicsSector: "Materials", secondaryCategories: ["Markets & Commodities"],
    entities: [{ name: "Copper", relevance: "primary" }],
  },
  {
    daysAgo: 6, source: "bloomberg",
    summary: "EU proposes new carbon border tax on steel and cement imports.",
    fullContext: "EU proposes new carbon border tax on steel and cement imports. The measure aims to protect domestic producers from cheaper, carbon-intensive imports. Trading partners warned of likely retaliation.",
    significance: 2, sentiment: "mixed",
    sentimentReasoning: "Protective for EU heavy industry but raises trade friction risk.",
    gicsSector: "Materials", secondaryCategories: ["Sustainability & ESG", "Policy & Regulation"],
    entities: [],
  },
  {
    daysAgo: 6, source: "reuters",
    summary: "Major US bank reports surprise loan loss provisions, shares fall.",
    fullContext: "Major US bank reports surprise loan loss provisions, shares fall. Management cited deterioration in commercial real estate exposure. The print weighed on the broader regional banking complex.",
    significance: 2, sentiment: "bearish",
    sentimentReasoning: "Unexpected credit provisions raise concerns about broader loan book quality.",
    gicsSector: "Financials", secondaryCategories: [],
    entities: [],
  },
  {
    daysAgo: 5, source: "bloomberg",
    summary: "Large biotech acquired for $12B in this year's biggest healthcare M&A deal.",
    fullContext: "Large biotech acquired for $12B in this year's biggest healthcare M&A deal. The acquirer gains a late-stage oncology pipeline ahead of key trial readouts. The deal closes a quiet period for large-cap pharma M&A.",
    significance: 2, sentiment: "bullish",
    sentimentReasoning: "A premium acquisition signals renewed pharma appetite for pipeline assets.",
    gicsSector: "Healthcare", secondaryCategories: [],
    entities: [],
  },
  {
    daysAgo: 5, source: "reuters",
    summary: "Sanctions expand on energy exports amid escalating geopolitical tensions.",
    fullContext: "Sanctions expand on energy exports amid escalating geopolitical tensions. The new measures target tanker fleets used to circumvent existing price caps. Analysts expect tighter near-term seaborne supply.",
    significance: 3, sentiment: "bearish",
    sentimentReasoning: "Tighter sanctions enforcement raises near-term supply risk for global energy markets.",
    gicsSector: "Energy", secondaryCategories: ["Geopolitics & Trade", "Policy & Regulation"],
    entities: [{ name: "Brent Crude", relevance: "secondary" }],
  },
  {
    daysAgo: 4, source: "bloomberg",
    summary: "Real estate sector softens as mortgage rates climb to multi-year highs.",
    fullContext: "Real estate sector softens as mortgage rates climb to multi-year highs. Existing home sales fell for a third consecutive month. Builders flagged weakening buyer traffic in their latest commentary.",
    significance: 2, sentiment: "bearish",
    sentimentReasoning: "Higher financing costs are directly weighing on housing demand.",
    gicsSector: "Real Estate", secondaryCategories: ["Macro & Central Banks"],
    entities: [],
  },
  {
    daysAgo: 3, source: "reuters",
    summary: "Consumer spending beats expectations in latest US retail sales report.",
    fullContext: "Consumer spending beats expectations in latest US retail sales report. Discretionary categories led the upside surprise. The data eases near-term concerns about a sharp consumer pullback.",
    significance: 2, sentiment: "bullish",
    sentimentReasoning: "Resilient consumer spending supports the soft-landing narrative.",
    gicsSector: "Consumer Discretionary", secondaryCategories: [],
    entities: [],
  },
  {
    daysAgo: 2, source: "bloomberg",
    summary: "Federal Reserve signals rates on hold for longer amid sticky inflation.",
    fullContext: "Federal Reserve signals rates on hold for longer amid sticky inflation. The latest minutes showed broader committee support for delaying cuts. Futures markets pushed the first expected cut into next year.",
    significance: 3, sentiment: "bearish",
    sentimentReasoning: "A delayed cut timeline disappoints markets that had priced in earlier easing.",
    gicsSector: null, secondaryCategories: ["Macro & Central Banks"],
    entities: [{ name: "Federal Reserve", relevance: "primary" }],
  },
  {
    daysAgo: 1, source: "reuters",
    summary: "Gold dips slightly as the US dollar strengthens broadly.",
    fullContext: "Gold dips slightly as the US dollar strengthens broadly. The pullback comes after the prior week's sharp rally. Traders described the move as profit-taking rather than a trend reversal.",
    significance: 1, sentiment: "bearish",
    sentimentReasoning: "Dollar strength is a near-term headwind, though the broader uptrend is intact.",
    gicsSector: "Materials", secondaryCategories: ["Markets & Commodities"],
    entities: [{ name: "Gold", relevance: "primary" }, { name: "USD", relevance: "secondary" }],
  },
  {
    daysAgo: 1, source: "bloomberg",
    summary: "Constellation Energy shares rise on positive analyst upgrade.",
    fullContext: "Constellation Energy shares rise on positive analyst upgrade. The upgrade cites accelerating data-centre demand and the recently announced SMR partnership. The new price target implies meaningful further upside.",
    significance: 2, sentiment: "bullish",
    sentimentReasoning: "Analyst upgrade reinforces the bullish data-centre power demand thesis.",
    gicsSector: "Utilities", secondaryCategories: [],
    entities: [{ name: "CEG", relevance: "primary" }],
  },
  {
    daysAgo: 0, source: "reuters",
    summary: "Tech sector broadly higher as Nvidia leads gains on AI optimism.",
    fullContext: "Tech sector broadly higher as Nvidia leads gains on AI optimism. The move follows bullish commentary from several hyperscaler customers on capex plans. Semiconductor peers also traded higher in sympathy.",
    significance: 1, sentiment: "bullish",
    sentimentReasoning: "Strong capex commentary from hyperscalers supports the AI infrastructure spending narrative.",
    gicsSector: "Information Technology", secondaryCategories: [],
    entities: [{ name: "Nvidia", relevance: "primary" }],
  },
];

const SOURCE_DEFS: Record<SourceKey, { name: string; sender_email: string; fetch_priority: number; notes: string }> = {
  reuters: { name: "Reuters Newsletter", sender_email: "%@thomsonreuters.com", fetch_priority: 1, notes: "Primary news source — Thomson Reuters" },
  bloomberg: { name: "Bloomberg Markets Wrap", sender_email: "%@bloomberg.net", fetch_priority: 2, notes: "Secondary news source — Bloomberg" },
};

async function main() {
  const supabase = createServiceClient();

  const { data: user, error: userErr } = await supabase
    .from("users")
    .select("id")
    .eq("email", EMAIL)
    .single();
  if (userErr || !user) {
    throw new Error(`User ${EMAIL} not found — log in once before seeding. (${userErr?.message ?? "no row"})`);
  }
  const userId = user.id;
  console.log(`Seeding for user ${userId} (${EMAIL})`);

  // -- 1. Ensure both sources exist -----------------------------------------
  const sourceIds: Record<SourceKey, string> = { reuters: "", bloomberg: "" };
  for (const key of Object.keys(SOURCE_DEFS) as SourceKey[]) {
    const def = SOURCE_DEFS[key];
    const { data: existing } = await supabase
      .from("sources")
      .select("id")
      .eq("user_id", userId)
      .eq("name", def.name)
      .maybeSingle();
    if (existing) {
      sourceIds[key] = existing.id;
    } else {
      const { data: inserted, error } = await supabase
        .from("sources")
        .insert({
          user_id: userId,
          name: def.name,
          sender_email: def.sender_email,
          provider: "gmail",
          is_active: true,
          fetch_priority: def.fetch_priority,
          notes: def.notes,
        })
        .select("id")
        .single();
      if (error || !inserted) throw new Error(`Failed to create source ${def.name}: ${error?.message}`);
      sourceIds[key] = inserted.id;
    }
  }
  console.log("Sources ready:", sourceIds);

  // -- 2. Clear previously-seeded data (FK-safe order) -----------------------
  await supabase.from("conflicts").delete().eq("user_id", userId);
  await supabase.from("correlations").delete().eq("user_id", userId);
  await supabase.from("summaries").delete().eq("user_id", userId);
  await supabase.from("fetch_runs").delete().eq("user_id", userId); // cascades digests -> items -> item_entities
  await supabase.from("entities").delete().eq("user_id", userId); // cascades watchlist + remaining item_entities
  console.log("Cleared previous seed data");

  // -- 3. Entities -------------------------------------------------------
  const entityRows: EntitiesInsert[] = ENTITY_DEFS.map((e) => ({
    user_id: userId,
    name: e.name,
    type: e.type as EntityType,
    ticker: e.ticker,
    exchange: e.exchange,
    gics_sector: e.gics_sector,
    aliases: e.aliases,
  }));
  const { data: insertedEntities, error: entitiesErr } = await supabase
    .from("entities")
    .insert(entityRows)
    .select("id, name");
  if (entitiesErr || !insertedEntities) throw new Error(`Failed to insert entities: ${entitiesErr?.message}`);
  const entityIdByName = new Map(insertedEntities.map((e) => [e.name, e.id]));
  console.log(`Inserted ${insertedEntities.length} entities`);

  // -- 4. Static watchlist -------------------------------------------------
  const watchlistRows = WATCHLIST_DEFS.map((w) => ({
    user_id: userId,
    entity_id: entityIdByName.get(w.entity)!,
    type: "static" as const,
    priority: w.priority,
    alert_threshold: w.alert_threshold,
    notes: w.notes,
  }));
  const { error: watchlistErr } = await supabase.from("watchlist").insert(watchlistRows);
  if (watchlistErr) throw new Error(`Failed to insert watchlist: ${watchlistErr.message}`);
  console.log(`Inserted ${watchlistRows.length} watchlist entries`);

  // -- 5. fetch_runs (one per day that has items) --------------------------
  const daysWithItems = [...new Set(ITEM_DEFS.map((i) => i.daysAgo))].sort((a, b) => b - a);
  const fetchRunIdByDay = new Map<number, string>();
  for (const daysAgo of daysWithItems) {
    const itemsThatDay = ITEM_DEFS.filter((i) => i.daysAgo === daysAgo);
    const { data: run, error } = await supabase
      .from("fetch_runs")
      .insert({
        user_id: userId,
        triggered_by: "manual",
        started_at: isoDateTime(daysAgo, 6),
        completed_at: isoDateTime(daysAgo, 6),
        status: "success",
        emails_found: itemsThatDay.length,
        emails_processed: itemsThatDay.length,
        items_extracted: itemsThatDay.length,
        items_deduplicated: 0,
        provider_used: "claude",
        model_used: "claude-sonnet-4-6",
      })
      .select("id")
      .single();
    if (error || !run) throw new Error(`Failed to insert fetch_run for day -${daysAgo}: ${error?.message}`);
    fetchRunIdByDay.set(daysAgo, run.id);
  }
  console.log(`Inserted ${fetchRunIdByDay.size} fetch_runs`);

  // -- 6. digests + items (1:1 in this seed) -------------------------------
  const itemIdByIndex: string[] = [];
  for (const def of ITEM_DEFS) {
    const fetchRunId = fetchRunIdByDay.get(def.daysAgo)!;
    const sourceId = sourceIds[def.source];
    const sourceName = SOURCE_DEFS[def.source].name;

    const { data: digest, error: digestErr } = await supabase
      .from("digests")
      .insert({
        fetch_run_id: fetchRunId,
        source_id: sourceId,
        user_id: userId,
        email_subject: `${sourceName} — ${isoDate(def.daysAgo)}`,
        email_date: isoDateTime(def.daysAgo, 6),
        received_at: isoDateTime(def.daysAgo, 6),
        raw_body: def.fullContext,
        processed_at: isoDateTime(def.daysAgo, 6),
        processing_status: "success",
        item_count: 1,
        reading_time_seconds: readingTimeSeconds(def.fullContext),
      })
      .select("id")
      .single();
    if (digestErr || !digest) throw new Error(`Failed to insert digest: ${digestErr?.message}`);

    const sentences = sentencesFromParagraph(def.fullContext);
    const { data: item, error: itemErr } = await supabase
      .from("items")
      .insert({
        digest_id: digest.id,
        user_id: userId,
        date: isoDate(def.daysAgo),
        summary: def.summary,
        sentences,
        full_context: def.fullContext,
        significance: def.significance,
        sentiment: def.sentiment,
        sentiment_reasoning: def.sentimentReasoning,
        gics_sector: def.gicsSector,
        secondary_categories: def.secondaryCategories,
        reading_time_seconds: readingTimeSeconds(def.fullContext),
        created_at: isoDateTime(def.daysAgo, 6),
        updated_at: isoDateTime(def.daysAgo, 6),
      })
      .select("id")
      .single();
    if (itemErr || !item) throw new Error(`Failed to insert item "${def.summary}": ${itemErr?.message}`);
    itemIdByIndex.push(item.id);

    if (def.entities.length > 0) {
      const { error: linkErr } = await supabase.from("item_entities").insert(
        def.entities.map((e) => ({
          item_id: item.id,
          entity_id: entityIdByName.get(e.name)!,
          relevance: e.relevance,
        }))
      );
      if (linkErr) throw new Error(`Failed to link entities for item "${def.summary}": ${linkErr.message}`);
    }
  }
  console.log(`Inserted ${itemIdByIndex.length} digests + items`);

  // -- 7. Conflict pair: item[0] (Fed cuts) vs item[16] (Fed holds) -------
  const conflict: ConflictsInsert = {
    user_id: userId,
    item_a_id: itemIdByIndex[0],
    item_b_id: itemIdByIndex[16],
    conflict_summary: "Fed signalled likely rate cuts in Q3 but later signalled rates on hold for longer.",
    category: "Macro & Central Banks",
    entity_id: entityIdByName.get("Federal Reserve")!,
    days_apart: ITEM_DEFS[0].daysAgo - ITEM_DEFS[16].daysAgo,
    acknowledged: false,
    is_resolved: false,
  };
  const { error: conflictErr } = await supabase.from("conflicts").insert(conflict);
  if (conflictErr) throw new Error(`Failed to insert conflict: ${conflictErr.message}`);
  console.log("Inserted 1 conflict");

  // -- 8. Correlation pair: item[3] (oil spike) <-> item[4] (airlines) ----
  const correlation: CorrelationsInsert = {
    user_id: userId,
    item_a_id: itemIdByIndex[3],
    item_b_id: itemIdByIndex[4],
    correlation_summary: "Oil price spike on supply disruption fears is pressuring airline fuel costs and margins.",
    direction: "negative" as CorrelationDirection,
    confidence: 0.75,
    category_a: "Energy",
    category_b: "Industrials",
    entity_a_id: entityIdByName.get("Brent Crude")!,
    entity_b_id: null,
    is_dismissed: false,
  };
  const { error: correlationErr } = await supabase.from("correlations").insert(correlation);
  if (correlationErr) throw new Error(`Failed to insert correlation: ${correlationErr.message}`);
  console.log("Inserted 1 correlation");

  // -- 9. Weekly summary covering the last 7 days --------------------------
  const weekStart = 6; // daysAgo
  const weekItems = ITEM_DEFS.filter((i) => i.daysAgo <= weekStart);
  const summary: SummariesInsert = {
    user_id: userId,
    type: "weekly",
    period_start: isoDate(weekStart),
    period_end: isoDate(0),
    content:
      "Macro uncertainty dominated the week as the Federal Reserve walked back earlier rate-cut signals, " +
      "disappointing markets that had priced in earlier easing. Energy and trade-policy stories were closely " +
      "linked: expanding sanctions on energy exports kept supply risk in focus even as broader commodity moves " +
      "were comparatively muted. Real estate softened further on higher mortgage rates, while consumer spending " +
      "data surprised to the upside, keeping the soft-landing narrative alive. Within the watchlist, Constellation " +
      "Energy continued to build on its data-centre power demand thesis with a fresh analyst upgrade, and gold " +
      "gave back a small part of its prior rally as the dollar firmed. Sentiment over the period was mixed: " +
      "early-week bullishness on rate cuts reversed into a more cautious tone by the week's end.",
    key_themes: ["Federal Reserve policy reversal", "Energy sanctions and supply risk", "Resilient consumer spending"],
    dominant_sentiment: "mixed",
    item_count: weekItems.length,
    watchlist_mentions: { "Federal Reserve": 1, Gold: 1, CEG: 1 },
    provider_used: "claude",
    model_used: "claude-sonnet-4-6",
    is_pinned: true,
  };
  const { error: summaryErr } = await supabase.from("summaries").insert(summary);
  if (summaryErr) throw new Error(`Failed to insert summary: ${summaryErr.message}`);
  console.log("Inserted 1 weekly summary");

  console.log("Seed complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
