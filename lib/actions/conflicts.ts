"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";

export async function acknowledgeConflict(conflictId: string, acknowledged: boolean) {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("conflicts")
    .update({ acknowledged: !acknowledged })
    .eq("id", conflictId);
  if (error) throw new Error(error.message);
  revalidatePath("/conflicts");
}

export async function resolveConflict(conflictId: string, resolutionNote: string) {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("conflicts")
    .update({ is_resolved: true, resolution_note: resolutionNote || null, acknowledged: true })
    .eq("id", conflictId);
  if (error) throw new Error(error.message);
  revalidatePath("/conflicts");
}
