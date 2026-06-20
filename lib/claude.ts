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
import { buildDedupPrompt } from "@/lib/prompts/dedup";
import { buildExtractionPrompt, type RagContext } from "@/lib/prompts/extraction";
import type { ItemsRow } from "@/types/database";

const MAX_RETRIES = 3;

/** Section 17.2: exponential backoff, max 3 retries, on any AI API call. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
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

function parseJsonArray(text: string): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(text));
  } catch {
    throw new Error(`Claude returned invalid JSON: ${text.slice(0, 500)}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected a JSON array, got: ${text.slice(0, 500)}`);
  }
  return parsed;
}

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

  async extract(newsletterBody: string, ragContext?: string): Promise<AICallResult<ExtractedItem[]>> {
    const rag: RagContext | undefined = ragContext
      ? { lookbackDays: 0, watchlistEntities: "", recentItemsSummary: ragContext }
      : undefined;
    const prompt = buildExtractionPrompt(newsletterBody, rag);

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

  async detectConflicts(): Promise<AICallResult<ConflictResult[]>> {
    throw new Error("ClaudeProvider.detectConflicts is not implemented until Phase 5.");
  }

  async detectCorrelations(): Promise<AICallResult<CorrelationResult[]>> {
    throw new Error("ClaudeProvider.detectCorrelations is not implemented until Phase 5.");
  }
}
