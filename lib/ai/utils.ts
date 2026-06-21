import type { ItemsRow } from "@/types/database";

const MAX_RETRIES = 3;

/** Section 17.2: exponential backoff, max 3 retries, on any AI API call. */
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 1000));
      }
    }
  }
  throw lastError;
}

/** Strips markdown code fences in case the model wraps its JSON despite instructions. */
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : text).trim();
}

export function parseJsonArray(text: string): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(text));
  } catch {
    throw new Error(`Model returned invalid JSON: ${text.slice(0, 500)}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected a JSON array, got: ${text.slice(0, 500)}`);
  }
  return parsed;
}

/** Shared item shape passed into dedup/conflict/correlation prompts — just enough for the model to compare items. */
export function serializeItemForPrompt(item: ItemsRow) {
  return {
    id: item.id,
    summary: item.summary,
    full_context: item.full_context,
    date: item.date,
    gics_sector: item.gics_sector,
    secondary_categories: item.secondary_categories,
  };
}
