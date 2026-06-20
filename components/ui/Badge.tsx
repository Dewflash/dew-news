import type { Sentiment, Significance } from "@/types/database";

const SIGNIFICANCE_COLOUR: Record<Significance, string> = {
  3: "bg-bearish",
  2: "bg-amber-500",
  1: "bg-neutral",
};

export function SignificanceDot({ significance }: { significance: Significance }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${SIGNIFICANCE_COLOUR[significance]}`}
      title={`Significance ${significance}`}
    />
  );
}

const SENTIMENT_STYLE: Record<Sentiment, string> = {
  bullish: "bg-bullish/15 text-bullish",
  bearish: "bg-bearish/15 text-bearish",
  neutral: "bg-neutral/15 text-neutral",
  mixed: "bg-purple-500/15 text-purple-400",
};

export function SentimentBadge({ sentiment }: { sentiment: Sentiment }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${SENTIMENT_STYLE[sentiment]}`}
    >
      {sentiment}
    </span>
  );
}
