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
import { parseJsonArray, withRetry } from "@/lib/ai/utils";
import { buildDedupPrompt } from "@/lib/prompts/dedup";
import { buildExtractionPrompt, type RagContext } from "@/lib/prompts/extraction";
import type { ItemsRow } from "@/types/database";

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

  private async call(prompt: string, temperature: number, maxOutputTokens: number) {
    return withRetry(() =>
      this.client.models.generateContent({
        model: this.model,
        contents: prompt,
        config: { temperature, maxOutputTokens },
      })
    );
  }

  async extract(newsletterBody: string, ragContext?: string): Promise<AICallResult<ExtractedItem[]>> {
    const rag: RagContext | undefined = ragContext
      ? { lookbackDays: 0, watchlistEntities: "", recentItemsSummary: ragContext }
      : undefined;
    const prompt = buildExtractionPrompt(newsletterBody, rag);

    const response = await this.call(prompt, this.temperature, 4096);
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

    const response = await this.call(prompt, this.temperature, 2048);
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

  async detectConflicts(): Promise<AICallResult<ConflictResult[]>> {
    throw new Error("GeminiProvider.detectConflicts is not implemented until Phase 5b.");
  }

  async detectCorrelations(): Promise<AICallResult<CorrelationResult[]>> {
    throw new Error("GeminiProvider.detectCorrelations is not implemented until Phase 5b.");
  }
}
