import { createServiceClient } from "@/lib/supabase/server";
import { FeedClient } from "@/components/feed/FeedClient";
import type { EntityRelevance, EntityType, ItemsRow } from "@/types/database";

export interface FeedItemEntity {
  id: string;
  name: string;
  ticker: string | null;
  type: EntityType;
  relevance: EntityRelevance;
}

export interface FeedItem extends ItemsRow {
  entities: FeedItemEntity[];
  sourceName: string | null;
  hasConflict: boolean;
  conflictSummary: string | null;
  hasCorrelation: boolean;
  correlationSummary: string | null;
  isWatched: boolean;
}

interface RawItemRow extends ItemsRow {
  item_entities: Array<{
    relevance: EntityRelevance;
    entities: { id: string; name: string; ticker: string | null; type: EntityType } | null;
  }>;
  digests: { sources: { name: string } | null } | null;
}

export default async function FeedPage() {
  const supabase = createServiceClient();

  const { data: rawItems, error: itemsError } = await supabase
    .from("items")
    .select("*, item_entities(relevance, entities(id, name, ticker, type)), digests(sources(name))")
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

  const conflictByItemId = new Map<string, string>();
  for (const c of conflicts ?? []) {
    conflictByItemId.set(c.item_a_id, c.conflict_summary);
    conflictByItemId.set(c.item_b_id, c.conflict_summary);
  }

  const correlationByItemId = new Map<string, string>();
  for (const c of correlations ?? []) {
    correlationByItemId.set(c.item_a_id, c.correlation_summary);
    correlationByItemId.set(c.item_b_id, c.correlation_summary);
  }

  const watchlistThresholdByEntityId = new Map<string, number>();
  for (const w of watchlist ?? []) {
    watchlistThresholdByEntityId.set(w.entity_id, w.alert_threshold);
  }

  const items: FeedItem[] = (rawItems ?? []).map((row) => {
    const { item_entities, digests, ...rest } = row;
    const entities = item_entities
      .filter((ie) => ie.entities !== null)
      .map((ie) => ({ ...ie.entities!, relevance: ie.relevance }));
    const isWatched = entities.some(
      (e) =>
        watchlistThresholdByEntityId.has(e.id) &&
        row.significance >= watchlistThresholdByEntityId.get(e.id)!
    );

    return {
      ...rest,
      entities,
      sourceName: digests?.sources?.name ?? null,
      hasConflict: conflictByItemId.has(row.id),
      conflictSummary: conflictByItemId.get(row.id) ?? null,
      hasCorrelation: correlationByItemId.has(row.id),
      correlationSummary: correlationByItemId.get(row.id) ?? null,
      isWatched,
    };
  });

  return <FeedClient items={items} />;
}
