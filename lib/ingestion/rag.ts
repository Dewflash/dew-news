import type { createServiceClient } from "@/lib/supabase/server";
import type { RagContext } from "@/lib/prompts/extraction";
import type { SettingsRow } from "@/types/database";

/**
 * Section 7.1 step 3 / 7.2's RAG context block — only built when
 * `rag_context_enabled` is on. Watchlist entities + recent high-significance
 * items (significance=3) within `rag_lookback_days`, injected into the
 * extraction prompt.
 */
export async function buildRagContext(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  settings: SettingsRow
): Promise<RagContext | undefined> {
  if (!settings.rag_context_enabled) return undefined;

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - settings.rag_lookback_days);
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  const { data: watchlistRows } = await supabase
    .from("watchlist")
    .select("entities(name, ticker)")
    .eq("user_id", userId)
    .eq("is_active", true);

  const watchlistEntities = (watchlistRows ?? [])
    .map((row) => {
      const entity = row.entities as unknown as { name: string; ticker: string | null } | null;
      if (!entity) return null;
      return entity.ticker ? `${entity.name} (${entity.ticker})` : entity.name;
    })
    .filter((name): name is string => Boolean(name))
    .join(", ");

  const { data: recentItems } = await supabase
    .from("items")
    .select("summary")
    .eq("user_id", userId)
    .eq("significance", 3)
    .gte("date", cutoffDate)
    .order("date", { ascending: false })
    .limit(20);

  const recentItemsSummary = (recentItems ?? []).map((item) => item.summary).join("; ");

  return {
    lookbackDays: settings.rag_lookback_days,
    watchlistEntities: watchlistEntities || "none",
    recentItemsSummary: recentItemsSummary || "none",
  };
}
