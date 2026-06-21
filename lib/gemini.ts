import { GoogleGenAI } from "@google/genai";
import type {
  AICallResult,
  AIProvider,
  ConflictResult,
  CorrelationResult,
  DedupResult,
  ExtractedItem,
  MacroHeadlineResult,
  SummaryResult,
} from "@/lib/ai/provider";
import {
  createRateLimiter,
  parseJsonArray,
  parseJsonObject,
  parseNarrativeWithJsonFooter,
  serializeItemForPrompt,
  serializeItemForSummaryPrompt,
  withRetry,
} from "@/lib/ai/utils";
import { buildConflictPrompt } from "@/lib/prompts/conflict";
import { buildCorrelationPrompt } from "@/lib/prompts/correlation";
import { buildDedupPrompt } from "@/lib/prompts/dedup";
import { buildExtractionPrompt, type RagContext } from "@/lib/prompts/extraction";
import { buildMacroHeadlinePrompt } from "@/lib/prompts/macro-headline";
import { buildSummaryPrompt } from "@/lib/prompts/summary";
import type { ItemsRow, Sentiment } from "@/types/database";

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

  /**
   * Unlike every other prompt (pure JSON), Section 7.6's summary prompt asks
   * for prose followed by a JSON footer — forcing `responseMimeType:
   * "application/json"` here would make the model mangle the narrative to
   * fit a JSON shape instead of returning the mixed format we actually want.
   */
  private async callFreeform(prompt: string, temperature: number, maxOutputTokens: number) {
    return withRetry(
      () =>
        this.client.models.generateContent({
          model: this.model,
          contents: prompt,
          config: {
            temperature,
            maxOutputTokens,
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

  async summarise(items: ItemsRow[], type: "weekly" | "monthly"): Promise<AICallResult<SummaryResult>> {
    if (items.length === 0) {
      return { data: { narrative: "", key_themes: [], dominant_sentiment: "neutral", watchlist_mentions: {} }, inputTokens: 0, outputTokens: 0 };
    }

    const dates = items.map((i) => i.date).sort();
    const prompt = buildSummaryPrompt(
      type,
      dates[0],
      dates[dates.length - 1],
      items.length,
      JSON.stringify(items.map(serializeItemForSummaryPrompt))
    );

    // Section 6.3: summary calls get a slightly higher temperature for more interpretive prose.
    const summaryTemperature = Math.min(this.temperature + 0.1, 0.8);
    const response = await this.callFreeform(prompt, summaryTemperature, 8192);
    const { narrative, json } = parseNarrativeWithJsonFooter(response.text ?? "");

    return {
      data: {
        narrative,
        key_themes: Array.isArray(json.key_themes) ? (json.key_themes as string[]) : [],
        dominant_sentiment: (json.dominant_sentiment as Sentiment) ?? "neutral",
        watchlist_mentions: (json.watchlist_mentions as Record<string, number>) ?? {},
      },
      inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
    };
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

  async extractMacroHeadline(
    indicatorName: string,
    instruction: string,
    pageText: string
  ): Promise<AICallResult<MacroHeadlineResult>> {
    const prompt = buildMacroHeadlinePrompt(indicatorName, instruction, pageText);
    const response = await this.call(prompt, 0, 1024);
    const json = parseJsonObject(response.text ?? "");

    return {
      data: {
        value: typeof json.value === "number" ? json.value : null,
        periodDate: typeof json.period_date === "string" ? json.period_date : null,
        found: json.found === true,
      },
      inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
    };
  }
}
