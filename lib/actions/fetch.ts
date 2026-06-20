"use server";

import { revalidatePath } from "next/cache";
import { runFetch } from "@/lib/ingestion/run";

/** Section 15 Phase 4 task 13 — Settings' "Fetch Now" button. */
export async function triggerFetch() {
  const fetchRun = await runFetch("manual");
  revalidatePath("/settings");
  revalidatePath("/feed");
  return fetchRun;
}
