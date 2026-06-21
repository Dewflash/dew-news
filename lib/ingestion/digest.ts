import type { createServiceClient } from "@/lib/supabase/server";
import { writeLog } from "@/lib/ingestion/log";
import { estimateCostUsd, logTokenUsage } from "@/lib/ingestion/token-usage";
import { getAIProvider, type AIProvider } from "@/lib/ai/provider";
import type { ItemsRow, SettingsRow, SummariesRow, SummaryType } from "@/types/database";

/**
 * Section 13: resolves the prompt's `watchlist_mentions` entity names back to
 * `entities.id` (the column's documented shape, Section 4.12) via the same
 * exact-name match `upsertEntity` uses (Section 4.6). A name with no match
 * (e.g. the model mentions something not yet tracked in `entities`) is kept
 * keyed by its raw name rather than silently dropped.
 */
async function resolveWatchlistMentions(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  mentionsByName: Record<string, number>
): Promise<Record<string, number>> {
  const names = Object.keys(mentionsByName);
  if (names.length === 0) return {};

  const { data: entities } = await supabase
    .from("entities")
    .select("id, name")
    .eq("user_id", userId)
    .in("name", names);
  const nameToId = new Map((entities ?? []).map((e) => [e.name, e.id]));

  const resolved: Record<string, number> = {};
  for (const [name, count] of Object.entries(mentionsByName)) {
    resolved[nameToId.get(name) ?? name] = count;
  }
  return resolved;
}

/**
 * Section 13.1/13.2: generates one weekly or monthly digest covering
 * [periodStart, periodEnd] (inclusive, SGT calendar dates matching
 * `items.date`). Returns null (and logs, doesn't throw) if there are no
 * items in the period — an empty digest isn't useful and isn't required by
 * spec. Always inserts a new `summaries` row (Section 13.3: regeneration
 * creates new records rather than overwriting); callers that want
 * "skip if one already exists for this period" check before calling this.
 */
export async function generateSummary(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  type: SummaryType,
  periodStart: string,
  periodEnd: string,
  provider: AIProvider,
  settings: SettingsRow
): Promise<SummariesRow | null> {
  const { data: items, error } = await supabase
    .from("items")
    .select("*")
    .eq("user_id", userId)
    .eq("is_duplicate", false)
    .gte("date", periodStart)
    .lte("date", periodEnd)
    .order("significance", { ascending: false });
  if (error) throw new Error(error.message);

  if (!items || items.length === 0) {
    await writeLog(supabase, {
      userId,
      level: "info",
      stage: "summarise",
      message: `No items found for ${type} digest (${periodStart} to ${periodEnd}); skipping.`,
    });
    return null;
  }

  const { data: summaryResult, inputTokens, outputTokens } = await provider.summarise(items as ItemsRow[], type);
  const watchlistMentions = await resolveWatchlistMentions(supabase, userId, summaryResult.watchlist_mentions);

  const { data: summary, error: insertError } = await supabase
    .from("summaries")
    .insert({
      user_id: userId,
      type,
      period_start: periodStart,
      period_end: periodEnd,
      content: summaryResult.narrative,
      key_themes: summaryResult.key_themes,
      dominant_sentiment: summaryResult.dominant_sentiment,
      item_count: items.length,
      watchlist_mentions: watchlistMentions,
      provider_used: settings.active_provider,
      model_used: settings.active_model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost_usd: estimateCostUsd(settings.active_model, inputTokens, outputTokens) ?? 0,
    })
    .select("*")
    .single();
  if (insertError) throw new Error(insertError.message);

  await logTokenUsage(supabase, {
    userId,
    callType: "summary",
    provider: settings.active_provider,
    model: settings.active_model,
    inputTokens,
    outputTokens,
    referenceId: summary.id,
    referenceType: "summary",
  });

  await writeLog(supabase, {
    userId,
    level: "info",
    stage: "summarise",
    message: `Generated ${type} digest for ${periodStart} to ${periodEnd} (${items.length} item(s)).`,
    metadata: { summary_id: summary.id },
  });

  return summary;
}

function sgtDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Skips auto-generation if a digest for this exact period already exists, so cron jitter/retries can't create duplicate auto-generated rows. Manual regeneration (Section 13.3) bypasses this via a direct `generateSummary` call. */
async function generateDigestIfMissing(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  type: SummaryType,
  periodStart: string,
  periodEnd: string,
  provider: AIProvider,
  settings: SettingsRow
): Promise<void> {
  const { data: existing } = await supabase
    .from("summaries")
    .select("id")
    .eq("user_id", userId)
    .eq("type", type)
    .eq("period_start", periodStart)
    .eq("period_end", periodEnd)
    .limit(1);
  if (existing && existing.length > 0) return;

  try {
    await generateSummary(supabase, userId, type, periodStart, periodEnd, provider, settings);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await writeLog(supabase, { userId, level: "error", stage: "summarise", message: `${type} digest generation failed: ${message}` });
  }
}

/**
 * Section 14.1's Hobby-tier cron only fires once daily, so weekly/monthly
 * digest triggers piggyback on that same invocation rather than getting
 * their own cron entry — called from the fetch cron route once the daily
 * fetch has run, checking `settings.digest_day_of_week`/`digest_day_of_month`
 * against `sgtNow` (already SGT-shifted by the caller, same convention as
 * the route's window check).
 */
export async function maybeGenerateDigests(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  settings: SettingsRow,
  sgtNow: Date
): Promise<void> {
  const provider = getAIProvider(settings.active_provider, settings.active_model, settings.temperature);

  if (settings.weekly_digest_enabled && sgtNow.getUTCDay() === settings.digest_day_of_week) {
    const periodEnd = sgtDateString(sgtNow);
    const periodStart = sgtDateString(new Date(sgtNow.getTime() - 6 * 86_400_000));
    await generateDigestIfMissing(supabase, userId, "weekly", periodStart, periodEnd, provider, settings);
  }

  if (settings.monthly_digest_enabled && sgtNow.getUTCDate() === settings.digest_day_of_month) {
    const firstOfThisMonth = new Date(Date.UTC(sgtNow.getUTCFullYear(), sgtNow.getUTCMonth(), 1));
    const lastOfPrevMonth = new Date(firstOfThisMonth.getTime() - 86_400_000);
    const firstOfPrevMonth = new Date(Date.UTC(lastOfPrevMonth.getUTCFullYear(), lastOfPrevMonth.getUTCMonth(), 1));
    await generateDigestIfMissing(
      supabase,
      userId,
      "monthly",
      sgtDateString(firstOfPrevMonth),
      sgtDateString(lastOfPrevMonth),
      provider,
      settings
    );
  }
}
