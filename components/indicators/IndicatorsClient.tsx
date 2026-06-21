"use client";

import { useState, useTransition } from "react";
import { IndicatorRow, type IndicatorRowData } from "@/components/indicators/IndicatorRow";
import { triggerMacroBackfill, triggerMacroFetch } from "@/lib/actions/macro";
import type { CycleType } from "@/types/database";

const GROUP_LABELS: Record<CycleType, string> = {
  leading: "Leading Indicators",
  coincident: "Coincident Indicators",
  lagging: "Lagging Indicators",
};
const GROUP_ORDER: CycleType[] = ["leading", "coincident", "lagging"];

export function IndicatorsClient({
  groups,
}: {
  groups: Record<CycleType, IndicatorRowData[]>;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleFetch() {
    setError(null);
    startTransition(async () => {
      try {
        await triggerMacroFetch();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function handleBackfill() {
    setError(null);
    startTransition(async () => {
      try {
        await triggerMacroBackfill();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={isPending}
          onClick={handleFetch}
          className="rounded bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {isPending ? "Working…" : "Fetch Now"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={handleBackfill}
          className="rounded bg-card px-3 py-1.5 text-sm text-gray-300 hover:bg-white/10 disabled:opacity-50"
          title="One-off historical backfill for FRED-backed indicators"
        >
          Backfill History
        </button>
        {error && <p className="text-xs text-bearish">{error}</p>}
      </div>

      <div className="space-y-6">
        {GROUP_ORDER.map((cycleType) => {
          const rows = groups[cycleType] ?? [];
          if (rows.length === 0) return null;
          return (
            <div key={cycleType}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-400">
                {GROUP_LABELS[cycleType]}
              </h2>
              <div className="space-y-2">
                {rows.map((indicator) => (
                  <IndicatorRow key={indicator.id} indicator={indicator} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
