import { createServiceClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/user";
import { getGmailClient, getMessage, searchMessages } from "@/lib/gmail/client";
import { extractEmailBody } from "@/lib/gmail/extract";
import { buildSearchQuery } from "@/lib/gmail/query";
import { matchSource } from "@/lib/ingestion/match-source";
import { saveExtractedItem } from "@/lib/ingestion/save-item";
import { writeLog } from "@/lib/ingestion/log";
import { estimateCostUsd, logTokenUsage } from "@/lib/ingestion/token-usage";
import { buildRagContext } from "@/lib/ingestion/rag";
import { runConflictDetection, runCorrelationDetection } from "@/lib/ingestion/intelligence";
import { getAIProvider, type AIProvider } from "@/lib/ai/provider";
import { ModelOutputParseError } from "@/lib/ai/utils";
import type { FetchRunsRow, ItemsRow, SettingsRow } from "@/types/database";

function getHeader(headers: { name?: string | null; value?: string | null }[] | undefined, name: string) {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? null;
}

/**
 * Section 7.1's full extraction pipeline, minus the steps explicitly
 * scheduled for later phases (RAG context building, conflict/correlation
 * detection, watchlist dynamic scores — Phase 5; auto-digests — Phase 6).
 * Triggered manually from Settings in Phase 4; the cron trigger is Phase 5.
 */
export async function runFetch(triggeredBy: "cron" | "manual"): Promise<FetchRunsRow> {
  const supabase = createServiceClient();
  const userId = await getUserId(supabase);

  const { data: fetchRun, error: fetchRunError } = await supabase
    .from("fetch_runs")
    .insert({ user_id: userId, triggered_by: triggeredBy })
    .select("*")
    .single();
  if (fetchRunError) throw new Error(fetchRunError.message);

  await writeLog(supabase, {
    userId,
    fetchRunId: fetchRun.id,
    level: "info",
    stage: "fetch",
    message: `Fetch run started (triggered_by=${triggeredBy}).`,
  });

  // Tracked outside the try block so the outer catch can report real partial
  // progress instead of resetting to 0 if something fails later in the run
  // (e.g. the dedup/conflict/correlation stages) after emails were already
  // successfully processed and saved.
  let emailsFound = 0;
  let emailsProcessed = 0;
  let emailsFailed = 0;
  let itemsExtracted = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let providerUsed: string | null = null;
  let modelUsed: string | null = null;

  try {
    const { data: settings } = await supabase.from("settings").select("*").eq("user_id", userId).single();
    if (!settings) throw new Error("No settings row found for user.");

    const { data: sources } = await supabase.from("sources").select("*").eq("is_active", true);
    if (!sources || sources.length === 0) {
      return await finishRun(supabase, fetchRun.id, userId, { status: "success", emails_found: 0 });
    }

    const gmail = getGmailClient();
    const query = buildSearchQuery(sources);
    const messages = await searchMessages(gmail, query);
    emailsFound = messages.length;

    if (messages.length === 0) {
      await writeLog(supabase, {
        userId,
        fetchRunId: fetchRun.id,
        level: "info",
        stage: "fetch",
        message: "No new emails found in 24h window.",
      });
      return await finishRun(supabase, fetchRun.id, userId, { status: "success", emails_found: 0 });
    }

    const provider = getAIProvider(settings.active_provider, settings.active_model, settings.temperature);
    providerUsed = settings.active_provider;
    modelUsed = settings.active_model;
    const ragContext = await buildRagContext(supabase, userId, settings);

    const allSavedItems: ItemsRow[] = [];

    for (const { id } of messages) {
      const message = await getMessage(gmail, id);
      const fromHeader = getHeader(message.payload?.headers, "From");
      const source = matchSource(fromHeader, sources) ?? sources[0];
      const { subject, emailDate, body } = extractEmailBody(message);

      const { data: digest, error: digestError } = await supabase
        .from("digests")
        .insert({
          fetch_run_id: fetchRun.id,
          source_id: source.id,
          user_id: userId,
          email_subject: subject,
          email_date: emailDate ? new Date(emailDate).toISOString() : null,
          received_at: message.internalDate ? new Date(Number(message.internalDate)).toISOString() : null,
          raw_body: body,
        })
        .select("*")
        .single();
      if (digestError) throw new Error(digestError.message);

      try {
        if (!body.trim()) throw new Error("Email body was empty after extraction/cleaning.");

        const { data: extractedItems, inputTokens, outputTokens } = await provider.extract(body, ragContext);
        totalInputTokens += inputTokens;
        totalOutputTokens += outputTokens;

        await logTokenUsage(supabase, {
          userId,
          callType: "extraction",
          provider: settings.active_provider,
          model: settings.active_model,
          inputTokens,
          outputTokens,
          referenceId: digest.id,
          referenceType: "digest",
        });

        const eligibleItems = extractedItems.filter((item) => item.significance >= settings.min_significance);
        const fallbackDate = emailDate ? new Date(emailDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);

        const savedItems: ItemsRow[] = [];
        for (const item of eligibleItems) {
          try {
            savedItems.push(await saveExtractedItem(supabase, userId, digest.id, item, fallbackDate));
          } catch (itemErr) {
            const itemMessage = itemErr instanceof Error ? itemErr.message : String(itemErr);
            await writeLog(supabase, {
              userId,
              fetchRunId: fetchRun.id,
              level: "warning",
              stage: "extract",
              message: `Skipped one item from "${subject ?? "(no subject)"}": ${itemMessage}`,
              metadata: { digest_id: digest.id, item_summary: item.summary },
            });
          }
        }
        itemsExtracted += savedItems.length;
        allSavedItems.push(...savedItems);

        const readingTimeSeconds = savedItems.reduce((sum, i) => sum + i.reading_time_seconds, 0);
        await supabase
          .from("digests")
          .update({
            processed_at: new Date().toISOString(),
            processing_status: "success",
            item_count: savedItems.length,
            reading_time_seconds: readingTimeSeconds,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
          })
          .eq("id", digest.id);

        await writeLog(supabase, {
          userId,
          fetchRunId: fetchRun.id,
          level: "info",
          stage: "extract",
          message: `Extracted ${savedItems.length} item(s) from "${subject ?? "(no subject)"}".`,
          metadata: { digest_id: digest.id },
        });

        emailsProcessed++;
      } catch (err) {
        emailsFailed++;
        const message = err instanceof Error ? err.message : String(err);
        await supabase.from("digests").update({ processing_status: "failed" }).eq("id", digest.id);
        await writeLog(supabase, {
          userId,
          fetchRunId: fetchRun.id,
          level: "error",
          stage: "extract",
          message: `Failed to process email "${subject ?? "(no subject)"}": ${message}`,
          metadata: {
            digest_id: digest.id,
            ...(err instanceof ModelOutputParseError ? { raw_model_output: err.rawText } : {}),
          },
        });
      }
    }

    let dedupResult: { count: number; inputTokens: number; outputTokens: number; duplicateIds: Set<string> };
    try {
      dedupResult = await runDedupPass(supabase, userId, fetchRun.id, provider, settings, allSavedItems);
      totalInputTokens += dedupResult.inputTokens;
      totalOutputTokens += dedupResult.outputTokens;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await writeLog(supabase, {
        userId,
        fetchRunId: fetchRun.id,
        level: "error",
        stage: "dedup",
        message: `Deduplication pass failed, continuing without it: ${message}`,
        metadata: err instanceof ModelOutputParseError ? { raw_model_output: err.rawText } : {},
      });
      dedupResult = { count: 0, inputTokens: 0, outputTokens: 0, duplicateIds: new Set() };
    }

    const nonDuplicateItems = allSavedItems.filter((item) => !dedupResult.duplicateIds.has(item.id));
    let conflictsDetected = 0;
    let correlationsDetected = 0;
    for (const item of nonDuplicateItems) {
      try {
        const conflictResult = await runConflictDetection(supabase, userId, fetchRun.id, provider, settings, item);
        totalInputTokens += conflictResult.inputTokens;
        totalOutputTokens += conflictResult.outputTokens;
        conflictsDetected += conflictResult.count;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await writeLog(supabase, {
          userId,
          fetchRunId: fetchRun.id,
          level: "error",
          stage: "conflict",
          message: `Conflict detection failed for item ${item.id}: ${message}`,
          metadata: { item_id: item.id, ...(err instanceof ModelOutputParseError ? { raw_model_output: err.rawText } : {}) },
        });
      }

      try {
        const correlationResult = await runCorrelationDetection(supabase, userId, fetchRun.id, provider, settings, item);
        totalInputTokens += correlationResult.inputTokens;
        totalOutputTokens += correlationResult.outputTokens;
        correlationsDetected += correlationResult.count;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await writeLog(supabase, {
          userId,
          fetchRunId: fetchRun.id,
          level: "error",
          stage: "correlate",
          message: `Correlation detection failed for item ${item.id}: ${message}`,
          metadata: { item_id: item.id, ...(err instanceof ModelOutputParseError ? { raw_model_output: err.rawText } : {}) },
        });
      }
    }
    if (nonDuplicateItems.length > 0) {
      await writeLog(supabase, {
        userId,
        fetchRunId: fetchRun.id,
        level: "info",
        stage: "fetch",
        message: `Conflict/correlation pass: ${conflictsDetected} conflict(s), ${correlationsDetected} correlation(s) across ${nonDuplicateItems.length} item(s).`,
      });
    }

    const status = emailsFailed === 0 ? "success" : emailsProcessed > 0 ? "partial" : "failed";

    return await finishRun(supabase, fetchRun.id, userId, {
      status,
      emails_found: messages.length,
      emails_processed: emailsProcessed,
      items_extracted: itemsExtracted,
      items_deduplicated: dedupResult.count,
      provider_used: settings.active_provider,
      model_used: settings.active_model,
      total_input_tokens: totalInputTokens,
      total_output_tokens: totalOutputTokens,
      estimated_cost_usd: estimateCostUsd(settings.active_model, totalInputTokens, totalOutputTokens) ?? 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await writeLog(supabase, {
      userId,
      fetchRunId: fetchRun.id,
      level: "error",
      stage: "fetch",
      message: `Fetch run failed: ${message}`,
      metadata: err instanceof ModelOutputParseError ? { raw_model_output: err.rawText } : {},
    });
    // Report whatever was actually completed before the failure — items may
    // already be saved to the DB even though the run didn't finish, and the
    // status/counts here should reflect that rather than silently zeroing it.
    return await finishRun(supabase, fetchRun.id, userId, {
      status: emailsProcessed > 0 ? "partial" : "failed",
      error_message: message,
      emails_found: emailsFound,
      emails_processed: emailsProcessed,
      items_extracted: itemsExtracted,
      provider_used: providerUsed,
      model_used: modelUsed,
      total_input_tokens: totalInputTokens,
      total_output_tokens: totalOutputTokens,
      estimated_cost_usd: modelUsed ? estimateCostUsd(modelUsed, totalInputTokens, totalOutputTokens) ?? 0 : 0,
    });
  }
}

/** Section 7.1 step 4 / 7.3: dedup new items against existing items from today, across all sources/runs. */
async function runDedupPass(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  fetchRunId: string,
  provider: AIProvider,
  settings: SettingsRow,
  newItems: ItemsRow[]
): Promise<{ count: number; inputTokens: number; outputTokens: number; duplicateIds: Set<string> }> {
  if (newItems.length === 0) return { count: 0, inputTokens: 0, outputTokens: 0, duplicateIds: new Set() };

  // "Existing items from today" (Section 7.3) means items already processed today,
  // not items whose news-event date happens to be today — `items.date` is the event
  // date (can be backdated per Section 7.2) and isn't a reliable "today" filter.
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  const newItemIds = newItems.map((i) => i.id);
  const { data: existingItems } = await supabase
    .from("items")
    .select("*")
    .eq("user_id", userId)
    .gte("created_at", startOfToday.toISOString())
    .eq("is_duplicate", false)
    .not("id", "in", `(${newItemIds.join(",")})`);

  if (!existingItems || existingItems.length === 0) {
    return { count: 0, inputTokens: 0, outputTokens: 0, duplicateIds: new Set() };
  }

  const { data: dedupResults, inputTokens, outputTokens } = await provider.dedup(newItems, existingItems);

  await logTokenUsage(supabase, {
    userId,
    callType: "dedup",
    provider: settings.active_provider,
    model: settings.active_model,
    inputTokens,
    outputTokens,
    referenceId: fetchRunId,
    referenceType: "fetch_run",
  });

  let count = 0;
  const duplicateIds = new Set<string>();
  for (const result of dedupResults) {
    if (!result.is_duplicate || !result.duplicate_of_id) continue;
    const duplicateItem = newItems[result.new_item_index];
    if (!duplicateItem) continue;
    const { error } = await supabase
      .from("items")
      .update({ is_duplicate: true, duplicate_of: result.duplicate_of_id })
      .eq("id", duplicateItem.id);
    if (!error) {
      count++;
      duplicateIds.add(duplicateItem.id);
    }
  }

  await writeLog(supabase, {
    userId,
    fetchRunId,
    level: "info",
    stage: "dedup",
    message: `Deduplication pass: ${count} of ${newItems.length} new item(s) marked as duplicates.`,
  });

  return { count, inputTokens, outputTokens, duplicateIds };
}

async function finishRun(
  supabase: ReturnType<typeof createServiceClient>,
  fetchRunId: string,
  userId: string,
  patch: Partial<FetchRunsRow>
): Promise<FetchRunsRow> {
  const { data, error } = await supabase
    .from("fetch_runs")
    .update({ ...patch, completed_at: new Date().toISOString() })
    .eq("id", fetchRunId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await writeLog(supabase, {
    userId,
    fetchRunId,
    level: patch.status === "failed" ? "error" : "info",
    stage: "fetch",
    message: `Fetch run finished with status "${patch.status}".`,
  });

  return data;
}
