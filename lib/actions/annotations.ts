"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/user";
import type { HighlightColour } from "@/types/database";

/** Section 10.2: tapping the active colour again removes the highlight; tapping a different colour replaces it. */
export async function toggleHighlight(itemId: string, sentenceIndex: number, colour: HighlightColour) {
  const supabase = createServiceClient();
  const userId = await getUserId(supabase);

  const { data: existing } = await supabase
    .from("annotations")
    .select("id, highlight_colour")
    .eq("user_id", userId)
    .eq("item_id", itemId)
    .eq("sentence_index", sentenceIndex)
    .eq("annotation_type", "highlight")
    .eq("is_deleted", false)
    .maybeSingle();

  if (existing) {
    if (existing.highlight_colour === colour) {
      await supabase
        .from("annotations")
        .update({ is_deleted: true, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await supabase
        .from("annotations")
        .update({ highlight_colour: colour, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    }
  } else {
    await supabase.from("annotations").insert({
      user_id: userId,
      item_id: itemId,
      sentence_index: sentenceIndex,
      annotation_type: "highlight",
      highlight_colour: colour,
    });
  }
  revalidatePath("/feed");
  revalidatePath("/search");
}

/** Section 10.3: star annotation on the whole item (sentence_index = NULL). */
export async function toggleStar(itemId: string) {
  const supabase = createServiceClient();
  const userId = await getUserId(supabase);

  const { data: existing } = await supabase
    .from("annotations")
    .select("id")
    .eq("user_id", userId)
    .eq("item_id", itemId)
    .is("sentence_index", null)
    .eq("annotation_type", "star")
    .eq("is_deleted", false)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("annotations")
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    await supabase.from("annotations").insert({
      user_id: userId,
      item_id: itemId,
      sentence_index: null,
      annotation_type: "star",
    });
  }
  revalidatePath("/feed");
  revalidatePath("/search");
}

/** Section 10.4: free text note, per sentence or per item (sentenceIndex = null). Saving an empty string deletes the note. */
export async function saveNote(itemId: string, sentenceIndex: number | null, noteText: string) {
  const supabase = createServiceClient();
  const userId = await getUserId(supabase);
  const trimmed = noteText.trim();

  let query = supabase
    .from("annotations")
    .select("id")
    .eq("user_id", userId)
    .eq("item_id", itemId)
    .eq("annotation_type", "note")
    .eq("is_deleted", false);
  query = sentenceIndex === null ? query.is("sentence_index", null) : query.eq("sentence_index", sentenceIndex);
  const { data: existing } = await query.maybeSingle();

  if (!trimmed) {
    if (existing) {
      await supabase
        .from("annotations")
        .update({ is_deleted: true, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    }
  } else if (existing) {
    await supabase
      .from("annotations")
      .update({ note_text: trimmed, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    await supabase.from("annotations").insert({
      user_id: userId,
      item_id: itemId,
      sentence_index: sentenceIndex,
      annotation_type: "note",
      note_text: trimmed,
    });
  }
  revalidatePath("/feed");
  revalidatePath("/search");
}
