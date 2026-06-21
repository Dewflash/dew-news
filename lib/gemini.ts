import { GoogleGenAI } from "@google/genai";
import type {
  AICallResult,
  AIProvider,
  ConflictResult,
  CorrelationResult,
  DedupResult,
  ExtractedItem,
  SummaryResult,
} from "@/lib/ai/provider";
import { createRateLimiter, parseJsonArray, serializeItemForPrompt, withRetry } from "@/lib/ai/utils";
import { buildConflictPrompt } from "@/lib/prompts/conflict";
import { buildCorrelationPrompt } from "@/lib/prompts/correlation";
import { buildDedupPrompt } from "@/lib/prompts/dedup";
import { buildExtractionPrompt, type RagContext } from "@/lib/prompts/extraction";
import type { ItemsRow } from "@/types/database";

/**
 * Gemini's free tier has a tight requests-per-minute cap, separate from
 * total token quota — a fetch run's burst of extract/dedup/conflict/
 * correlation calls can exceed it even with plenty of tokens left. Module-
 * level so it's shared across every GeminiProvider instance in this
 * process (a new instance is created per fetch run, but the limit is
 * per-API-key, not per-run). Confirmed via a real 429 response: the
 * gemini-2.5-flash free tier is capped at 5 requests/minute
 * ("GenerateRequestsPerMinutePerProjectPerModel-FreeTier", quotaValue: "5")
 * — 12s minimum spacing, plus a small buffer. Still widens further on any
 * 429 that does occur (e.g. other models/tiers with different caps).
 */
const geminiRateLimiter = createRateLimiter(13_000);

/** Section 6.1/6.2/15 Phase 5 task 9 — Gemini implementation of the unified AIProvider interface. */
export class GeminiProvider implements AIProvider {
  private client: GoogleGenAI;
  private model: string;
  private temperature: number;

  constructor(model: string, temperature: number) {
    this.client = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });
    this.model = model;
    this.temperature = temperature;
  }

  /**
   * Gemini 2.5 models spend part of `maxOutputTokens` on internal "thinking"
   * tokens before producing visible output, which was silently truncating
   * our JSON responses. `thinkingBudget: 0` disables that (we just need a
   * direct JSON answer, not a reasoning chain), and `responseMimeType`
   * forces raw JSON instead of markdown-fenced JSON.
   */
  private async call(prompt: string, temperature: number, maxOutputTokens: number) {
    return withRetry(
      () =>
        this.client.models.generateContent({
          model: this.model,
          contents: prompt,
          config: {
            temperature,
            maxOutputTokens,
            responseMimeType: "application/json",
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      geminiRateLimiter
    );
  }

  async extract(newsletterBody: string, ragContext?: RagContext): Promise<AICallResult<ExtractedItem[]>> {
    const prompt = buildExtractionPrompt(newsletterBody, ragContext);

    const response = await this.call(prompt, this.temperature, 8192);
    const data = parseJsonArray(response.text ?? "") as ExtractedItem[];

    return {
      data,
      inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
    };
  }

  async dedup(newItems: ItemsRow[], existingItems: ItemsRow[]): Promise<AICallResult<DedupResult[]>> {
    if (newItems.length === 0 || existingItems.length === 0) {
      return { data: [], inputTokens: 0, outputTokens: 0 };
    }

    const prompt = buildDedupPrompt(
      JSON.stringify(
        newItems.map((item, i) => ({ index: i, summary: item.summary, full_context: item.full_context, date: item.date }))
      ),
      JSON.stringify(existingItems.map((item) => ({ id: item.id, summary: item.summary, full_context: item.full_context, date: item.date })))
    );

    const response = await this.call(prompt, this.temperature, 4096);
    const data = parseJsonArray(response.text ?? "") as DedupResult[];

    return {
      data,
      inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
    };
  }

  async summarise(): Promise<AICallResult<SummaryResult>> {
    throw new Error("GeminiProvider.summarise is not implemented until Phase 6.");
  }

  async detectConflicts(newItem: ItemsRow, recentItems: ItemsRow[]): Promise<AICallResult<ConflictResult[]>> {
    if (recentItems.length === 0) return { data: [], inputTokens: 0, outputTokens: 0 };

    const prompt = buildConflictPrompt(
      JSON.stringify(serializeItemForPrompt(newItem)),
      JSON.stringify(recentItems.map(serializeItemForPrompt))
    );

    const response = await this.call(prompt, this.temperature, 4096);
    const data = parseJsonArray(response.text ?? "") as ConflictResult[];

    return {
      data,
      inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
    };
  }

  async detectCorrelations(newItem: ItemsRow, recentItems: ItemsRow[]): Promise<AICallResult<CorrelationResult[]>> {
    if (recentItems.length === 0) return { data: [], inputTokens: 0, outputTokens: 0 };

    const prompt = buildCorrelationPrompt(
      JSON.stringify(serializeItemForPrompt(newItem)),
      JSON.stringify(recentItems.map(serializeItemForPrompt))
    );

    const response = await this.call(prompt, this.temperature, 4096);
    const data = parseJsonArray(response.text ?? "") as CorrelationResult[];

    return {
      data,
      inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
    };
  }
}
