import OpenAI from "openai";
import type {
  AICallResult,
  AIProvider,
  ConflictResult,
  CorrelationResult,
  DedupResult,
  ExtractedItem,
  SummaryResult,
} from "@/lib/ai/provider";
import { parseJsonArray, serializeItemForPrompt, withRetry } from "@/lib/ai/utils";
import { buildConflictPrompt } from "@/lib/prompts/conflict";
import { buildCorrelationPrompt } from "@/lib/prompts/correlation";
import { buildDedupPrompt } from "@/lib/prompts/dedup";
import { buildExtractionPrompt, type RagContext } from "@/lib/prompts/extraction";
import type { ItemsRow } from "@/types/database";

/** Section 6.1/6.2/15 Phase 5 task 9 — OpenAI implementation of the unified AIProvider interface. */
export class OpenAIProvider implements AIProvider {
  private client: OpenAI;
  private model: string;
  private temperature: number;

  constructor(model: string, temperature: number) {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.model = model;
    this.temperature = temperature;
  }

  private async call(prompt: string, temperature: number, maxTokens: number) {
    return withRetry(() =>
      this.client.chat.completions.create({
        model: this.model,
        max_tokens: maxTokens,
        temperature,
        messages: [{ role: "user", content: prompt }],
      })
    );
  }

  async extract(newsletterBody: string, ragContext?: RagContext): Promise<AICallResult<ExtractedItem[]>> {
    const prompt = buildExtractionPrompt(newsletterBody, ragContext);

    const response = await this.call(prompt, this.temperature, 4096);
    const data = parseJsonArray(response.choices[0]?.message.content ?? "") as ExtractedItem[];

    return {
      data,
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
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
    const data = parseJsonArray(response.choices[0]?.message.content ?? "") as DedupResult[];

    return {
      data,
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    };
  }

  async summarise(): Promise<AICallResult<SummaryResult>> {
    throw new Error("OpenAIProvider.summarise is not implemented until Phase 6.");
  }

  async detectConflicts(newItem: ItemsRow, recentItems: ItemsRow[]): Promise<AICallResult<ConflictResult[]>> {
    if (recentItems.length === 0) return { data: [], inputTokens: 0, outputTokens: 0 };

    const prompt = buildConflictPrompt(
      JSON.stringify(serializeItemForPrompt(newItem)),
      JSON.stringify(recentItems.map(serializeItemForPrompt))
    );

    const response = await this.call(prompt, this.temperature, 2048);
    const data = parseJsonArray(response.choices[0]?.message.content ?? "") as ConflictResult[];

    return {
      data,
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    };
  }

  async detectCorrelations(newItem: ItemsRow, recentItems: ItemsRow[]): Promise<AICallResult<CorrelationResult[]>> {
    if (recentItems.length === 0) return { data: [], inputTokens: 0, outputTokens: 0 };

    const prompt = buildCorrelationPrompt(
      JSON.stringify(serializeItemForPrompt(newItem)),
      JSON.stringify(recentItems.map(serializeItemForPrompt))
    );

    const response = await this.call(prompt, this.temperature, 2048);
    const data = parseJsonArray(response.choices[0]?.message.content ?? "") as CorrelationResult[];

    return {
      data,
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    };
  }
}
