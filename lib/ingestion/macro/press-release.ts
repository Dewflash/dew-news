import type { AIProvider } from "@/lib/ai/provider";

/** Strips tags/scripts down to plain text — good enough for a model to read prose from, not a layout-faithful render. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export interface PressReleaseReading {
  value: number;
  periodDate: string | null;
}

/**
 * For the 5 indicators with no structured API (dashboard.md): fetches a
 * public press-release/listing page and asks the configured AI provider to
 * find the most recent headline figure. Returns null on any failure —
 * caller must render "Data unavailable", never fabricate a value.
 */
export async function fetchPressReleaseHeadline(
  provider: AIProvider,
  url: string,
  indicatorName: string,
  instruction: string
): Promise<{ reading: PressReleaseReading | null; inputTokens: number; outputTokens: number }> {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (dew-news macro indicator fetch)" } });
  if (!res.ok) throw new Error(`Fetch of ${url} failed: ${res.status} ${res.statusText}`);

  const html = await res.text();
  const text = htmlToText(html);

  const { data, inputTokens, outputTokens } = await provider.extractMacroHeadline(indicatorName, instruction, text);

  if (!data.found || data.value === null) {
    return { reading: null, inputTokens, outputTokens };
  }
  return { reading: { value: data.value, periodDate: data.periodDate }, inputTokens, outputTokens };
}
