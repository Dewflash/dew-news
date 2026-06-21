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
