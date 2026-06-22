"use client";

import { useState } from "react";
import { StatDirectionBadge } from "@/components/ui/StatDirectionBadge";
import type { Direction } from "@/types/database";

export interface IndicatorCardData {
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
  return Math.abs(value) >= 1000
    ? value.toLocaleString(undefined, { maximumFractionDigits: 0 })
    : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function IndicatorCard({ indicator }: { indicator: IndicatorCardData }) {
  const [expanded, setExpanded] = useState(false);
  const isUnavailable = indicator.actualValue === null;

  return (
    <div className="flex flex-col rounded-lg border border-white/10 bg-card p-4">
      <button type="button" onClick={() => setExpanded((v) => !v)} className="flex flex-1 flex-col text-left">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-white">{indicator.name}</p>
          <StatDirectionBadge direction={indicator.direction} />
        </div>
        <p className="mt-1 text-xs text-gray-500">
          {indicator.frequency} — {indicator.sourceName}
        </p>

        <div className="mt-4 flex-1">
          {isUnavailable ? (
            <p className="text-xs italic text-gray-500">Data unavailable</p>
          ) : (
            <div className="flex items-end gap-4">
              <div>
                <p className="text-xs text-gray-500">Actual</p>
                <p className="text-lg text-white">{formatValue(indicator.actualValue)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Previous</p>
                <p className="text-lg text-gray-300">{formatValue(indicator.previousValue)}</p>
              </div>
            </div>
          )}
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
          {indicator.fetchError && <p className="text-xs text-bearish">Last fetch failed: {indicator.fetchError}</p>}
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
