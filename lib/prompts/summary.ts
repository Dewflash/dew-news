/**
 * Canonical summary generation prompt — Section 7.6. Verbatim from SPEC.md;
 * do not rewrite or "improve" without instruction (Section 19 Rule 6).
 */
const SUMMARY_PROMPT_TEMPLATE = `You are generating a {{period_type}} market intelligence digest for a private investor.

Period: {{start_date}} to {{end_date}}
Total items: {{item_count}}
Items: {{items_json}}

Generate a structured narrative summary covering:
1. Dominant macro themes of the period
2. Notable sector developments (only sectors with 2+ items)
3. Key entity movements (focus on watchlist entities if present)
4. Sentiment shift — did the overall tone change during the period?
5. Items that may have lasting implications

Format as clear prose sections with headers. Do not use bullet points. Write for an investor who has read the raw items and wants synthesis, not repetition.

Then return a JSON footer:
{
  "key_themes": ["theme1", "theme2", "theme3"],
  "dominant_sentiment": "bullish" | "bearish" | "neutral" | "mixed",
  "watchlist_mentions": {"entity_name": mention_count}
}`;

export function buildSummaryPrompt(
  type: "weekly" | "monthly",
  startDate: string,
  endDate: string,
  itemCount: number,
  itemsJson: string
): string {
  return SUMMARY_PROMPT_TEMPLATE.replace("{{period_type}}", type)
    .replace("{{start_date}}", startDate)
    .replace("{{end_date}}", endDate)
    .replace("{{item_count}}", String(itemCount))
    .replace("{{items_json}}", itemsJson);
}
