import { createServiceClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/user";
import { SettingsClient } from "@/components/settings/SettingsClient";

export default async function SettingsPage() {
  const supabase = createServiceClient();
  const userId = await getUserId(supabase);

  let { data: settings } = await supabase.from("settings").select("*").eq("user_id", userId).maybeSingle();
  if (!settings) {
    const { data: created, error: createError } = await supabase
      .from("settings")
      .insert({ user_id: userId })
      .select("*")
      .single();
    if (createError) throw new Error(createError.message);
    settings = created;
  }

  const { data: sources } = await supabase
    .from("sources")
    .select("*")
    .eq("user_id", userId)
    .order("fetch_priority", { ascending: true });

  const { data: lastFetchRun } = await supabase
    .from("fetch_runs")
    .select("*")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: recentFetchRunRows } = await supabase
    .from("fetch_runs")
    .select("*")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(10);

  const recentFetchRunIds = (recentFetchRunRows ?? []).map((r) => r.id);
  const { data: recentDigests } =
    recentFetchRunIds.length > 0
      ? await supabase
          .from("digests")
          .select("id, fetch_run_id, email_subject, processing_status, item_count, reprocessed")
          .in("fetch_run_id", recentFetchRunIds)
          .order("created_at", { ascending: true })
      : { data: [] };

  const recentFetchRuns = (recentFetchRunRows ?? []).map((run) => ({
    ...run,
    digests: (recentDigests ?? []).filter((d) => d.fetch_run_id === run.id),
  }));

  const { data: processingLog } = await supabase
    .from("processing_log")
    .select("*")
    .eq("user_id", userId)
    .order("timestamp", { ascending: false })
    .limit(100);

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  const { data: tokenRows } = await supabase
    .from("token_usage")
    .select("provider, call_type, input_tokens, output_tokens, estimated_cost_usd")
    .eq("user_id", userId)
    .gte("timestamp", monthStart.toISOString());

  const byProvider: Record<string, number> = {};
  const byCallType: Record<string, number> = {};
  const costByProvider: Record<string, number> = {};
  let totalTokens = 0;
  let totalCostUsd = 0;
  for (const row of tokenRows ?? []) {
    const tokens = row.input_tokens + row.output_tokens;
    const cost = row.estimated_cost_usd ?? 0;
    totalTokens += tokens;
    totalCostUsd += cost;
    byProvider[row.provider] = (byProvider[row.provider] ?? 0) + tokens;
    byCallType[row.call_type] = (byCallType[row.call_type] ?? 0) + tokens;
    costByProvider[row.provider] = (costByProvider[row.provider] ?? 0) + cost;
  }

  const { count: totalItems } = await supabase
    .from("items")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  const { count: totalAnnotations } = await supabase
    .from("annotations")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  const { count: totalEntities } = await supabase
    .from("entities")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  const { data: dateRange } = await supabase
    .from("items")
    .select("date")
    .eq("user_id", userId)
    .order("date", { ascending: true });
  const dateRangeStart = dateRange && dateRange.length > 0 ? dateRange[0].date : null;
  const dateRangeEnd = dateRange && dateRange.length > 0 ? dateRange[dateRange.length - 1].date : null;

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-white">Settings</h1>
      <a
        href="/indicators"
        className="mb-4 block rounded border border-white/10 bg-card px-3 py-2 text-sm text-gray-300 hover:bg-white/5 sm:hidden"
      >
        📊 Macro Indicators — not in the mobile tab bar, link here instead →
      </a>
      <SettingsClient
        settings={settings}
        sources={sources ?? []}
        lastFetchRun={lastFetchRun ?? null}
        recentFetchRuns={recentFetchRuns ?? []}
        processingLog={processingLog ?? []}
        tokenUsage={{ totalTokens, totalCostUsd, byProvider, byCallType, costByProvider }}
        dbStats={{
          totalItems: totalItems ?? 0,
          dateRangeStart,
          dateRangeEnd,
          totalAnnotations: totalAnnotations ?? 0,
          totalEntities: totalEntities ?? 0,
        }}
      />
    </div>
  );
}
