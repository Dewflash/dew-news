"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";

export async function toggleSummaryPin(summaryId: string, isPinned: boolean) {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("summaries")
    .update({ is_pinned: !isPinned })
    .eq("id", summaryId);
  if (error) throw new Error(error.message);
  revalidatePath("/digest");
}
