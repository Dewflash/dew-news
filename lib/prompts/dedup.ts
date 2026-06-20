/**
 * Canonical deduplication prompt — Section 7.3. Verbatim from SPEC.md; do
 * not rewrite or "improve" without instruction (Section 19 Rule 6).
 */
const DEDUP_PROMPT_TEMPLATE = `You are comparing two lists of financial news items to identify duplicates.

New items (just extracted): {{new_items}}
Existing items from today: {{existing_items}}

For each new item, determine if it is substantively the same event as an existing item.
Two items are duplicates if they describe the same event, even if wording differs.
Two items are NOT duplicates if they cover the same topic but describe different events or timepoints.

Return ONLY a valid JSON array:
[{"new_item_index": 0, "is_duplicate": true, "duplicate_of_id": "uuid-here"}]

If no duplicates, return [].`;

export function buildDedupPrompt(newItemsJson: string, existingItemsJson: string): string {
  return DEDUP_PROMPT_TEMPLATE.replace("{{new_items}}", newItemsJson).replace(
    "{{existing_items}}",
    existingItemsJson
  );
}
