"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/user";
import { getAIProvider } from "@/lib/ai/provider";
import { backfillFredIndicators, fetchAllMacroIndicators } from "@/lib/ingestion/macro/run";

/** Manual trigger from the Indicators page — same pipeline the daily cron runs, for testing or an out-of-cycle refresh. */
export async function triggerMacroFetch() {
  const supabase = createServiceClient();
  const userId = await getUserId(supabase);

  const { data: settings } = await supabase.from("settings").select("*").eq("user_id", userId).single();
  if (!settings) throw new Error("No settings row found for user.");

  const provider = getAIProvider(settings.active_provider, settings.active_model, settings.temperature);
  await fetchAllMacroIndicators(supabase, userId, provider);

  revalidatePath("/indicators");
}

/** One-off historical backfill for FRED-backed indicators, so rolling-window rules aren't blank on first load. */
export async function triggerMacroBackfill() {
  const supabase = createServiceClient();
  const userId = await getUserId(supabase);

  await backfillFredIndicators(supabase, userId);

  revalidatePath("/indicators");
}
