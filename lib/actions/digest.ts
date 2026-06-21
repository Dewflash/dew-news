"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/user";
import { getAIProvider } from "@/lib/ai/provider";
import { generateSummary } from "@/lib/ingestion/digest";

export async function toggleSummaryPin(summaryId: string, isPinned: boolean) {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("summaries")
    .update({ is_pinned: !isPinned })
    .eq("id", summaryId);
  if (error) throw new Error(error.message);
  revalidatePath("/digest");
}

/** Section 13.3: regeneration creates a new record for the same period rather than overwriting; both versions are kept. */
export async function regenerateSummary(summaryId: string) {
  const supabase = createServiceClient();
  const userId = await getUserId(supabase);

  const { data: existing, error } = await supabase
    .from("summaries")
    .select("*")
    .eq("id", summaryId)
    .eq("user_id", userId)
    .single();
  if (error) throw new Error(error.message);

  const { data: settings } = await supabase.from("settings").select("*").eq("user_id", userId).single();
  if (!settings) throw new Error("No settings row found for user.");

  const provider = getAIProvider(settings.active_provider, settings.active_model, settings.temperature);
  const result = await generateSummary(
    supabase,
    userId,
    existing.type,
    existing.period_start,
    existing.period_end,
    provider,
    settings
  );
  if (!result) throw new Error("No items found for this period — nothing to regenerate.");

  revalidatePath("/digest");
}
