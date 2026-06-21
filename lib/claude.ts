import Anthropic from "@anthropic-ai/sdk";
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

/** Section 6.1/6.2 — Claude implementation of the unified AIProvider interface. */
export class ClaudeProvider implements AIProvider {
  private client: Anthropic;
  private model: string;
  private temperature: number;

  constructor(model: string, temperature: number) {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.model = model;
    this.temperature = temperature;
  }

  private async call(prompt: string, temperature: number, maxTokens: number) {
    return withRetry(() =>
      this.client.messages.create({
        model: this.model,
        max_tokens: maxTokens,
        temperature,
        messages: [{ role: "user", content: prompt }],
      })
    );
  }

  private textOf(message: Anthropic.Message): string {
    return message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
  }

  async extract(newsletterBody: string, ragContext?: RagContext): Promise<AICallResult<ExtractedItem[]>> {
    const prompt = buildExtractionPrompt(newsletterBody, ragContext);

    const message = await this.call(prompt, this.temperature, 4096);
    const data = parseJsonArray(this.textOf(message)) as ExtractedItem[];

    return {
      data,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
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

    const message = await this.call(prompt, this.temperature, 2048);
    const data = parseJsonArray(this.textOf(message)) as DedupResult[];

    return {
      data,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    };
  }

  async summarise(): Promise<AICallResult<SummaryResult>> {
    throw new Error("ClaudeProvider.summarise is not implemented until Phase 6.");
  }

  async detectConflicts(newItem: ItemsRow, recentItems: ItemsRow[]): Promise<AICallResult<ConflictResult[]>> {
    if (recentItems.length === 0) return { data: [], inputTokens: 0, outputTokens: 0 };

    const prompt = buildConflictPrompt(
      JSON.stringify(serializeItemForPrompt(newItem)),
      JSON.stringify(recentItems.map(serializeItemForPrompt))
    );

    const message = await this.call(prompt, this.temperature, 2048);
    const data = parseJsonArray(this.textOf(message)) as ConflictResult[];

    return {
      data,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    };
  }

  async detectCorrelations(newItem: ItemsRow, recentItems: ItemsRow[]): Promise<AICallResult<CorrelationResult[]>> {
    if (recentItems.length === 0) return { data: [], inputTokens: 0, outputTokens: 0 };

    const prompt = buildCorrelationPrompt(
      JSON.stringify(serializeItemForPrompt(newItem)),
      JSON.stringify(recentItems.map(serializeItemForPrompt))
    );

    const message = await this.call(prompt, this.temperature, 2048);
    const data = parseJsonArray(this.textOf(message)) as CorrelationResult[];

    return {
      data,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    };
  }
}
