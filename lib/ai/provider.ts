import type { ItemSentence, ItemsRow, Sentiment, Significance } from "@/types/database";
import { ClaudeProvider } from "@/lib/claude";
import { GeminiProvider } from "@/lib/gemini";
import { OpenAIProvider } from "@/lib/openai";
import type { RagContext } from "@/lib/prompts/extraction";

export interface ExtractedEntity {
  name: string;
  type: string;
  ticker: string | null;
  relevance: "primary" | "secondary";
}

export interface ExtractedItem {
  summary: string;
  sentences: ItemSentence[];
  full_context: string;
  significance: Significance;
  sentiment: Sentiment;
  sentiment_reasoning: string;
  gics_sector: string | null;
  gics_industry_group: string | null;
  gics_industry: string | null;
  gics_sub_industry: string | null;
  secondary_categories: string[];
  entities: ExtractedEntity[];
  date: string;
}

export interface DedupResult {
  new_item_index: number;
  is_duplicate: boolean;
  duplicate_of_id: string | null;
}

export interface ConflictResult {
  existing_item_id: string;
  conflict_summary: string;
  days_apart: number;
}

export interface CorrelationResult {
  existing_item_id: string;
  correlation_summary: string;
  direction: "positive" | "negative" | "neutral";
  confidence: number;
}

export interface SummaryResult {
  narrative: string;
  key_themes: string[];
  dominant_sentiment: Sentiment;
  watchlist_mentions: Record<string, number>;
}

export interface AICallResult<T> {
  data: T;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Unified interface every provider implements (Section 6.1). Summarisation
 * is a Phase 6 pipeline stage (Section 15) — declared here so the interface
 * is stable across phases, but not implemented until then.
 */
export interface AIProvider {
  extract(newsletterBody: string, ragContext?: RagContext): Promise<AICallResult<ExtractedItem[]>>;
  dedup(newItems: ItemsRow[], existingItems: ItemsRow[]): Promise<AICallResult<DedupResult[]>>;
  summarise(items: ItemsRow[], type: "weekly" | "monthly"): Promise<AICallResult<SummaryResult>>;
  detectConflicts(newItem: ItemsRow, recentItems: ItemsRow[]): Promise<AICallResult<ConflictResult[]>>;
  detectCorrelations(newItem: ItemsRow, recentItems: ItemsRow[]): Promise<AICallResult<CorrelationResult[]>>;
}

/** Section 6.3: provider/model/temperature are read from settings at the start of each fetch run. */
export function getAIProvider(providerName: string, model: string, temperature: number): AIProvider {
  switch (providerName) {
    case "claude":
      return new ClaudeProvider(model, temperature);
    case "gemini":
      return new GeminiProvider(model, temperature);
    case "openai":
      return new OpenAIProvider(model, temperature);
    default:
      throw new Error(`AI provider "${providerName}" is not recognized.`);
  }
}
