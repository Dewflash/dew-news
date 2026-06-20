"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/user";

export async function addToWatchlist(entityName: string) {
  const supabase = createServiceClient();
  const userId = await getUserId(supabase);
  const trimmed = entityName.trim();
  if (!trimmed) return;

  const { data: existing } = await supabase
    .from("entities")
    .select("id")
    .eq("user_id", userId)
    .ilike("name", trimmed)
    .maybeSingle();

  let entityId = existing?.id;
  if (!entityId) {
    const { data: created, error: createError } = await supabase
      .from("entities")
      .insert({ user_id: userId, name: trimmed, type: "other" })
      .select("id")
      .single();
    if (createError) throw new Error(createError.message);
    entityId = created.id;
  }

  const { data: maxPriority } = await supabase
    .from("watchlist")
    .select("priority")
    .eq("user_id", userId)
    .eq("type", "static")
    .order("priority", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("watchlist").upsert(
    {
      user_id: userId,
      entity_id: entityId,
      type: "static",
      is_active: true,
      priority: (maxPriority?.priority ?? -1) + 1,
    },
    { onConflict: "user_id,entity_id" }
  );
  if (error) throw new Error(error.message);
  revalidatePath("/watchlist");
}

export async function promoteEntity(entityId: string) {
  const supabase = createServiceClient();
  const userId = await getUserId(supabase);

  const { data: maxPriority } = await supabase
    .from("watchlist")
    .select("priority")
    .eq("user_id", userId)
    .eq("type", "static")
    .order("priority", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("watchlist").upsert(
    {
      user_id: userId,
      entity_id: entityId,
      type: "static",
      is_active: true,
      priority: (maxPriority?.priority ?? -1) + 1,
    },
    { onConflict: "user_id,entity_id" }
  );
  if (error) throw new Error(error.message);
  revalidatePath("/watchlist");
}

export async function removeFromWatchlist(watchlistId: string) {
  const supabase = createServiceClient();
  const { error } = await supabase.from("watchlist").delete().eq("id", watchlistId);
  if (error) throw new Error(error.message);
  revalidatePath("/watchlist");
}

export async function reorderWatchlist(watchlistId: string, direction: "up" | "down") {
  const supabase = createServiceClient();
  const { data: rows, error } = await supabase
    .from("watchlist")
    .select("id, priority")
    .eq("type", "static")
    .order("priority", { ascending: true });
  if (error) throw new Error(error.message);

  const index = (rows ?? []).findIndex((r) => r.id === watchlistId);
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || swapIndex < 0 || swapIndex >= (rows ?? []).length) return;

  const a = rows![index];
  const b = rows![swapIndex];
  await supabase.from("watchlist").update({ priority: b.priority }).eq("id", a.id);
  await supabase.from("watchlist").update({ priority: a.priority }).eq("id", b.id);
  revalidatePath("/watchlist");
}
