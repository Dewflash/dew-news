import { createServiceClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/user";
import { IndicatorsClient } from "@/components/indicators/IndicatorsClient";
import type { IndicatorCardData } from "@/components/indicators/IndicatorCard";
import type { CycleType, MacroIndicatorReadingsRow, MacroIndicatorsRow } from "@/types/database";

export default async function IndicatorsPage() {
  const supabase = createServiceClient();
  const userId = await getUserId(supabase);

  const { data: indicators, error } = await supabase
    .from("macro_indicators")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true })
    .returns<MacroIndicatorsRow[]>();
  if (error) throw new Error(error.message);

  const { data: readings, error: readingsError } = await supabase
    .from("macro_indicator_readings")
    .select("*")
    .eq("user_id", userId)
    .order("period_date", { ascending: false })
    .returns<MacroIndicatorReadingsRow[]>();
  if (readingsError) throw new Error(readingsError.message);

  const latestReadingByIndicator = new Map<string, MacroIndicatorReadingsRow>();
  for (const reading of readings ?? []) {
    if (!latestReadingByIndicator.has(reading.indicator_id)) {
      latestReadingByIndicator.set(reading.indicator_id, reading);
    }
  }

  const groups: Record<CycleType, IndicatorCardData[]> = { leading: [], coincident: [], lagging: [] };
  for (const indicator of indicators ?? []) {
    const reading = latestReadingByIndicator.get(indicator.id);
    groups[indicator.cycle_type].push({
      id: indicator.id,
      name: indicator.name,
      frequency: indicator.frequency,
      sourceName: indicator.source_name,
      sourceUrl: indicator.source_url,
      leadLagMonths: indicator.lead_lag_months,
      thresholdRule: indicator.threshold_rule,
      analystNote: indicator.analyst_note,
      actualValue: reading?.actual_value ?? null,
      previousValue: reading?.previous_value ?? null,
      direction: reading?.direction ?? null,
      fetchError: reading?.fetch_error ?? null,
      periodDate: reading?.period_date ?? null,
    });
  }

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-white">Macro Indicators</h1>
      <IndicatorsClient groups={groups} />
    </div>
  );
}
