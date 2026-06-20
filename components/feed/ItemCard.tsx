"use client";

import { useState } from "react";
import { SentimentBadge, SignificanceDot } from "@/components/ui/Badge";
import { Pill } from "@/components/ui/Pill";
import { formatReadingTime } from "@/lib/format";
import type { CardDensity } from "@/types/database";
import type { FeedItem } from "@/app/(dashboard)/feed/page";

function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("en-SG", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function ItemCard({
  item,
  density,
  showSentimentBadge,
  showReadingTime,
}: {
  item: FeedItem;
  density: CardDensity;
  showSentimentBadge: boolean;
  showReadingTime: boolean;
}) {
  const [expanded, setExpanded] = useState(density === "expanded");
  const secondaryTags = item.secondary_categories.slice(0, 2);

  return (
    <div className="rounded-lg border border-white/10 bg-card p-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full flex-col gap-2 text-left"
      >
        <div className="flex items-center gap-2">
          <SignificanceDot significance={item.significance} />
          {showSentimentBadge && <SentimentBadge sentiment={item.sentiment} />}
          {item.gics_sector && <Pill>{item.gics_sector}</Pill>}
          {secondaryTags.map((cat) => (
            <Pill key={cat}>{cat}</Pill>
          ))}
          {item.hasConflict && (
            <span title={item.conflictSummary ?? "Conflict detected"} className="text-amber-500">
              ⚠️
            </span>
          )}
          {item.hasCorrelation && (
            <span title={item.correlationSummary ?? "Correlation detected"} className="text-accent">
              🔗
            </span>
          )}
        </div>

        <p className="font-semibold text-white">{item.summary}</p>

        {item.entities.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {item.entities.map((e) => (
              <Pill key={e.id} variant="accent">
                {e.ticker ?? e.name}
              </Pill>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 text-xs text-gray-400">
          {item.sourceName && <span>{item.sourceName}</span>}
          <span>{formatDate(item.date)}</span>
          {showReadingTime && <span>{formatReadingTime(item.reading_time_seconds)}</span>}
        </div>
      </button>

      {expanded && (
        <div className="mt-3 border-t border-white/10 pt-3">
          <div className="space-y-1.5 font-mono text-sm text-gray-200">
            {item.sentences.map((s) => (
              <p key={s.index} className="rounded px-1 py-0.5 hover:bg-white/5">
                {s.text}
              </p>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-3 text-xs text-gray-400">
            <button type="button" className="hover:text-white" title="Starring lands in Phase 3">
              ☆ Star
            </button>
            {item.hasConflict && (
              <a href="/conflicts" className="text-amber-500 hover:underline">
                View conflict
              </a>
            )}
            {item.hasCorrelation && (
              <a href="/correlations" className="text-accent hover:underline">
                View correlation
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
