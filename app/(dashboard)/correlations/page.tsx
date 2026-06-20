import { createServiceClient } from "@/lib/supabase/server";
import { CorrelationsClient, type CorrelationWithItems } from "@/components/correlations/CorrelationsClient";
import type { CorrelationsRow } from "@/types/database";

export default async function CorrelationsPage() {
  const supabase = createServiceClient();

  const { data: correlations, error } = await supabase
    .from("correlations")
    .select("*")
    .order("detected_at", { ascending: false })
    .returns<CorrelationsRow[]>();
  if (error) throw new Error(error.message);

  const itemIds = Array.from(
    new Set((correlations ?? []).flatMap((c) => [c.item_a_id, c.item_b_id]))
  );

  const { data: items } = itemIds.length
    ? await supabase.from("items").select("id, summary, date").in("id", itemIds)
    : { data: [] };

  const itemById = new Map((items ?? []).map((i) => [i.id, i]));

  const correlationsWithItems: CorrelationWithItems[] = (correlations ?? []).map((c) => ({
    ...c,
    itemASummary: itemById.get(c.item_a_id)?.summary ?? "(item not found)",
    itemADate: itemById.get(c.item_a_id)?.date ?? "",
    itemBSummary: itemById.get(c.item_b_id)?.summary ?? "(item not found)",
    itemBDate: itemById.get(c.item_b_id)?.date ?? "",
  }));

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-white">Correlations</h1>
      <CorrelationsClient correlations={correlationsWithItems} />
    </div>
  );
}
