/**
 * Canonical conflict detection prompt — Section 7.4. Verbatim from SPEC.md;
 * do not rewrite or "improve" without instruction (Section 19 Rule 6).
 */
const CONFLICT_PROMPT_TEMPLATE = `You are analysing a new financial news item against recent items to detect narrative conflicts.

New item: {{new_item}}
Recent items (last 90 days, same entities/categories): {{recent_items}}

A conflict exists when the new item directly contradicts a recent item on the same entity or topic.
Examples: "Fed signals rate cuts" vs previous "Fed signals rate hikes". "Oil supply tightening" vs previous "Oil supply glut".

Return ONLY a valid JSON array of conflicts:
[{
  "existing_item_id": "uuid",
  "conflict_summary": "One sentence describing the contradiction",
  "days_apart": 14
}]

If no conflicts, return [].`;

export function buildConflictPrompt(newItemJson: string, recentItemsJson: string): string {
  return CONFLICT_PROMPT_TEMPLATE.replace("{{new_item}}", newItemJson).replace(
    "{{recent_items}}",
    recentItemsJson
  );
}
