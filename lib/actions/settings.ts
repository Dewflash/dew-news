"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/user";
import type { SettingsUpdate } from "@/types/database";

export async function updateSettings(patch: SettingsUpdate) {
  const supabase = createServiceClient();
  const userId = await getUserId(supabase);
  const { error } = await supabase
    .from("settings")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

export async function addSource(name: string, senderEmail: string) {
  const supabase = createServiceClient();
  const userId = await getUserId(supabase);
  const { error } = await supabase.from("sources").insert({
    user_id: userId,
    name: name.trim(),
    sender_email: senderEmail.trim(),
    provider: "gmail",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

export async function toggleSource(sourceId: string, isActive: boolean) {
  const supabase = createServiceClient();
  const { error } = await supabase.from("sources").update({ is_active: !isActive }).eq("id", sourceId);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

export async function deleteSource(sourceId: string) {
  const supabase = createServiceClient();
  const { error } = await supabase.from("sources").delete().eq("id", sourceId);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}
