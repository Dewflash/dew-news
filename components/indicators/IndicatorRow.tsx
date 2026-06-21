"use client";

import { useState } from "react";
import { StatDirectionBadge } from "@/components/ui/StatDirectionBadge";
import type { Direction } from "@/types/database";

export interface IndicatorRowData {
  id: string;
  name: string;
  frequency: string;
  sourceName: string;
  sourceUrl: string;
  leadLagMonths: string | null;
  thresholdRule: string;
  analystNote: string | null;
  actualValue: number | null;
  previousValue: number | null;
  direction: Direction | null;
  fetchError: string | null;
  periodDate: string | null;
}

function formatValue(value: number | null): string {
  if (value === null) return "—";
  return Math.abs(value) >= 1000 ? value.toLocaleString(undefined, { maximumFractionDigits: 0 }) : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function IndicatorRow({ indicator }: { indicator: IndicatorRowData }) {
  const [expanded, setExpanded] = useState(false);
  const isUnavailable = indicator.actualValue === null;

  return (
    <div className="rounded-lg border border-white/10 bg-card p-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full flex-col gap-2 text-left sm:flex-row sm:items-center sm:justify-between sm:gap-4"
      >
        <div className="min-w-0">
          <p className="font-semibold text-white">{indicator.name}</p>
          <p className="text-xs text-gray-500">
            {indicator.frequency} — {indicator.sourceName}
          </p>
        </div>

        <div className="flex items-center gap-4 text-sm sm:shrink-0">
          {isUnavailable ? (
            <span className="text-xs italic text-gray-500">Data unavailable</span>
          ) : (
            <>
              <div className="text-right">
                <p className="text-xs text-gray-500">Actual</p>
                <p className="text-white">{formatValue(indicator.actualValue)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500">Previous</p>
                <p className="text-gray-300">{formatValue(indicator.previousValue)}</p>
              </div>
            </>
          )}
          <StatDirectionBadge direction={indicator.direction} />
        </div>
      </button>

      {expanded && (
        <div className="mt-3 space-y-2 border-t border-white/10 pt-3 text-sm">
          <p className="text-gray-300">
            <span className="font-medium text-gray-400">Threshold rule: </span>
            {indicator.thresholdRule}
          </p>
          {indicator.leadLagMonths && (
            <p className="text-gray-300">
              <span className="font-medium text-gray-400">Lead/lag vs cycle turns: </span>
              {indicator.leadLagMonths}
            </p>
          )}
          {indicator.analystNote && <p className="leading-relaxed text-gray-300">{indicator.analystNote}</p>}
          {indicator.fetchError && (
            <p className="text-xs text-bearish">Last fetch failed: {indicator.fetchError}</p>
          )}
          <a
            href={indicator.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-xs text-accent hover:underline"
          >
            View source ({indicator.sourceName}) →
          </a>
        </div>
      )}
    </div>
  );
}
