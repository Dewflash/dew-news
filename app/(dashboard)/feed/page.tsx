import { createServiceClient } from "@/lib/supabase/server";
import { FeedClient } from "@/components/feed/FeedClient";
import { buildDisplayItems, type DisplayItem, type RawItemRow } from "@/lib/items";
import { getUserId } from "@/lib/user";

export type { DisplayItem as FeedItem } from "@/lib/items";

export default async function FeedPage() {
  const supabase = createServiceClient();
  const userId = await getUserId(supabase);

  const { data: rawItems, error: itemsError } = await supabase
    .from("items")
    .select(
      "*, item_entities(relevance, entities(id, name, ticker, type)), digests(email_subject, gmail_message_id, sources(name))"
    )
    .order("date", { ascending: false })
    .returns<RawItemRow[]>();
  if (itemsError) throw new Error(itemsError.message);

  const { data: conflicts } = await supabase
    .from("conflicts")
    .select("item_a_id, item_b_id, conflict_summary");

  const { data: correlations } = await supabase
    .from("correlations")
    .select("item_a_id, item_b_id, correlation_summary");

  const { data: watchlist } = await supabase
    .from("watchlist")
    .select("entity_id, alert_threshold")
    .eq("type", "static")
    .eq("is_active", true);

  const { data: annotations } = await supabase
    .from("annotations")
    .select("*")
    .eq("user_id", userId)
    .eq("is_deleted", false);

  const items: DisplayItem[] = buildDisplayItems(
    rawItems ?? [],
    conflicts ?? [],
    correlations ?? [],
    watchlist ?? [],
    annotations ?? []
  );

  return <FeedClient items={items} />;
}
