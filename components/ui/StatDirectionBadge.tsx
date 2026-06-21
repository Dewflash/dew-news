import type { Direction } from "@/types/database";

/** Macro Indicators Dashboard (dashboard.md) — deliberately not named "SentimentBadge": that name is already used for news-item tone elsewhere in this app with different semantics. Renders nothing for null/N/A rather than guessing. */
export function StatDirectionBadge({ direction }: { direction: Direction | null }) {
  if (direction === null) return null;

  return (
    <span
      title={direction === "up" ? "Up" : "Down"}
      className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
        direction === "up" ? "bg-bullish/20 text-bullish" : "bg-bearish/20 text-bearish"
      }`}
    >
      {direction === "up" ? "▲" : "▼"}
    </span>
  );
}
