import type { createServiceClient } from "@/lib/supabase/server";
import type { ExtractedItem } from "@/lib/ai/provider";
import { GICS_SECTORS, EXTENDED_CATEGORIES } from "@/lib/categories";
import { upsertEntity } from "@/lib/ingestion/entities";
import type { ItemsRow } from "@/types/database";

/** Section 7.7: reading time stored at extraction time, word count of `full_context`. */
function readingTimeSeconds(fullContext: string | null): number {
  if (!fullContext) return 0;
  const wordCount = fullContext.trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(wordCount / 200);
}

function sanitiseGicsSector(sector: string | null): string | null {
  return sector && (GICS_SECTORS as readonly string[]).includes(sector) ? sector : null;
}

/** Prompt's approved list (Section 7.2) is the extended categories only, max 3. */
function sanitiseSecondaryCategories(categories: string[]): string[] {
  return categories.filter((c) => (EXTENDED_CATEGORIES as readonly string[]).includes(c)).slice(0, 3);
}

/** Section 7.1 step 3f: persists one extracted item plus its entity links. */
export async function saveExtractedItem(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  digestId: string,
  item: ExtractedItem
): Promise<ItemsRow> {
  const { data: savedItem, error } = await supabase
    .from("items")
    .insert({
      digest_id: digestId,
      user_id: userId,
      date: item.date,
      summary: item.summary,
      sentences: item.sentences,
      full_context: item.full_context,
      significance: item.significance,
      sentiment: item.sentiment,
      sentiment_reasoning: item.sentiment_reasoning,
      gics_sector: sanitiseGicsSector(item.gics_sector),
      gics_industry_group: item.gics_industry_group,
      gics_industry: item.gics_industry,
      gics_sub_industry: item.gics_sub_industry,
      secondary_categories: sanitiseSecondaryCategories(item.secondary_categories),
      reading_time_seconds: readingTimeSeconds(item.full_context),
    })
    .select("*")
    .single();
  if (error) throw new Error(`Failed to save item: ${error.message}`);

  for (const entity of item.entities) {
    const entityId = await upsertEntity(supabase, userId, entity);
    const { error: linkError } = await supabase
      .from("item_entities")
      .upsert(
        { item_id: savedItem.id, entity_id: entityId, relevance: entity.relevance },
        { onConflict: "item_id,entity_id" }
      );
    if (linkError) console.error(`Failed to link entity "${entity.name}" to item ${savedItem.id}:`, linkError.message);
  }

  return savedItem;
}
