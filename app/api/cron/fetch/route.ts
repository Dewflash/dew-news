import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/user";
import { writeLog } from "@/lib/ingestion/log";
import { runFetch } from "@/lib/ingestion/run";
import { maybeGenerateDigests } from "@/lib/ingestion/digest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SGT_OFFSET_MINUTES = 8 * 60;
// Vercel's documented cron jitter: an invocation can land up to ~an hour after
// its scheduled time, so the configured-window check needs slack wider than that.
const WINDOW_TOLERANCE_MINUTES = 90;

/**
 * Section 14.2: Vercel always fires this at a single fixed UTC time
 * (vercel.json's "0 22 * * *" = 06:00 SGT). Since `settings.fetch_schedule`
 * is user-editable independently of that fixed cron entry, this checks
 * whether "now" (in SGT) falls within the user's configured window before
 * actually running the pipeline — anything outside the window is a no-op.
 */
function isWithinScheduledWindow(cronExpr: string, now: Date): boolean {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return true; // unparseable: don't block the fetch
  const [minuteStr, hourStr, , , dayOfWeekStr] = parts;
  if (!/^\d+$/.test(minuteStr) || !/^\d+$/.test(hourStr)) return true;

  const sgtNow = new Date(now.getTime() + SGT_OFFSET_MINUTES * 60_000);
  const scheduledMinutesOfDay = Number(hourStr) * 60 + Number(minuteStr);
  const nowMinutesOfDay = sgtNow.getUTCHours() * 60 + sgtNow.getUTCMinutes();

  let diff = Math.abs(nowMinutesOfDay - scheduledMinutesOfDay);
  diff = Math.min(diff, 24 * 60 - diff); // wrap around midnight
  if (diff > WINDOW_TOLERANCE_MINUTES) return false;

  if (dayOfWeekStr !== "*") {
    if (!/^\d+$/.test(dayOfWeekStr)) return true;
    if (sgtNow.getUTCDay() !== Number(dayOfWeekStr) % 7) return false;
  }

  return true;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const userId = await getUserId(supabase);

  const { data: settings } = await supabase.from("settings").select("*").eq("user_id", userId).single();
  const fetchSchedule = settings?.fetch_schedule ?? "0 6 * * *";

  if (!isWithinScheduledWindow(fetchSchedule, new Date())) {
    await writeLog(supabase, {
      userId,
      level: "info",
      stage: "fetch",
      message: `Cron invoked outside the configured fetch window (schedule: "${fetchSchedule}" SGT); skipping.`,
    });
    return NextResponse.json({ skipped: true, reason: "outside configured fetch window" });
  }

  const fetchRun = await runFetch("cron");

  // Section 13/14.1: Hobby tier only allows this one daily cron entry, so
  // weekly/monthly digest triggers piggyback on the same invocation rather
  // than getting their own cron entry.
  if (settings) {
    try {
      const sgtNow = new Date(Date.now() + SGT_OFFSET_MINUTES * 60_000);
      await maybeGenerateDigests(supabase, userId, settings, sgtNow);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await writeLog(supabase, { userId, level: "error", stage: "summarise", message: `Digest generation check failed: ${message}` });
    }
  }

  return NextResponse.json({ skipped: false, fetchRun });
}
