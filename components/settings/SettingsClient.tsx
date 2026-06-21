"use client";

import { useState, useTransition } from "react";
import { ALL_CATEGORIES } from "@/lib/categories";
import { cronToHuman } from "@/lib/format";
import { addSource, deleteSource, toggleSource, updateSettings } from "@/lib/actions/settings";
import { triggerFetch } from "@/lib/actions/fetch";
import type {
  ActiveProvider,
  CardDensity,
  DedupSensitivity,
  DefaultView,
  ExportFormat,
  FetchRunsRow,
  ProcessingLogRow,
  SettingsRow,
  SourcesRow,
} from "@/types/database";

const PROVIDER_MODELS: Record<ActiveProvider, string[]> = {
  claude: ["claude-sonnet-4-6", "claude-opus-4-8", "claude-haiku-4-5"],
  gemini: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite"],
  openai: ["gpt-4o", "gpt-4o-mini"],
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="rounded-lg border border-white/10 bg-card p-4" open>
      <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-gray-300">
        {title}
      </summary>
      <div className="mt-4 space-y-4">{children}</div>
    </details>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-gray-400">{label}</span>
      {children}
    </label>
  );
}

const inputClass = "rounded border border-white/10 bg-background px-2 py-1.5 text-sm text-white";

function AIProviderSection({ settings }: { settings: SettingsRow }) {
  const [, startTransition] = useTransition();
  return (
    <Section title="AI Provider">
      <Field label="Provider">
        <div className="flex gap-3">
          {(Object.keys(PROVIDER_MODELS) as ActiveProvider[]).map((p) => (
            <label key={p} className="flex items-center gap-1.5 capitalize text-gray-300">
              <input
                type="radio"
                name="active_provider"
                checked={settings.active_provider === p}
                onChange={() =>
                  startTransition(() =>
                    updateSettings({ active_provider: p, active_model: PROVIDER_MODELS[p][0] })
                  )
                }
              />
              {p}
            </label>
          ))}
        </div>
      </Field>

      <Field label="Model variant">
        <select
          value={settings.active_model}
          onChange={(e) => startTransition(() => updateSettings({ active_model: e.target.value }))}
          className={inputClass}
        >
          {PROVIDER_MODELS[settings.active_provider].map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </Field>

      <Field label={`Temperature: ${settings.temperature}`}>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          defaultValue={settings.temperature}
          onMouseUp={(e) =>
            startTransition(() => updateSettings({ temperature: Number((e.target as HTMLInputElement).value) }))
          }
          onTouchEnd={(e) =>
            startTransition(() => updateSettings({ temperature: Number((e.target as HTMLInputElement).value) }))
          }
        />
      </Field>

      <Field label="Max tokens">
        <input
          type="number"
          defaultValue={settings.max_tokens}
          onBlur={(e) => startTransition(() => updateSettings({ max_tokens: Number(e.target.value) }))}
          className={inputClass}
        />
      </Field>
    </Section>
  );
}

function DataSourcesSection({
  settings,
  sources,
}: {
  settings: SettingsRow;
  sources: SourcesRow[];
}) {
  const [, startTransition] = useTransition();
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");

  return (
    <Section title="Data Sources">
      <div className="space-y-2">
        {sources.map((s) => (
          <div key={s.id} className="flex items-center gap-3 rounded border border-white/5 bg-white/5 p-2">
            <div className="flex-1">
              <p className="text-sm text-white">{s.name}</p>
              <p className="text-xs text-gray-500">{s.sender_email}</p>
            </div>
            <button
              type="button"
              onClick={() => startTransition(() => toggleSource(s.id, s.is_active))}
              className={`text-xs ${s.is_active ? "text-bullish" : "text-gray-500"}`}
            >
              {s.is_active ? "Active" : "Inactive"}
            </button>
            <button
              type="button"
              onClick={() => startTransition(() => deleteSource(s.id))}
              className="text-xs text-gray-500 hover:text-bearish"
            >
              Delete
            </button>
          </div>
        ))}
      </div>

      <form
        action={() =>
          startTransition(async () => {
            await addSource(newName, newEmail);
            setNewName("");
            setNewEmail("");
          })
        }
        className="flex gap-2"
      >
        <input
          type="text"
          placeholder="Source name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className={`${inputClass} flex-1`}
        />
        <input
          type="email"
          placeholder="sender@example.com"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          className={`${inputClass} flex-1`}
        />
        <button type="submit" disabled={!newName || !newEmail} className="rounded bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-50">
          Add
        </button>
      </form>

      <Field label={`Fetch schedule (${cronToHuman(settings.fetch_schedule)} SGT)`}>
        <input
          type="text"
          defaultValue={settings.fetch_schedule}
          onBlur={(e) => startTransition(() => updateSettings({ fetch_schedule: e.target.value }))}
          className={inputClass}
        />
      </Field>

      <label className="flex items-center gap-2 text-sm text-gray-300">
        <input
          type="checkbox"
          checked={settings.fetch_enabled}
          onChange={(e) => startTransition(() => updateSettings({ fetch_enabled: e.target.checked }))}
        />
        Fetch enabled
      </label>

      <Field label="Lookback days (first run only)">
        <input
          type="number"
          defaultValue={settings.lookback_days}
          onBlur={(e) => startTransition(() => updateSettings({ lookback_days: Number(e.target.value) }))}
          className={inputClass}
        />
      </Field>

      <Field label="Deduplication sensitivity">
        <select
          value={settings.dedup_sensitivity}
          onChange={(e) =>
            startTransition(() => updateSettings({ dedup_sensitivity: e.target.value as DedupSensitivity }))
          }
          className={inputClass}
        >
          <option value="aggressive">Aggressive</option>
          <option value="moderate">Moderate</option>
          <option value="loose">Loose</option>
        </select>
      </Field>
    </Section>
  );
}

function ExtractionSection({ settings }: { settings: SettingsRow }) {
  const [, startTransition] = useTransition();
  const activeCategories = new Set(settings.active_categories);

  function toggleCategory(cat: string) {
    const next = new Set(activeCategories);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    startTransition(() => updateSettings({ active_categories: Array.from(next) }));
  }

  return (
    <Section title="Extraction">
      <Field label="Minimum significance threshold">
        <select
          value={settings.min_significance}
          onChange={(e) =>
            startTransition(() => updateSettings({ min_significance: Number(e.target.value) as 1 | 2 | 3 }))
          }
          className={inputClass}
        >
          <option value={1}>1 (all)</option>
          <option value={2}>2 (medium+)</option>
          <option value={3}>3 (high only)</option>
        </select>
      </Field>

      <Field label="Categories">
        <div className="flex flex-wrap gap-1.5">
          {ALL_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => toggleCategory(cat)}
              className={`rounded px-1.5 py-0.5 text-xs ${
                activeCategories.has(cat) ? "bg-accent/30 text-accent" : "bg-white/5 text-gray-500"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </Field>

      <label className="flex items-center gap-2 text-sm text-gray-300">
        <input
          type="checkbox"
          checked={settings.entity_extraction}
          onChange={(e) => startTransition(() => updateSettings({ entity_extraction: e.target.checked }))}
        />
        Entity extraction enabled
      </label>

      <label className="flex items-center gap-2 text-sm text-gray-300">
        <input
          type="checkbox"
          checked={settings.rag_context_enabled}
          onChange={(e) => startTransition(() => updateSettings({ rag_context_enabled: e.target.checked }))}
        />
        RAG context enabled
      </label>

      <Field label={`RAG lookback days: ${settings.rag_lookback_days}`}>
        <input
          type="range"
          min={1}
          max={90}
          defaultValue={settings.rag_lookback_days}
          onMouseUp={(e) =>
            startTransition(() => updateSettings({ rag_lookback_days: Number((e.target as HTMLInputElement).value) }))
          }
          onTouchEnd={(e) =>
            startTransition(() => updateSettings({ rag_lookback_days: Number((e.target as HTMLInputElement).value) }))
          }
        />
      </Field>
    </Section>
  );
}

function DisplaySection({ settings }: { settings: SettingsRow }) {
  const [, startTransition] = useTransition();
  return (
    <Section title="Display">
      <Field label="Default view">
        <select
          value={settings.default_view}
          onChange={(e) => startTransition(() => updateSettings({ default_view: e.target.value as DefaultView }))}
          className={inputClass}
        >
          <option value="day">Day</option>
          <option value="week">Week</option>
          <option value="month">Month</option>
        </select>
      </Field>

      <Field label="Card density">
        <select
          value={settings.card_density}
          onChange={(e) => startTransition(() => updateSettings({ card_density: e.target.value as CardDensity }))}
          className={inputClass}
        >
          <option value="compact">Compact</option>
          <option value="expanded">Expanded</option>
        </select>
      </Field>

      <label className="flex items-center gap-2 text-sm text-gray-300">
        <input
          type="checkbox"
          checked={settings.show_sentiment_badges}
          onChange={(e) => startTransition(() => updateSettings({ show_sentiment_badges: e.target.checked }))}
        />
        Sentiment badges
      </label>
      <label className="flex items-center gap-2 text-sm text-gray-300">
        <input
          type="checkbox"
          checked={settings.show_reading_time}
          onChange={(e) => startTransition(() => updateSettings({ show_reading_time: e.target.checked }))}
        />
        Reading time
      </label>
      <label className="flex items-center gap-2 text-sm text-gray-300">
        <input
          type="checkbox"
          checked={settings.watchlist_pin_enabled}
          onChange={(e) => startTransition(() => updateSettings({ watchlist_pin_enabled: e.target.checked }))}
        />
        Watchlist pinning
      </label>
    </Section>
  );
}

function DigestsSection({ settings }: { settings: SettingsRow }) {
  const [, startTransition] = useTransition();
  return (
    <Section title="Digests">
      <label className="flex items-center gap-2 text-sm text-gray-300">
        <input
          type="checkbox"
          checked={settings.weekly_digest_enabled}
          onChange={(e) => startTransition(() => updateSettings({ weekly_digest_enabled: e.target.checked }))}
        />
        Weekly digest enabled
      </label>
      <Field label="Day of week">
        <select
          value={settings.digest_day_of_week}
          onChange={(e) => startTransition(() => updateSettings({ digest_day_of_week: Number(e.target.value) }))}
          className={inputClass}
        >
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
            <option key={d} value={i}>
              {d}
            </option>
          ))}
        </select>
      </Field>

      <label className="flex items-center gap-2 text-sm text-gray-300">
        <input
          type="checkbox"
          checked={settings.monthly_digest_enabled}
          onChange={(e) => startTransition(() => updateSettings({ monthly_digest_enabled: e.target.checked }))}
        />
        Monthly digest enabled
      </label>
      <Field label="Day of month">
        <input
          type="number"
          min={1}
          max={28}
          defaultValue={settings.digest_day_of_month}
          onBlur={(e) => startTransition(() => updateSettings({ digest_day_of_month: Number(e.target.value) }))}
          className={inputClass}
        />
      </Field>
    </Section>
  );
}

function SystemSection({
  settings,
  lastFetchRun,
  processingLog,
  tokenUsage,
  dbStats,
}: {
  settings: SettingsRow;
  lastFetchRun: FetchRunsRow | null;
  processingLog: ProcessingLogRow[];
  tokenUsage: { totalTokens: number; totalCostUsd: number; byProvider: Record<string, number> };
  dbStats: { totalItems: number; dateRangeStart: string | null; dateRangeEnd: string | null; totalAnnotations: number; totalEntities: number };
}) {
  const [isFetching, startTransition] = useTransition();
  const [logLevel, setLogLevel] = useState<"all" | "info" | "warning" | "error">("all");
  const [fetchError, setFetchError] = useState<string | null>(null);

  const filteredLog = processingLog.filter((l) => logLevel === "all" || l.level === logLevel);

  function handleFetchNow() {
    setFetchError(null);
    startTransition(async () => {
      try {
        await triggerFetch();
      } catch (err) {
        setFetchError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <Section title="System">
      <div>
        <button
          type="button"
          disabled={isFetching}
          onClick={handleFetchNow}
          className="rounded bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {isFetching ? "Fetching…" : "Fetch Now"}
        </button>
        <p className="mt-1 text-xs text-gray-500">
          {lastFetchRun
            ? `Last run: ${lastFetchRun.status} (${new Date(lastFetchRun.started_at).toLocaleString("en-SG")})`
            : "No fetch runs yet."}
        </p>
        {fetchError && <p className="mt-1 text-xs text-bearish">Fetch failed: {fetchError}</p>}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm text-gray-400">Processing log (last 100)</span>
          <select
            value={logLevel}
            onChange={(e) => setLogLevel(e.target.value as typeof logLevel)}
            className={inputClass}
          >
            <option value="all">All levels</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
          </select>
        </div>
        <div className="max-h-48 overflow-y-auto rounded border border-white/5 bg-background p-2 font-mono text-xs text-gray-400">
          {filteredLog.length === 0 ? (
            <p className="text-gray-500">No log entries yet.</p>
          ) : (
            filteredLog.map((l) => (
              <p key={l.id}>
                [{l.level}] {l.stage}: {l.message}
              </p>
            ))
          )}
        </div>
      </div>

      <div className="text-sm text-gray-300">
        <p className="text-gray-400">Token usage this month</p>
        <p>
          {tokenUsage.totalTokens.toLocaleString()} tokens · ${tokenUsage.totalCostUsd.toFixed(2)} estimated
        </p>
        {Object.entries(tokenUsage.byProvider).map(([provider, tokens]) => (
          <p key={provider} className="text-xs text-gray-500">
            {provider}: {tokens.toLocaleString()} tokens
          </p>
        ))}
      </div>

      <div className="text-sm text-gray-300">
        <p className="text-gray-400">Database stats</p>
        <p>{dbStats.totalItems} items</p>
        <p>
          {dbStats.dateRangeStart && dbStats.dateRangeEnd
            ? `${dbStats.dateRangeStart} – ${dbStats.dateRangeEnd}`
            : "No items yet"}
        </p>
        <p>{dbStats.totalAnnotations} annotations</p>
        <p>{dbStats.totalEntities} entities</p>
      </div>

      <div>
        <a
          href={`/api/export/annotations?format=${settings.export_format}`}
          className="inline-block rounded bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20"
        >
          Export annotations ({settings.export_format.toUpperCase()})
        </a>
        <select
          value={settings.export_format}
          onChange={(e) => startTransition(() => updateSettings({ export_format: e.target.value as ExportFormat }))}
          className={`${inputClass} ml-2`}
        >
          <option value="json">JSON</option>
          <option value="csv">CSV</option>
        </select>
      </div>
    </Section>
  );
}

export function SettingsClient(props: {
  settings: SettingsRow;
  sources: SourcesRow[];
  lastFetchRun: FetchRunsRow | null;
  processingLog: ProcessingLogRow[];
  tokenUsage: { totalTokens: number; totalCostUsd: number; byProvider: Record<string, number> };
  dbStats: { totalItems: number; dateRangeStart: string | null; dateRangeEnd: string | null; totalAnnotations: number; totalEntities: number };
}) {
  return (
    <div className="space-y-4">
      <AIProviderSection settings={props.settings} />
      <DataSourcesSection settings={props.settings} sources={props.sources} />
      <ExtractionSection settings={props.settings} />
      <DisplaySection settings={props.settings} />
      <DigestsSection settings={props.settings} />
      <SystemSection
        settings={props.settings}
        lastFetchRun={props.lastFetchRun}
        processingLog={props.processingLog}
        tokenUsage={props.tokenUsage}
        dbStats={props.dbStats}
      />
    </div>
  );
}
