import { createServiceClient } from "@/lib/supabase/server";
import { buildDisplayItems, type DisplayItem, type RawItemRow } from "@/lib/items";

/**
 * Per SPEC.md Section 9.7: always use Supabase full-text search, no
 * client-side fallback. Combines a tsvector search over summary/full_context
 * with a separate entity-name search, unioned and deduplicated by item id.
 */
export async function searchItems(query: string): Promise<DisplayItem[]> {
  const supabase = createServiceClient();
  const trimmed = query.trim();
  if (!trimmed) return [];

  const { data: textMatches, error: textError } = await supabase
    .from("items")
    .select("id")
    .textSearch("search_vector", trimmed, { type: "plain" });
  if (textError) throw new Error(textError.message);

  const { data: matchingEntities } = await supabase
    .from("entities")
    .select("id")
    .ilike("name", `%${trimmed}%`);

  const entityIds = (matchingEntities ?? []).map((e) => e.id);
  let entityItemIds: string[] = [];
  if (entityIds.length > 0) {
    const { data: entityMatches } = await supabase
      .from("item_entities")
      .select("item_id")
      .in("entity_id", entityIds);
    entityItemIds = (entityMatches ?? []).map((m) => m.item_id);
  }

  const itemIds = Array.from(new Set([...(textMatches ?? []).map((m) => m.id), ...entityItemIds]));
  if (itemIds.length === 0) return [];

  const { data: rawItems, error: itemsError } = await supabase
    .from("items")
    .select("*, item_entities(relevance, entities(id, name, ticker, type)), digests(sources(name))")
    .in("id", itemIds)
    .order("date", { ascending: false })
    .returns<RawItemRow[]>();
  if (itemsError) throw new Error(itemsError.message);

  const { data: conflicts } = await supabase
    .from("conflicts")
    .select("item_a_id, item_b_id, conflict_summary");
  const { data: correlations } = await supabase
    .from("correlations")
    .select("item_a_id, item_b_id, correlation_summary");
  const { data: watchlist } = await supabase
    .from("watchlist")
    .select("entity_id, alert_threshold")
    .eq("type", "static")
    .eq("is_active", true);

  return buildDisplayItems(rawItems ?? [], conflicts ?? [], correlations ?? [], watchlist ?? []);
}
