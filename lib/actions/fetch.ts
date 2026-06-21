"use server";

import { revalidatePath } from "next/cache";
import { runFetch, processDigestEmail, runDedupPass } from "@/lib/ingestion/run";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/user";
import { getAIProvider } from "@/lib/ai/provider";
import { buildRagContext } from "@/lib/ingestion/rag";
import { writeLog } from "@/lib/ingestion/log";
import { ModelOutputParseError } from "@/lib/ai/utils";

/** Section 15 Phase 4 task 13 — Settings' "Fetch Now" button. */
export async function triggerFetch() {
  const fetchRun = await runFetch("manual");
  revalidatePath("/settings");
  revalidatePath("/feed");
  return fetchRun;
}

/**
 * Reprocesses one previously failed digest from its stored `raw_body`
 * (Settings' fetch history "Retry" button) — no fresh Gmail fetch, since
 * the email body was already saved at the time of the original failure.
 * Runs extraction + save + same-day dedup, so retrying a digest whose
 * underlying email already produced items elsewhere (e.g. a leftover
 * duplicate digest row from before gmail_message_id tracking existed)
 * doesn't silently re-save the same stories as fresh items. Conflict/
 * correlation detection for this item will still catch up on the next
 * full fetch run.
 */
export async function reprocessDigest(digestId: string) {
  const supabase = createServiceClient();
  const userId = await getUserId(supabase);

  const { data: digest, error: digestError } = await supabase
    .from("digests")
    .select("*")
    .eq("id", digestId)
    .eq("user_id", userId)
    .single();
  if (digestError) throw new Error(digestError.message);

  const { data: settings } = await supabase.from("settings").select("*").eq("user_id", userId).single();
  if (!settings) throw new Error("No settings row found for user.");

  const provider = getAIProvider(settings.active_provider, settings.active_model, settings.temperature);
  const ragContext = await buildRagContext(supabase, userId, settings);

  try {
    const savedItems = await processDigestEmail(
      supabase,
      userId,
      digest.fetch_run_id,
      digest.id,
      digest.email_subject,
      digest.email_date,
      digest.raw_body,
      provider,
      settings,
      ragContext,
      () => {}
    );
    await runDedupPass(supabase, userId, digest.fetch_run_id, provider, settings, savedItems);
    await supabase
      .from("digests")
      .update({ reprocessed: true, reprocessed_at: new Date().toISOString() })
      .eq("id", digest.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase.from("digests").update({ processing_status: "failed" }).eq("id", digest.id);
    await writeLog(supabase, {
      userId,
      fetchRunId: digest.fetch_run_id,
      level: "error",
      stage: "extract",
      message: `Retry failed for email "${digest.email_subject ?? "(no subject)"}": ${message}`,
      metadata: {
        digest_id: digest.id,
        ...(err instanceof ModelOutputParseError ? { raw_model_output: err.rawText } : {}),
      },
    });
    throw new Error(message);
  }

  revalidatePath("/settings");
  revalidatePath("/feed");
}
