import { createServiceClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/user";
import type { ItemSentence, Sentiment, Significance } from "@/types/database";

export interface AnnotationExportRow {
  date: string;
  item_summary: string;
  sentence: string | null;
  sentence_index: number | null;
  annotation_type: string;
  highlight_colour: string | null;
  note: string | null;
  entities: string[];
  gics_sector: string | null;
  secondary_categories: string[];
  item_significance: Significance;
  item_sentiment: Sentiment;
}

interface ExportItemRow {
  id: string;
  date: string;
  summary: string;
  sentences: ItemSentence[];
  gics_sector: string | null;
  secondary_categories: string[];
  significance: Significance;
  sentiment: Sentiment;
}

interface ItemEntityNameRow {
  item_id: string;
  entities: { name: string } | null;
}

/** Section 10.5: training-data export of all non-deleted annotations, joined with their item context. */
export async function buildAnnotationExport(): Promise<AnnotationExportRow[]> {
  const supabase = createServiceClient();
  const userId = await getUserId(supabase);

  const { data: annotations, error } = await supabase
    .from("annotations")
    .select("*")
    .eq("user_id", userId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  if (!annotations || annotations.length === 0) return [];

  const itemIds = Array.from(new Set(annotations.map((a) => a.item_id)));

  const { data: items, error: itemsError } = await supabase
    .from("items")
    .select("id, date, summary, sentences, gics_sector, secondary_categories, significance, sentiment")
    .in("id", itemIds)
    .returns<ExportItemRow[]>();
  if (itemsError) throw new Error(itemsError.message);

  const { data: itemEntities } = await supabase
    .from("item_entities")
    .select("item_id, entities(name)")
    .in("item_id", itemIds)
    .returns<ItemEntityNameRow[]>();

  const itemById = new Map((items ?? []).map((i) => [i.id, i]));
  const entitiesByItemId = new Map<string, string[]>();
  for (const row of itemEntities ?? []) {
    const name = row.entities?.name;
    if (!name) continue;
    const list = entitiesByItemId.get(row.item_id);
    if (list) list.push(name);
    else entitiesByItemId.set(row.item_id, [name]);
  }

  const rows: AnnotationExportRow[] = [];
  for (const a of annotations) {
    const item = itemById.get(a.item_id);
    if (!item) continue;
    const sentence =
      a.sentence_index !== null ? item.sentences.find((s) => s.index === a.sentence_index)?.text ?? null : null;
    rows.push({
      date: item.date,
      item_summary: item.summary,
      sentence,
      sentence_index: a.sentence_index,
      annotation_type: a.annotation_type,
      highlight_colour: a.highlight_colour,
      note: a.note_text,
      entities: entitiesByItemId.get(a.item_id) ?? [],
      gics_sector: item.gics_sector,
      secondary_categories: item.secondary_categories,
      item_significance: item.significance,
      item_sentiment: item.sentiment,
    });
  }
  return rows;
}

export function annotationExportToCsv(rows: AnnotationExportRow[]): string {
  const headers = [
    "date",
    "item_summary",
    "sentence",
    "sentence_index",
    "annotation_type",
    "highlight_colour",
    "note",
    "entities",
    "gics_sector",
    "secondary_categories",
    "item_significance",
    "item_sentiment",
  ] as const;

  function escape(value: unknown): string {
    if (value === null || value === undefined) return "";
    const str = Array.isArray(value) ? value.join("; ") : String(value);
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  }

  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(","));
  }
  return lines.join("\n");
}
