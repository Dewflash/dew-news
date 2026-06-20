import type { createServiceClient } from "@/lib/supabase/server";
import type { ExtractedEntity } from "@/lib/ai/provider";
import type { EntityType } from "@/types/database";

const VALID_ENTITY_TYPES: readonly EntityType[] = [
  "commodity",
  "equity",
  "index",
  "currency",
  "country",
  "person",
  "institution",
  "crypto",
  "other",
];

function normaliseType(type: string): EntityType {
  return (VALID_ENTITY_TYPES as readonly string[]).includes(type) ? (type as EntityType) : "other";
}

/**
 * Section 4.6: `entities` is keyed UNIQUE(user_id, name) — normalise here by
 * exact name match (matching Claude's `entities[].name` output) rather than
 * fuzzy-matching aliases, then bump mention_count/last_seen on repeat sightings.
 */
export async function upsertEntity(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  entity: ExtractedEntity
): Promise<string> {
  const { data: existing } = await supabase
    .from("entities")
    .select("id, mention_count")
    .eq("user_id", userId)
    .eq("name", entity.name)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("entities")
      .update({ mention_count: existing.mention_count + 1, last_seen: new Date().toISOString() })
      .eq("id", existing.id);
    return existing.id;
  }

  const { data: created, error } = await supabase
    .from("entities")
    .insert({
      user_id: userId,
      name: entity.name,
      type: normaliseType(entity.type),
      ticker: entity.ticker,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Failed to upsert entity "${entity.name}": ${error.message}`);
  return created.id;
}
