"use client";

import { useRef, useState, useTransition } from "react";
import { Pill } from "@/components/ui/Pill";
import { addToWatchlist, promoteEntity, removeFromWatchlist, reorderWatchlist } from "@/lib/actions/watchlist";
import type { EntityType, Sentiment } from "@/types/database";

export interface StaticWatchlistItem {
  watchlistId: string;
  entityId: string;
  name: string;
  ticker: string | null;
  type: EntityType;
  notes: string | null;
  alertThreshold: number;
  priority: number;
}

export interface TrendingEntity {
  entityId: string;
  name: string;
  ticker: string | null;
  mentionCount: number;
  trend: "up" | "down" | "flat";
  dominantSentiment: Sentiment | null;
  isAlreadyWatched: boolean;
}

const TREND_ICON: Record<TrendingEntity["trend"], string> = { up: "▲", down: "▼", flat: "—" };
const TREND_COLOUR: Record<TrendingEntity["trend"], string> = {
  up: "text-bullish",
  down: "text-bearish",
  flat: "text-gray-500",
};

function StaticRow({ item, isFirst, isLast }: { item: StaticWatchlistItem; isFirst: boolean; isLast: boolean }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-card p-3">
      <div className="flex flex-col">
        <button
          type="button"
          disabled={isPending || isFirst}
          onClick={() => startTransition(() => reorderWatchlist(item.watchlistId, "up"))}
          className="text-xs text-gray-500 hover:text-white disabled:opacity-30"
        >
          ▲
        </button>
        <button
          type="button"
          disabled={isPending || isLast}
          onClick={() => startTransition(() => reorderWatchlist(item.watchlistId, "down"))}
          className="text-xs text-gray-500 hover:text-white disabled:opacity-30"
        >
          ▼
        </button>
      </div>

      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white">{item.name}</span>
          {item.ticker && <Pill variant="accent">{item.ticker}</Pill>}
          <Pill>{item.type}</Pill>
        </div>
        {item.notes && <p className="mt-1 text-sm text-gray-400">{item.notes}</p>}
        <p className="mt-1 text-xs text-gray-500">Alert threshold: significance ≥ {item.alertThreshold}</p>
      </div>

      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(() => removeFromWatchlist(item.watchlistId))}
        className="text-xs text-gray-500 hover:text-bearish"
      >
        Remove
      </button>
    </div>
  );
}

function AddEntityForm() {
  const [value, setValue] = useState("");
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={() =>
        startTransition(async () => {
          await addToWatchlist(value);
          setValue("");
        })
      }
      className="flex gap-2"
    >
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Add entity by name..."
        className="flex-1 rounded border border-white/10 bg-background px-2 py-1.5 text-sm text-white"
      />
      <button
        type="submit"
        disabled={isPending || !value.trim()}
        className="rounded bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        Add
      </button>
    </form>
  );
}

function TrendingRow({ entity }: { entity: TrendingEntity }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-card p-3">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white">{entity.name}</span>
          {entity.ticker && <Pill variant="accent">{entity.ticker}</Pill>}
          {entity.dominantSentiment && <Pill>{entity.dominantSentiment}</Pill>}
        </div>
        <p className="mt-1 text-xs text-gray-500">{entity.mentionCount} mentions this week</p>
      </div>
      <span className={`text-sm ${TREND_COLOUR[entity.trend]}`}>{TREND_ICON[entity.trend]}</span>
      {entity.isAlreadyWatched ? (
        <span className="text-xs text-gray-500">Watching</span>
      ) : (
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(() => promoteEntity(entity.entityId))}
          className="rounded bg-accent/15 px-2 py-1 text-xs text-accent hover:bg-accent/25"
        >
          Promote
        </button>
      )}
    </div>
  );
}

export function WatchlistClient({
  staticItems,
  trending,
}: {
  staticItems: StaticWatchlistItem[];
  trending: TrendingEntity[];
}) {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">Static Watchlist</h2>
        <div className="mb-3">
          <AddEntityForm />
        </div>
        {staticItems.length === 0 ? (
          <p className="py-4 text-center text-gray-500">No entities pinned yet.</p>
        ) : (
          <div className="space-y-2">
            {staticItems.map((item, i) => (
              <StaticRow
                key={item.watchlistId}
                item={item}
                isFirst={i === 0}
                isLast={i === staticItems.length - 1}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">Trending This Week</h2>
        {trending.length === 0 ? (
          <p className="py-4 text-center text-gray-500">Not enough data yet to show trends.</p>
        ) : (
          <div className="space-y-2">
            {trending.map((entity) => (
              <TrendingRow key={entity.entityId} entity={entity} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
