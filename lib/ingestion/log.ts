import type { createServiceClient } from "@/lib/supabase/server";
import type { Json, LogLevel, LogStage } from "@/types/database";

/** Section 7.1 step 9 / Section 17.3: every pipeline step writes an audit entry. */
export async function writeLog(
  supabase: ReturnType<typeof createServiceClient>,
  params: {
    userId: string;
    fetchRunId?: string | null;
    level: LogLevel;
    stage: LogStage;
    message: string;
    metadata?: Json;
  }
) {
  const { error } = await supabase.from("processing_log").insert({
    user_id: params.userId,
    fetch_run_id: params.fetchRunId ?? null,
    level: params.level,
    stage: params.stage,
    message: params.message,
    metadata: params.metadata ?? {},
  });
  if (error) console.error("Failed to write processing_log entry:", error.message);
}
