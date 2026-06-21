import type { createServiceClient } from "@/lib/supabase/server";
import type { AIProvider } from "@/lib/ai/provider";
import { logTokenUsage } from "@/lib/ingestion/token-usage";
import { writeLog } from "@/lib/ingestion/log";
import type { ItemsRow, SettingsRow } from "@/types/database";

const CONFLICT_LOOKBACK_DAYS = 90;
const CONFLICT_CANDIDATE_LIMIT = 20;
const CORRELATION_LOOKBACK_DAYS = 30;
const CORRELATION_CANDIDATE_LIMIT = 20;

function cutoffDate(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

/** An item's "category" for correlation cross-category comparison — GICS sector, falling back to its first extended category. */
function getItemCategory(item: ItemsRow): string | null {
  return item.gics_sector ?? item.secondary_categories[0] ?? null;
}

async function getEntityIds(supabase: ReturnType<typeof createServiceClient>, itemId: string): Promise<string[]> {
  const { data } = await supabase.from("item_entities").select("entity_id").eq("item_id", itemId);
  return (data ?? []).map((row) => row.entity_id);
}

/** Section 12.2: last 90 days, sharing at least one entity OR the same GICS sector, max 20. */
async function queryConflictCandidates(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  newItem: ItemsRow
): Promise<ItemsRow[]> {
  const cutoff = cutoffDate(CONFLICT_LOOKBACK_DAYS);
  const candidateIds = new Set<string>();

  if (newItem.gics_sector) {
    const { data: sectorMatches } = await supabase
      .from("items")
      .select("id")
      .eq("user_id", userId)
      .eq("is_duplicate", false)
      .eq("gics_sector", newItem.gics_sector)
      .gte("date", cutoff)
      .neq("id", newItem.id)
      .limit(CONFLICT_CANDIDATE_LIMIT);
    for (const row of sectorMatches ?? []) candidateIds.add(row.id);
  }

  const entityIds = await getEntityIds(supabase, newItem.id);
  if (entityIds.length > 0) {
    const { data: entityLinks } = await supabase
      .from("item_entities")
      .select("item_id")
      .in("entity_id", entityIds)
      .neq("item_id", newItem.id);
    for (const row of entityLinks ?? []) candidateIds.add(row.item_id);
  }

  if (candidateIds.size === 0) return [];

  const { data: candidates } = await supabase
    .from("items")
    .select("*")
    .in("id", Array.from(candidateIds))
    .eq("is_duplicate", false)
    .gte("date", cutoff)
    .limit(CONFLICT_CANDIDATE_LIMIT);

  return candidates ?? [];
}

/** Section 12.3: last 30 days, different categories, max 20. */
async function queryCorrelationCandidates(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  newItem: ItemsRow
): Promise<ItemsRow[]> {
  const cutoff = cutoffDate(CORRELATION_LOOKBACK_DAYS);
  const newCategory = getItemCategory(newItem);

  const { data: candidates } = await supabase
    .from("items")
    .select("*")
    .eq("user_id", userId)
    .eq("is_duplicate", false)
    .gte("date", cutoff)
    .neq("id", newItem.id)
    .limit(CORRELATION_CANDIDATE_LIMIT * 3);

  return (candidates ?? []).filter((item) => getItemCategory(item) !== newCategory).slice(0, CORRELATION_CANDIDATE_LIMIT);
}

/** Section 7.1 step 5 / 12.1: conflict detection, run once per saved (non-duplicate) item, after the dedup pass. */
export async function runConflictDetection(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  fetchRunId: string,
  provider: AIProvider,
  settings: SettingsRow,
  newItem: ItemsRow
): Promise<{ count: number; inputTokens: number; outputTokens: number }> {
  const candidates = await queryConflictCandidates(supabase, userId, newItem);
  if (candidates.length === 0) return { count: 0, inputTokens: 0, outputTokens: 0 };

  const { data: results, inputTokens, outputTokens } = await provider.detectConflicts(newItem, candidates);

  await logTokenUsage(supabase, {
    userId,
    callType: "conflict",
    provider: settings.active_provider,
    model: settings.active_model,
    inputTokens,
    outputTokens,
    referenceId: newItem.id,
    referenceType: "item",
  });

  let count = 0;
  for (const result of results) {
    const existingItem = candidates.find((c) => c.id === result.existing_item_id);
    if (!existingItem) continue;

    const [newItemEntities, existingItemEntities] = await Promise.all([
      getEntityIds(supabase, newItem.id),
      getEntityIds(supabase, existingItem.id),
    ]);
    const sharedEntityId = newItemEntities.find((id) => existingItemEntities.includes(id)) ?? null;

    const { error } = await supabase.from("conflicts").insert({
      user_id: userId,
      item_a_id: newItem.id,
      item_b_id: existingItem.id,
      conflict_summary: result.conflict_summary,
      category: getItemCategory(newItem),
      entity_id: sharedEntityId,
      days_apart: result.days_apart,
    });
    if (!error) count++;
  }

  if (count > 0) {
    await writeLog(supabase, {
      userId,
      fetchRunId,
      level: "info",
      stage: "conflict",
      message: `Detected ${count} conflict(s) for item ${newItem.id}.`,
      metadata: { item_id: newItem.id },
    });
  }

  return { count, inputTokens, outputTokens };
}

/** Section 7.1 step 6 / 12.1: correlation detection, run once per saved (non-duplicate) item, after the dedup pass. */
export async function runCorrelationDetection(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  fetchRunId: string,
  provider: AIProvider,
  settings: SettingsRow,
  newItem: ItemsRow
): Promise<{ count: number; inputTokens: number; outputTokens: number }> {
  const candidates = await queryCorrelationCandidates(supabase, userId, newItem);
  if (candidates.length === 0) return { count: 0, inputTokens: 0, outputTokens: 0 };

  const { data: results, inputTokens, outputTokens } = await provider.detectCorrelations(newItem, candidates);

  await logTokenUsage(supabase, {
    userId,
    callType: "correlation",
    provider: settings.active_provider,
    model: settings.active_model,
    inputTokens,
    outputTokens,
    referenceId: newItem.id,
    referenceType: "item",
  });

  let count = 0;
  for (const result of results) {
    const existingItem = candidates.find((c) => c.id === result.existing_item_id);
    if (!existingItem) continue;

    const [newItemEntities, existingItemEntities] = await Promise.all([
      getEntityIds(supabase, newItem.id),
      getEntityIds(supabase, existingItem.id),
    ]);

    const { error } = await supabase.from("correlations").insert({
      user_id: userId,
      item_a_id: newItem.id,
      item_b_id: existingItem.id,
      correlation_summary: result.correlation_summary,
      direction: result.direction,
      confidence: result.confidence,
      category_a: getItemCategory(newItem),
      category_b: getItemCategory(existingItem),
      entity_a_id: newItemEntities[0] ?? null,
      entity_b_id: existingItemEntities[0] ?? null,
    });
    if (!error) count++;
  }

  if (count > 0) {
    await writeLog(supabase, {
      userId,
      fetchRunId,
      level: "info",
      stage: "correlate",
      message: `Detected ${count} correlation(s) for item ${newItem.id}.`,
      metadata: { item_id: newItem.id },
    });
  }

  return { count, inputTokens, outputTokens };
}
