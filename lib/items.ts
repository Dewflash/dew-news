import type { AnnotationsRow, EntityRelevance, EntityType, ItemsRow } from "@/types/database";

export interface DisplayItemEntity {
  id: string;
  name: string;
  ticker: string | null;
  type: EntityType;
  relevance: EntityRelevance;
}

export interface DisplayItem extends ItemsRow {
  entities: DisplayItemEntity[];
  sourceName: string | null;
  emailSubject: string | null;
  gmailUrl: string | null;
  hasConflict: boolean;
  conflictSummary: string | null;
  hasCorrelation: boolean;
  correlationSummary: string | null;
  isWatched: boolean;
  /** Non-deleted annotations for this item, hydrated from the DB (Section 10). */
  annotations: AnnotationsRow[];
}

export interface RawItemRow extends ItemsRow {
  item_entities: Array<{
    relevance: EntityRelevance;
    entities: { id: string; name: string; ticker: string | null; type: EntityType } | null;
  }>;
  digests: {
    email_subject: string | null;
    gmail_message_id: string | null;
    sources: { name: string } | null;
  } | null;
}

/** Section 8.1: deep link back into Gmail for the email an item was extracted from. */
function buildGmailUrl(messageId: string | null): string | null {
  return messageId ? `https://mail.google.com/mail/u/0/#all/${messageId}` : null;
}

export function buildDisplayItems(
  rawItems: RawItemRow[],
  conflicts: Array<{ item_a_id: string; item_b_id: string; conflict_summary: string }>,
  correlations: Array<{ item_a_id: string; item_b_id: string; correlation_summary: string }>,
  watchlist: Array<{ entity_id: string; alert_threshold: number }>,
  annotations: AnnotationsRow[] = []
): DisplayItem[] {
  const annotationsByItemId = new Map<string, AnnotationsRow[]>();
  for (const a of annotations) {
    const list = annotationsByItemId.get(a.item_id);
    if (list) list.push(a);
    else annotationsByItemId.set(a.item_id, [a]);
  }

  const conflictByItemId = new Map<string, string>();
  for (const c of conflicts) {
    conflictByItemId.set(c.item_a_id, c.conflict_summary);
    conflictByItemId.set(c.item_b_id, c.conflict_summary);
  }

  const correlationByItemId = new Map<string, string>();
  for (const c of correlations) {
    correlationByItemId.set(c.item_a_id, c.correlation_summary);
    correlationByItemId.set(c.item_b_id, c.correlation_summary);
  }

  const watchlistThresholdByEntityId = new Map<string, number>();
  for (const w of watchlist) {
    watchlistThresholdByEntityId.set(w.entity_id, w.alert_threshold);
  }

  return rawItems.map((row) => {
    const { item_entities, digests, ...rest } = row;
    const entities = item_entities
      .filter((ie) => ie.entities !== null)
      .map((ie) => ({ ...ie.entities!, relevance: ie.relevance }));
    const isWatched = entities.some(
      (e) =>
        watchlistThresholdByEntityId.has(e.id) &&
        row.significance >= watchlistThresholdByEntityId.get(e.id)!
    );

    return {
      ...rest,
      entities,
      sourceName: digests?.sources?.name ?? null,
      emailSubject: digests?.email_subject ?? null,
      gmailUrl: buildGmailUrl(digests?.gmail_message_id ?? null),
      hasConflict: conflictByItemId.has(row.id),
      conflictSummary: conflictByItemId.get(row.id) ?? null,
      hasCorrelation: correlationByItemId.has(row.id),
      correlationSummary: correlationByItemId.get(row.id) ?? null,
      isWatched,
      annotations: annotationsByItemId.get(row.id) ?? [],
    };
  });
}
