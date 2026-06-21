import type { createServiceClient } from "@/lib/supabase/server";
import { writeLog } from "@/lib/ingestion/log";
import { fetchFredLatestAndPrevious, fetchFredSeries } from "@/lib/ingestion/macro/fred";
import { fetchPressReleaseHeadline } from "@/lib/ingestion/macro/press-release";
import { computeDirection, type DirectionHistoryPoint } from "@/lib/ingestion/macro/direction";
import type { AIProvider } from "@/lib/ai/provider";
import type { MacroIndicatorsRow } from "@/types/database";

const SAHM_RULE_FRED_SERIES_ID = "SAHMREALTIME";

function firstOfMonth(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`;
}

async function upsertReading(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  indicatorId: string,
  periodDate: string,
  actualValue: number | null,
  previousValue: number | null,
  releasedAt: string | null,
  fetchError: string | null
) {
  const { error } = await supabase.from("macro_indicator_readings").upsert(
    {
      indicator_id: indicatorId,
      user_id: userId,
      period_date: periodDate,
      actual_value: actualValue,
      previous_value: previousValue,
      released_at: releasedAt,
      fetch_error: fetchError,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "indicator_id,period_date" }
  );
  if (error) throw new Error(error.message);
}

async function updateDirection(
  supabase: ReturnType<typeof createServiceClient>,
  readingId: string,
  direction: "up" | "down" | null
) {
  const { error } = await supabase.from("macro_indicator_readings").update({ direction }).eq("id", readingId);
  if (error) throw new Error(error.message);
}

async function loadHistory(
  supabase: ReturnType<typeof createServiceClient>,
  indicatorId: string
): Promise<DirectionHistoryPoint[]> {
  const { data, error } = await supabase
    .from("macro_indicator_readings")
    .select("period_date, actual_value")
    .eq("indicator_id", indicatorId)
    .not("actual_value", "is", null)
    .order("period_date", { ascending: true })
    .limit(60);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ periodDate: r.period_date, value: r.actual_value as number }));
}

/** One indicator's fetch+direction cycle. Never throws — failures are logged and the row shows "Data unavailable". */
async function fetchOneIndicator(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  indicator: MacroIndicatorsRow,
  provider: AIProvider
): Promise<void> {
  try {
    let actualValue: number | null = null;
    let previousValue: number | null = null;
    let periodDate: string;
    let releasedAt: string | null = null;

    if (indicator.press_release_url) {
      const { reading } = await fetchPressReleaseHeadline(
        provider,
        indicator.press_release_url,
        indicator.name,
        `Find the latest headline value for ${indicator.name} (${indicator.threshold_rule}).`
      );
      if (!reading) throw new Error("AI extraction did not find a headline figure on the press release page");
      actualValue = reading.value;
      periodDate = reading.periodDate ? firstOfMonth(reading.periodDate) : firstOfMonth(new Date().toISOString());
      releasedAt = new Date().toISOString();

      const history = await loadHistory(supabase, indicator.id);
      previousValue = history.at(-1)?.value ?? null;
    } else if (indicator.fred_series_id) {
      const result = await fetchFredLatestAndPrevious(indicator.fred_series_id);
      if (!result) throw new Error(`No observations returned for FRED series ${indicator.fred_series_id}`);
      actualValue = result.latest.value;
      previousValue = result.previous?.value ?? null;
      periodDate = result.latest.date;
      releasedAt = new Date().toISOString();
    } else {
      throw new Error("No data source configured for this indicator");
    }

    await upsertReading(supabase, userId, indicator.id, periodDate, actualValue, previousValue, releasedAt, null);

    const { data: savedReading, error: readErr } = await supabase
      .from("macro_indicator_readings")
      .select("id")
      .eq("indicator_id", indicator.id)
      .eq("period_date", periodDate)
      .single();
    if (readErr) throw new Error(readErr.message);

    const history = await loadHistory(supabase, indicator.id);

    let auxValue: number | null = null;
    if (indicator.direction_rule_key === "sahm_rule") {
      try {
        const sahm = await fetchFredLatestAndPrevious(SAHM_RULE_FRED_SERIES_ID);
        auxValue = sahm?.latest.value ?? null;
      } catch {
        auxValue = null; // direction falls to N/A rather than blocking the whole indicator
      }
    }

    const direction = computeDirection(indicator.direction_rule_key, { history, auxValue });
    await updateDirection(supabase, savedReading.id, direction);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await writeLog(supabase, {
      userId,
      level: "warning",
      stage: "system",
      message: `Macro indicator "${indicator.name}" fetch failed: ${message}`,
    });
    // Record the failure against today's date so the UI shows "Data unavailable" rather than stale silence.
    const today = new Date().toISOString().slice(0, 10);
    try {
      await upsertReading(supabase, userId, indicator.id, today, null, null, null, message);
    } catch {
      // best-effort; if even this insert fails, the warning log above is the only record
    }
  }
}

/** Fetches all of a user's macro indicators. Called from the daily cron (piggybacking on the existing fetch run, same Hobby-tier constraint as digests) and from a manual trigger. */
export async function fetchAllMacroIndicators(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  provider: AIProvider
): Promise<void> {
  const { data: indicators, error } = await supabase.from("macro_indicators").select("*").eq("user_id", userId);
  if (error) throw new Error(error.message);

  for (const indicator of indicators ?? []) {
    await fetchOneIndicator(supabase, userId, indicator, provider);
  }
}

/** First-load backfill for FRED-backed indicators, so rolling-window rules (4wk MA, Sahm, LEI's 6mo rate, etc.) aren't blank on day one. Non-FRED (press-release-only) indicators accumulate history naturally over time instead — no free historical archive exists for those. */
export async function backfillFredIndicators(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string
): Promise<void> {
  const { data: indicators, error } = await supabase
    .from("macro_indicators")
    .select("*")
    .eq("user_id", userId)
    .not("fred_series_id", "is", null);
  if (error) throw new Error(error.message);

  for (const indicator of indicators ?? []) {
    if (!indicator.fred_series_id) continue;
    try {
      const observations = await fetchFredSeries(indicator.fred_series_id, 24);
      for (const obs of observations) {
        if (obs.value === null) continue;
        await upsertReading(supabase, userId, indicator.id, obs.date, obs.value, null, null, null);
      }
      await writeLog(supabase, {
        userId,
        level: "info",
        stage: "system",
        message: `Backfilled ${observations.length} historical readings for "${indicator.name}".`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await writeLog(supabase, {
        userId,
        level: "warning",
        stage: "system",
        message: `Backfill failed for "${indicator.name}": ${message}`,
      });
    }
  }
}
