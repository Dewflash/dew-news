/**
 * Canonical extraction prompt — Section 7.2. Verbatim from SPEC.md; do not
 * rewrite or "improve" without instruction (Section 19 Rule 6).
 */
const EXTRACTION_PROMPT_TEMPLATE = `You are a financial news analyst extracting structured data from a newsletter for a private investment database.

Your task: read the newsletter body and extract every item that has financial or market relevance.

IGNORE: human interest stories, sports, entertainment, weather, and anything with zero financial signal.

For each relevant item, return a JSON object with EXACTLY these fields:
{
  "summary": "One clear sentence describing the financial event and its significance",
  "sentences": [
    {"index": 0, "text": "First sentence of context"},
    {"index": 1, "text": "Second sentence of context"}
  ],
  "full_context": "2-3 sentence paragraph providing full context",
  "significance": 1 | 2 | 3,  // 1=minor market note, 2=notable development, 3=major market-moving event
  "sentiment": "bullish" | "bearish" | "neutral" | "mixed",
  "sentiment_reasoning": "One sentence explaining the sentiment assignment",
  "gics_sector": "exact GICS sector name or null if macro/cross-sector",
  "gics_industry_group": "exact GICS industry group or null",
  "gics_industry": "exact GICS industry or null",
  "gics_sub_industry": "exact GICS sub-industry or null",
  "secondary_categories": ["category1", "category2"],  // max 3, from approved list only
  "entities": [
    {
      "name": "Gold",
      "type": "commodity",
      "ticker": "XAU",
      "relevance": "primary"
    }
  ],
  "date": "YYYY-MM-DD"  // date of the news event, not publication date
}

Approved secondary_categories: ["Macro & Central Banks", "Markets & Commodities", "Geopolitics & Trade", "Policy & Regulation", "Sustainability & ESG", "Governance", "Miscellaneous"]

Significance scoring guide:
- 3: Central bank rate decisions, major geopolitical events affecting global markets, significant earnings beats/misses from major companies, commodity price moves >2%, index moves >1%
- 2: Policy signals, earnings in line with moderate guidance change, commodity moves 0.5-2%, analyst upgrades/downgrades on major names, M&A announcements
- 1: Minor price movements, routine corporate announcements, background context items

Return ONLY a valid JSON array of items. No preamble, no explanation, no markdown. If no financially relevant items exist, return an empty array [].

{{RAG_CONTEXT_BLOCK}}`;

/** RAG context block (Section 7.2) — appended only when rag_context_enabled = true. */
const RAG_CONTEXT_BLOCK_TEMPLATE = `EXISTING RESEARCH CONTEXT (last {{N}} days):
The following entities and themes have been tracked recently. Weight significance scores accordingly — if something contradicts recent data, note it in sentiment_reasoning.

Watchlist entities: {{watchlist_entities}}
Recent high-significance items: {{recent_items_summary}}`;

export interface RagContext {
  lookbackDays: number;
  watchlistEntities: string;
  recentItemsSummary: string;
}

export function buildExtractionPrompt(newsletterBody: string, rag?: RagContext): string {
  const ragBlock = rag
    ? RAG_CONTEXT_BLOCK_TEMPLATE.replace("{{N}}", String(rag.lookbackDays))
        .replace("{{watchlist_entities}}", rag.watchlistEntities)
        .replace("{{recent_items_summary}}", rag.recentItemsSummary)
    : "";

  return (
    EXTRACTION_PROMPT_TEMPLATE.replace("{{RAG_CONTEXT_BLOCK}}", ragBlock) + "\n\nNewsletter body:\n" + newsletterBody
  );
}
