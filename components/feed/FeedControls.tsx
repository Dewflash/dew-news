"use client";

import { ALL_CATEGORIES } from "@/lib/categories";
import type { CardDensity, Sentiment } from "@/types/database";

export type ViewMode = "day" | "week" | "month" | "year";
export type SignificanceFilter = "all" | "high" | "medium_plus";
export type SortMode = "significance" | "time" | "sentiment";

export interface FeedFilterState {
  viewMode: ViewMode;
  anchorDate: string;
  categories: Set<string>;
  sentiment: "all" | Sentiment;
  significance: SignificanceFilter;
  sort: SortMode;
  density: CardDensity;
}

const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  day: "Today",
  week: "This Week",
  month: "This Month",
  year: "This Year",
};

const SENTIMENT_OPTIONS: Array<"all" | Sentiment> = ["all", "bullish", "bearish", "neutral", "mixed"];
const SIGNIFICANCE_OPTIONS: Array<{ value: SignificanceFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "high", label: "High only" },
  { value: "medium_plus", label: "Medium+" },
];
const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: "significance", label: "Significance" },
  { value: "time", label: "Time" },
  { value: "sentiment", label: "Sentiment" },
];

export function FeedControls({
  state,
  onChange,
}: {
  state: FeedFilterState;
  onChange: (next: FeedFilterState) => void;
}) {
  function toggleCategory(cat: string) {
    const next = new Set(state.categories);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    onChange({ ...state, categories: next });
  }

  return (
    <div className="sticky top-0 z-10 flex flex-col gap-3 border-b border-white/10 bg-background py-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={state.anchorDate}
          onChange={(e) => onChange({ ...state, viewMode: "day", anchorDate: e.target.value })}
          className="rounded border border-white/10 bg-card px-2 py-1 text-sm text-white"
        />
        {(Object.keys(VIEW_MODE_LABELS) as ViewMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => onChange({ ...state, viewMode: mode })}
            className={`rounded px-2 py-1 text-sm ${
              state.viewMode === mode ? "bg-accent text-white" : "bg-card text-gray-300"
            }`}
          >
            {VIEW_MODE_LABELS[mode]}
          </button>
        ))}
      </div>

      <details className="rounded border border-white/10 bg-card px-2 py-1.5">
        <summary className="cursor-pointer text-sm text-gray-300">
          Categories ({state.categories.size === ALL_CATEGORIES.length ? "All" : state.categories.size})
        </summary>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ALL_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => toggleCategory(cat)}
              className={`rounded px-1.5 py-0.5 text-xs ${
                state.categories.has(cat) ? "bg-accent/30 text-accent" : "bg-white/5 text-gray-400"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <select
          value={state.sentiment}
          onChange={(e) => onChange({ ...state, sentiment: e.target.value as FeedFilterState["sentiment"] })}
          className="rounded border border-white/10 bg-card px-2 py-1 text-gray-300"
        >
          {SENTIMENT_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All sentiment" : s}
            </option>
          ))}
        </select>

        <select
          value={state.significance}
          onChange={(e) => onChange({ ...state, significance: e.target.value as SignificanceFilter })}
          className="rounded border border-white/10 bg-card px-2 py-1 text-gray-300"
        >
          {SIGNIFICANCE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          value={state.sort}
          onChange={(e) => onChange({ ...state, sort: e.target.value as SortMode })}
          className="rounded border border-white/10 bg-card px-2 py-1 text-gray-300"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              Sort: {opt.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => onChange({ ...state, density: state.density === "compact" ? "expanded" : "compact" })}
          className="rounded bg-card px-2 py-1 text-gray-300"
        >
          {state.density === "compact" ? "Compact" : "Expanded"}
        </button>
      </div>
    </div>
  );
}
