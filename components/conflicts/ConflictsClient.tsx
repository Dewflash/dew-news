"use client";

import { useState, useTransition } from "react";
import { acknowledgeConflict, resolveConflict } from "@/lib/actions/conflicts";
import type { ConflictsRow } from "@/types/database";

export interface ConflictWithItems extends ConflictsRow {
  itemASummary: string;
  itemADate: string;
  itemBSummary: string;
  itemBDate: string;
  entityName: string | null;
}

type Filter = "all" | "unacknowledged" | "resolved";

function ConflictCard({ conflict }: { conflict: ConflictWithItems }) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState(conflict.resolution_note ?? "");
  const [isPending, startTransition] = useTransition();

  return (
    <div className="rounded-lg border border-white/10 bg-card p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {conflict.entityName && (
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-gray-300">{conflict.entityName}</span>
        )}
        <span className="text-gray-500">{conflict.days_apart ?? "?"} days apart</span>
        {conflict.is_resolved && <span className="text-bullish">Resolved</span>}
        {!conflict.is_resolved && conflict.acknowledged && <span className="text-amber-500">Acknowledged</span>}
      </div>

      <p className="mt-2 font-semibold text-white">{conflict.conflict_summary}</p>

      <div className="mt-3 space-y-2 text-sm">
        <div className="rounded border border-white/5 bg-white/5 p-2">
          <p className="text-xs text-gray-500">{conflict.itemADate}</p>
          <p className="text-gray-200">{conflict.itemASummary}</p>
        </div>
        <div className="rounded border border-white/5 bg-white/5 p-2">
          <p className="text-xs text-gray-500">{conflict.itemBDate}</p>
          <p className="text-gray-200">{conflict.itemBSummary}</p>
        </div>
      </div>

      {conflict.is_resolved && conflict.resolution_note && (
        <p className="mt-2 text-sm text-gray-400">Resolution: {conflict.resolution_note}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(() => acknowledgeConflict(conflict.id, conflict.acknowledged))
          }
          className="text-gray-300 hover:text-white"
        >
          {conflict.acknowledged ? "Unacknowledge" : "Acknowledge"}
        </button>
        {!conflict.is_resolved && (
          <button type="button" onClick={() => setNoteOpen((v) => !v)} className="text-gray-300 hover:text-white">
            Resolve
          </button>
        )}
      </div>

      {noteOpen && !conflict.is_resolved && (
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Resolution note (optional)"
            className="flex-1 rounded border border-white/10 bg-background px-2 py-1 text-sm text-white"
          />
          <button
            type="button"
            disabled={isPending}
            onClick={() => startTransition(() => resolveConflict(conflict.id, note))}
            className="rounded bg-accent px-2 py-1 text-sm text-white"
          >
            Save
          </button>
        </div>
      )}
    </div>
  );
}

export function ConflictsClient({ conflicts }: { conflicts: ConflictWithItems[] }) {
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = conflicts
    .filter((c) => {
      if (filter === "unacknowledged") return !c.acknowledged && !c.is_resolved;
      if (filter === "resolved") return c.is_resolved;
      return true;
    })
    .sort((a, b) => Number(a.acknowledged) - Number(b.acknowledged));

  return (
    <div>
      <div className="mb-4 flex gap-2">
        {(["all", "unacknowledged", "resolved"] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded px-2 py-1 text-sm capitalize ${
              filter === f ? "bg-accent text-white" : "bg-card text-gray-300"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-gray-500">No conflicts to show.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => (
            <ConflictCard key={c.id} conflict={c} />
          ))}
        </div>
      )}
    </div>
  );
}
