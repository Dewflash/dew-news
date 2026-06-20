import { createServiceClient } from "@/lib/supabase/server";
import { ConflictsClient, type ConflictWithItems } from "@/components/conflicts/ConflictsClient";
import type { ConflictsRow } from "@/types/database";

export default async function ConflictsPage() {
  const supabase = createServiceClient();

  const { data: conflicts, error } = await supabase
    .from("conflicts")
    .select("*")
    .order("detected_at", { ascending: false })
    .returns<ConflictsRow[]>();
  if (error) throw new Error(error.message);

  const itemIds = Array.from(
    new Set((conflicts ?? []).flatMap((c) => [c.item_a_id, c.item_b_id]))
  );
  const entityIds = Array.from(
    new Set((conflicts ?? []).map((c) => c.entity_id).filter((id): id is string => id !== null))
  );

  const { data: items } = itemIds.length
    ? await supabase.from("items").select("id, summary, date").in("id", itemIds)
    : { data: [] };
  const { data: entities } = entityIds.length
    ? await supabase.from("entities").select("id, name").in("id", entityIds)
    : { data: [] };

  const itemById = new Map((items ?? []).map((i) => [i.id, i]));
  const entityById = new Map((entities ?? []).map((e) => [e.id, e]));

  const conflictsWithItems: ConflictWithItems[] = (conflicts ?? []).map((c) => ({
    ...c,
    itemASummary: itemById.get(c.item_a_id)?.summary ?? "(item not found)",
    itemADate: itemById.get(c.item_a_id)?.date ?? "",
    itemBSummary: itemById.get(c.item_b_id)?.summary ?? "(item not found)",
    itemBDate: itemById.get(c.item_b_id)?.date ?? "",
    entityName: c.entity_id ? entityById.get(c.entity_id)?.name ?? null : null,
  }));

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-white">Conflicts</h1>
      <ConflictsClient conflicts={conflictsWithItems} />
    </div>
  );
}
