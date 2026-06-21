import { createServiceClient } from "@/lib/supabase/server";
import { SettingsClient } from "@/components/settings/SettingsClient";

const USER_EMAIL = "dewlearns@gmail.com";

export default async function SettingsPage() {
  const supabase = createServiceClient();

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id")
    .eq("email", USER_EMAIL)
    .single();
  if (userError) throw new Error(userError.message);

  let { data: settings } = await supabase.from("settings").select("*").eq("user_id", user.id).maybeSingle();
  if (!settings) {
    const { data: created, error: createError } = await supabase
      .from("settings")
      .insert({ user_id: user.id })
      .select("*")
      .single();
    if (createError) throw new Error(createError.message);
    settings = created;
  }

  const { data: sources } = await supabase.from("sources").select("*").order("fetch_priority", { ascending: true });

  const { data: lastFetchRun } = await supabase
    .from("fetch_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: recentFetchRunRows } = await supabase
    .from("fetch_runs")
    .select("*")
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
    .order("timestamp", { ascending: false })
    .limit(100);

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  const { data: tokenRows } = await supabase
    .from("token_usage")
    .select("provider, input_tokens, output_tokens, estimated_cost_usd")
    .gte("timestamp", monthStart.toISOString());

  const byProvider: Record<string, number> = {};
  let totalTokens = 0;
  let totalCostUsd = 0;
  for (const row of tokenRows ?? []) {
    const tokens = row.input_tokens + row.output_tokens;
    totalTokens += tokens;
    totalCostUsd += row.estimated_cost_usd ?? 0;
    byProvider[row.provider] = (byProvider[row.provider] ?? 0) + tokens;
  }

  const { count: totalItems } = await supabase.from("items").select("*", { count: "exact", head: true });
  const { count: totalAnnotations } = await supabase
    .from("annotations")
    .select("*", { count: "exact", head: true });
  const { count: totalEntities } = await supabase.from("entities").select("*", { count: "exact", head: true });
  const { data: dateRange } = await supabase.from("items").select("date").order("date", { ascending: true });
  const dateRangeStart = dateRange && dateRange.length > 0 ? dateRange[0].date : null;
  const dateRangeEnd = dateRange && dateRange.length > 0 ? dateRange[dateRange.length - 1].date : null;

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-white">Settings</h1>
      <SettingsClient
        settings={settings}
        sources={sources ?? []}
        lastFetchRun={lastFetchRun ?? null}
        recentFetchRuns={recentFetchRuns ?? []}
        processingLog={processingLog ?? []}
        tokenUsage={{ totalTokens, totalCostUsd, byProvider }}
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
