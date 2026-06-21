import type { createServiceClient } from "@/lib/supabase/server";
import type { TokenCallType } from "@/types/database";

/**
 * Best-effort USD/million-token pricing for cost estimation (Section 9.8's
 * token usage summary). Section 6.3 makes the model field free-text ("Kevin
 * can type any model string"), so unknown models simply get a null
 * estimated cost rather than a guessed number.
 */
const PRICING_PER_MILLION_TOKENS: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-opus-4-8": { input: 15, output: 75 },
  "claude-haiku-4-5": { input: 0.8, output: 4 },
  "gemini-2.5-pro": { input: 1.25, output: 10 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
};

function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const pricing = PRICING_PER_MILLION_TOKENS[model];
  if (!pricing) return null;
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

/** Section 4.14: granular per-call token/cost logging, regardless of provider. */
export async function logTokenUsage(
  supabase: ReturnType<typeof createServiceClient>,
  params: {
    userId: string;
    callType: TokenCallType;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    referenceId?: string | null;
    referenceType?: string | null;
  }
) {
  const estimatedCostUsd = estimateCostUsd(params.model, params.inputTokens, params.outputTokens);

  const { error } = await supabase.from("token_usage").insert({
    user_id: params.userId,
    call_type: params.callType,
    provider: params.provider,
    model: params.model,
    input_tokens: params.inputTokens,
    output_tokens: params.outputTokens,
    estimated_cost_usd: estimatedCostUsd,
    reference_id: params.referenceId ?? null,
    reference_type: params.referenceType ?? null,
  });
  if (error) console.error("Failed to log token_usage:", error.message);

  return estimatedCostUsd;
}
