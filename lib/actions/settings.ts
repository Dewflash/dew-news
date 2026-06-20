"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import type { SettingsUpdate } from "@/types/database";

const USER_EMAIL = "dewlearns@gmail.com";

async function getUserId(supabase: ReturnType<typeof createServiceClient>) {
  const { data, error } = await supabase.from("users").select("id").eq("email", USER_EMAIL).single();
  if (error) throw new Error(error.message);
  return data.id;
}

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
