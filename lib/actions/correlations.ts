"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";

export async function dismissCorrelation(correlationId: string) {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("correlations")
    .update({ is_dismissed: true })
    .eq("id", correlationId);
  if (error) throw new Error(error.message);
  revalidatePath("/correlations");
}
