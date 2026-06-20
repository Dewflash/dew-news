"use client";

import { useState, useTransition } from "react";
import { Pill } from "@/components/ui/Pill";
import { dismissCorrelation } from "@/lib/actions/correlations";
import type { CorrelationsRow } from "@/types/database";

export interface CorrelationWithItems extends CorrelationsRow {
  itemASummary: string;
  itemADate: string;
  itemBSummary: string;
  itemBDate: string;
}

type Filter = "all" | "high_confidence" | "dismissed";

const DIRECTION_STYLE: Record<CorrelationsRow["direction"], string> = {
  positive: "bg-bullish/15 text-bullish",
  negative: "bg-bearish/15 text-bearish",
  neutral: "bg-neutral/15 text-neutral",
};

function CorrelationCard({ correlation }: { correlation: CorrelationWithItems }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="rounded-lg border border-white/10 bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${DIRECTION_STYLE[correlation.direction]}`}>
          {correlation.direction}
        </span>
        {correlation.confidence !== null && (
          <Pill>{Math.round(correlation.confidence * 100)}% confidence</Pill>
        )}
        {correlation.is_dismissed && <span className="text-xs text-gray-500">Dismissed</span>}
      </div>

      <p className="mt-2 font-semibold text-white">{correlation.correlation_summary}</p>

      <div className="mt-3 space-y-2 text-sm">
        <div className="rounded border border-white/5 bg-white/5 p-2">
          <p className="text-xs text-gray-500">
            {correlation.itemADate}
            {correlation.category_a ? ` · ${correlation.category_a}` : ""}
          </p>
          <p className="text-gray-200">{correlation.itemASummary}</p>
        </div>
        <div className="rounded border border-white/5 bg-white/5 p-2">
          <p className="text-xs text-gray-500">
            {correlation.itemBDate}
            {correlation.category_b ? ` · ${correlation.category_b}` : ""}
          </p>
          <p className="text-gray-200">{correlation.itemBSummary}</p>
        </div>
      </div>

      {!correlation.is_dismissed && (
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(() => dismissCorrelation(correlation.id))}
          className="mt-3 text-xs text-gray-300 hover:text-white"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}

export function CorrelationsClient({ correlations }: { correlations: CorrelationWithItems[] }) {
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = correlations.filter((c) => {
    if (filter === "high_confidence") return (c.confidence ?? 0) > 0.8;
    if (filter === "dismissed") return c.is_dismissed;
    return true;
  });

  return (
    <div>
      <div className="mb-4 flex gap-2">
        {([
          { value: "all", label: "All" },
          { value: "high_confidence", label: "High confidence" },
          { value: "dismissed", label: "Dismissed" },
        ] as Array<{ value: Filter; label: string }>).map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded px-2 py-1 text-sm ${
              filter === f.value ? "bg-accent text-white" : "bg-card text-gray-300"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-gray-500">No correlations to show.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => (
            <CorrelationCard key={c.id} correlation={c} />
          ))}
        </div>
      )}
    </div>
  );
}
