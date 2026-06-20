import type { createServiceClient } from "@/lib/supabase/server";

export const USER_EMAIL = "dewlearns@gmail.com";

export async function getUserId(supabase: ReturnType<typeof createServiceClient>) {
  const { data, error } = await supabase.from("users").select("id").eq("email", USER_EMAIL).single();
  if (error) throw new Error(error.message);
  return data.id;
}
