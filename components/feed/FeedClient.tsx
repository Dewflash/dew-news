"use client";

import { useMemo, useState } from "react";
import { FeedControls, type FeedFilterState, type ViewMode } from "@/components/feed/FeedControls";
import { ItemCard } from "@/components/feed/ItemCard";
import { formatReadingTime } from "@/lib/format";
import { ALL_CATEGORIES } from "@/lib/categories";
import type { Sentiment } from "@/types/database";
import type { DisplayItem as FeedItem } from "@/lib/items";

const SENTIMENT_ORDER: Record<Sentiment, number> = { bullish: 0, mixed: 1, neutral: 2, bearish: 3 };

const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  day: "today",
  week: "this week",
  month: "this month",
  year: "this year",
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function isInRange(itemDate: string, viewMode: ViewMode, anchorDate: string): boolean {
  if (viewMode === "day") return itemDate === anchorDate;
  const item = new Date(`${itemDate}T00:00:00Z`).getTime();
  const anchor = new Date(`${anchorDate}T00:00:00Z`).getTime();
  if (viewMode === "week") {
    const diffDays = (anchor - item) / 86_400_000;
    return diffDays >= 0 && diffDays < 7;
  }
  const itemD = new Date(`${itemDate}T00:00:00Z`);
  const anchorD = new Date(`${anchorDate}T00:00:00Z`);
  if (viewMode === "month") {
    return itemD.getUTCFullYear() === anchorD.getUTCFullYear() && itemD.getUTCMonth() === anchorD.getUTCMonth();
  }
  return itemD.getUTCFullYear() === anchorD.getUTCFullYear();
}

function passesCategoryFilter(item: FeedItem, categories: Set<string>): boolean {
  if (item.gics_sector && categories.has(item.gics_sector)) return true;
  return item.secondary_categories.some((c) => categories.has(c));
}

function passesSignificanceFilter(item: FeedItem, filter: FeedFilterState["significance"]): boolean {
  if (filter === "all") return true;
  if (filter === "high") return item.significance === 3;
  return item.significance >= 2; // medium_plus
}

function sortItems(items: FeedItem[], sort: FeedFilterState["sort"]): FeedItem[] {
  const sorted = [...items];
  if (sort === "significance") {
    sorted.sort((a, b) => b.significance - a.significance || b.date.localeCompare(a.date));
  } else if (sort === "time") {
    sorted.sort((a, b) => b.date.localeCompare(a.date));
  } else {
    sorted.sort((a, b) => SENTIMENT_ORDER[a.sentiment] - SENTIMENT_ORDER[b.sentiment]);
  }
  return sorted;
}

export function FeedClient({ items }: { items: FeedItem[] }) {
  const [filters, setFilters] = useState<FeedFilterState>({
    viewMode: "day",
    anchorDate: todayIso(),
    categories: new Set(ALL_CATEGORIES),
    sentiment: "all",
    significance: "all",
    sort: "significance",
    density: "expanded",
  });

  const filtered = useMemo(() => {
    return items.filter(
      (item) =>
        isInRange(item.date, filters.viewMode, filters.anchorDate) &&
        passesCategoryFilter(item, filters.categories) &&
        (filters.sentiment === "all" || item.sentiment === filters.sentiment) &&
        passesSignificanceFilter(item, filters.significance)
    );
  }, [items, filters]);

  const watching = useMemo(() => sortItems(filtered.filter((i) => i.isWatched), filters.sort), [filtered, filters.sort]);
  const rest = useMemo(() => sortItems(filtered.filter((i) => !i.isWatched), filters.sort), [filtered, filters.sort]);

  const totalReadingSeconds = filtered.reduce((sum, i) => sum + i.reading_time_seconds, 0);

  return (
    <div>
      <FeedControls state={filters} onChange={setFilters} />

      <p className="py-3 text-sm text-gray-400">
        ~{formatReadingTime(totalReadingSeconds)} for {VIEW_MODE_LABELS[filters.viewMode]}
      </p>

      {filtered.length === 0 && (
        <p className="py-8 text-center text-gray-500">No items match the current filters.</p>
      )}

      {watching.length > 0 && (
        <div className="mb-4 border-l-2 border-accent pl-3">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-accent">Watching</h2>
          <div className="space-y-3">
            {watching.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                density={filters.density}
                showSentimentBadge
                showReadingTime
              />
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {rest.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            density={filters.density}
            showSentimentBadge
            showReadingTime
          />
        ))}
      </div>
    </div>
  );
}
