"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ALL_CATEGORIES } from "@/lib/categories";
import type { Sentiment } from "@/types/database";

const SENTIMENT_OPTIONS: Array<"all" | Sentiment> = ["all", "bullish", "bearish", "neutral", "mixed"];

export function SearchForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "all") params.set(key, value);
    else params.delete(key);
    router.push(`/search?${params.toString()}`);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    updateParam("q", q);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search summaries, context, entities, tags..."
          className="flex-1 rounded border border-white/10 bg-card px-3 py-2 text-sm text-white"
        />
        <button type="submit" className="rounded bg-accent px-4 py-2 text-sm text-white">
          Search
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <select
          defaultValue={searchParams.get("category") ?? "all"}
          onChange={(e) => updateParam("category", e.target.value)}
          className="rounded border border-white/10 bg-card px-2 py-1 text-gray-300"
        >
          <option value="all">All categories</option>
          {ALL_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          defaultValue={searchParams.get("sentiment") ?? "all"}
          onChange={(e) => updateParam("sentiment", e.target.value)}
          className="rounded border border-white/10 bg-card px-2 py-1 text-gray-300"
        >
          {SENTIMENT_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All sentiment" : s}
            </option>
          ))}
        </select>

        <select
          defaultValue={searchParams.get("significance") ?? "all"}
          onChange={(e) => updateParam("significance", e.target.value)}
          className="rounded border border-white/10 bg-card px-2 py-1 text-gray-300"
        >
          <option value="all">All significance</option>
          <option value="3">High only</option>
          <option value="2">Medium+</option>
        </select>

        <label className="flex items-center gap-1 text-gray-400">
          From
          <input
            type="date"
            defaultValue={searchParams.get("from") ?? ""}
            onChange={(e) => updateParam("from", e.target.value)}
            className="rounded border border-white/10 bg-card px-2 py-1 text-white"
          />
        </label>
        <label className="flex items-center gap-1 text-gray-400">
          To
          <input
            type="date"
            defaultValue={searchParams.get("to") ?? ""}
            onChange={(e) => updateParam("to", e.target.value)}
            className="rounded border border-white/10 bg-card px-2 py-1 text-white"
          />
        </label>
      </div>
    </form>
  );
}
