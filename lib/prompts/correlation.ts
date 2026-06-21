/**
 * Canonical correlation detection prompt — Section 7.5. Verbatim from
 * SPEC.md; do not rewrite or "improve" without instruction (Section 19
 * Rule 6).
 */
const CORRELATION_PROMPT_TEMPLATE = `You are analysing a new financial news item to identify correlations with recent items from different categories.

New item: {{new_item}}
Recent items (last 30 days, different categories): {{recent_items}}

A correlation exists when two items from different categories are likely to have a causal or consequential relationship.
Examples: "Oil price spike" + "airline cost pressure". "USD strengthening" + "emerging market outflows". "Rate hike" + "real estate softening".

Only flag correlations with confidence >= 0.6.

Return ONLY a valid JSON array:
[{
  "existing_item_id": "uuid",
  "correlation_summary": "One sentence describing the relationship",
  "direction": "positive" | "negative" | "neutral",
  "confidence": 0.0-1.0
}]

If no correlations, return [].`;

export function buildCorrelationPrompt(newItemJson: string, recentItemsJson: string): string {
  return CORRELATION_PROMPT_TEMPLATE.replace("{{new_item}}", newItemJson).replace(
    "{{recent_items}}",
    recentItemsJson
  );
}
