import type { ItemsRow } from "@/types/database";

const MAX_RETRIES = 3;
const DEFAULT_RATE_LIMIT_WAIT_MS = 20_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getStatus(err: unknown): number | undefined {
  return (err as { status?: number })?.status;
}

function isRateLimitError(err: unknown): boolean {
  if (getStatus(err) === 429) return true;
  const message = err instanceof Error ? err.message : String(err);
  return /RESOURCE_EXHAUSTED|rate.?limit/i.test(message);
}

/** Best-effort extraction of a provider-suggested retry delay (e.g. Google's `"retryDelay":"31s"`). */
function extractRetryDelayMs(err: unknown): number | null {
  const message = err instanceof Error ? err.message : String(err);
  const match = message.match(/retryDelay["\s:]+(\d+(?:\.\d+)?)s/i);
  return match ? Math.ceil(parseFloat(match[1]) * 1000) : null;
}

/**
 * Paces calls to a provider so we don't fire faster than its per-minute
 * rate limit allows. Free-tier limits (e.g. Gemini's) are tight enough that
 * a fetch run's burst of extract/dedup/conflict/correlation calls can
 * exceed them even with plenty of token quota left — this is a separate
 * constraint from total usage. Starts at `initialIntervalMs` between calls
 * and widens (via `backOff()`) every time a 429 is actually hit, so it
 * self-tunes during a run instead of guessing a fixed number up front.
 */
export interface RateLimiter {
  wait(): Promise<void>;
  backOff(): void;
}

export function createRateLimiter(initialIntervalMs: number, maxIntervalMs = 60_000): RateLimiter {
  let intervalMs = initialIntervalMs;
  let lastCallAt = 0;

  return {
    async wait() {
      const elapsed = Date.now() - lastCallAt;
      if (elapsed < intervalMs) await sleep(intervalMs - elapsed);
      lastCallAt = Date.now();
    },
    backOff() {
      intervalMs = Math.min(intervalMs * 1.5, maxIntervalMs);
    },
  };
}

/**
 * Section 17.2: retry on any AI API call. Rate-limit errors (429) are
 * handled separately from other transient errors — they get a long wait
 * (the provider's own suggested `retryDelay` if present, else 20s) instead
 * of the short exponential backoff used for everything else, and widen the
 * given `limiter`'s spacing so subsequent calls in this run slow down too.
 */
export async function withRetry<T>(fn: () => Promise<T>, limiter?: RateLimiter): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    await limiter?.wait();
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt >= MAX_RETRIES - 1) break;

      if (isRateLimitError(err)) {
        limiter?.backOff();
        await sleep(extractRetryDelayMs(err) ?? DEFAULT_RATE_LIMIT_WAIT_MS);
      } else {
        await sleep(2 ** attempt * 1000);
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

/** Carries the full, untruncated model output so callers can log it (e.g. into processing_log.metadata) instead of losing it. */
export class ModelOutputParseError extends Error {
  rawText: string;

  constructor(message: string, rawText: string) {
    super(message);
    this.name = "ModelOutputParseError";
    this.rawText = rawText;
  }
}

export function parseJsonArray(text: string): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(text));
  } catch {
    throw new ModelOutputParseError("Model returned invalid JSON.", text);
  }
  if (!Array.isArray(parsed)) {
    throw new ModelOutputParseError("Model returned valid JSON but it was not an array.", text);
  }
  return parsed;
}

export function parseJsonObject(text: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(text));
  } catch {
    throw new ModelOutputParseError("Model returned invalid JSON.", text);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ModelOutputParseError("Model returned valid JSON but it was not an object.", text);
  }
  return parsed as Record<string, unknown>;
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

/** Section 7.6: summary generation needs sentiment/significance too, for the "sentiment shift" and "lasting implications" sections. */
export function serializeItemForSummaryPrompt(item: ItemsRow) {
  return {
    summary: item.summary,
    full_context: item.full_context,
    date: item.date,
    gics_sector: item.gics_sector,
    secondary_categories: item.secondary_categories,
    sentiment: item.sentiment,
    significance: item.significance,
  };
}

/**
 * Section 7.6's summary prompt asks for prose followed by a JSON footer,
 * unlike every other prompt (which is JSON-only) — so it needs its own
 * parser instead of `parseJsonArray`. Prefers a fenced ```json``` block if
 * the model wrapped it despite instructions; otherwise falls back to the
 * last `{` in the text, since the footer is always the final thing returned.
 */
export function parseNarrativeWithJsonFooter(text: string): { narrative: string; json: Record<string, unknown> } {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    const narrative = text.slice(0, text.indexOf(fenced[0])).trim();
    try {
      return { narrative, json: JSON.parse(fenced[1]) };
    } catch {
      throw new ModelOutputParseError("Model's JSON footer was not valid JSON.", text);
    }
  }

  const lastBrace = text.lastIndexOf("{");
  if (lastBrace === -1) {
    throw new ModelOutputParseError("Model response had no JSON footer.", text);
  }
  const narrative = text.slice(0, lastBrace).trim();
  try {
    return { narrative, json: JSON.parse(text.slice(lastBrace)) };
  } catch {
    throw new ModelOutputParseError("Model's JSON footer was not valid JSON.", text);
  }
}
