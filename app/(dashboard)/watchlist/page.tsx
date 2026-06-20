import { createServiceClient } from "@/lib/supabase/server";
import {
  WatchlistClient,
  type StaticWatchlistItem,
  type TrendingEntity,
} from "@/components/watchlist/WatchlistClient";
import type { EntityType, Sentiment } from "@/types/database";

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export default async function WatchlistPage() {
  const supabase = createServiceClient();

  const { data: staticRows, error: staticError } = await supabase
    .from("watchlist")
    .select("id, entity_id, priority, notes, alert_threshold, entities(name, ticker, type)")
    .eq("type", "static")
    .eq("is_active", true)
    .order("priority", { ascending: true })
    .returns<
      Array<{
        id: string;
        entity_id: string;
        priority: number;
        notes: string | null;
        alert_threshold: number;
        entities: { name: string; ticker: string | null; type: EntityType } | null;
      }>
    >();
  if (staticError) throw new Error(staticError.message);

  const staticItems: StaticWatchlistItem[] = (staticRows ?? [])
    .filter((r) => r.entities !== null)
    .map((r) => ({
      watchlistId: r.id,
      entityId: r.entity_id,
      name: r.entities!.name,
      ticker: r.entities!.ticker,
      type: r.entities!.type,
      notes: r.notes,
      alertThreshold: r.alert_threshold,
      priority: r.priority,
    }));

  const watchedEntityIds = new Set(staticItems.map((i) => i.entityId));

  const { data: mentions, error: mentionsError } = await supabase
    .from("item_entities")
    .select("entity_id, entities(name, ticker), items(date, sentiment)")
    .returns<
      Array<{
        entity_id: string;
        entities: { name: string; ticker: string | null } | null;
        items: { date: string; sentiment: Sentiment } | null;
      }>
    >();
  if (mentionsError) throw new Error(mentionsError.message);

  const thisWeekStart = daysAgoIso(7);
  const twoWeeksAgo = daysAgoIso(14);

  interface Agg {
    name: string;
    ticker: string | null;
    thisWeek: number;
    lastWeek: number;
    sentiments: Sentiment[];
  }
  const aggByEntity = new Map<string, Agg>();

  for (const m of mentions ?? []) {
    if (!m.items || !m.entities) continue;
    if (m.items.date < twoWeeksAgo) continue;
    const existing = aggByEntity.get(m.entity_id) ?? {
      name: m.entities.name,
      ticker: m.entities.ticker,
      thisWeek: 0,
      lastWeek: 0,
      sentiments: [],
    };
    if (m.items.date >= thisWeekStart) {
      existing.thisWeek += 1;
      existing.sentiments.push(m.items.sentiment);
    } else {
      existing.lastWeek += 1;
    }
    aggByEntity.set(m.entity_id, existing);
  }

  const trending: TrendingEntity[] = Array.from(aggByEntity.entries())
    .filter(([, agg]) => agg.thisWeek > 0)
    .map(([entityId, agg]) => {
      const sentimentCounts = new Map<Sentiment, number>();
      for (const s of agg.sentiments) sentimentCounts.set(s, (sentimentCounts.get(s) ?? 0) + 1);
      const dominantSentiment =
        [...sentimentCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

      const trend: TrendingEntity["trend"] =
        agg.thisWeek > agg.lastWeek ? "up" : agg.thisWeek < agg.lastWeek ? "down" : "flat";

      return {
        entityId,
        name: agg.name,
        ticker: agg.ticker,
        mentionCount: agg.thisWeek,
        trend,
        dominantSentiment,
        isAlreadyWatched: watchedEntityIds.has(entityId),
      };
    })
    .sort((a, b) => b.mentionCount - a.mentionCount)
    .slice(0, 10);

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-white">Watchlist</h1>
      <WatchlistClient staticItems={staticItems} trending={trending} />
    </div>
  );
}
