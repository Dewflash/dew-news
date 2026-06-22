/**
 * Macro Indicators Dashboard (dashboard.md): for the 5 indicators with no
 * free structured API (ISM Mfg/Services PMI, Conference Board LEI/Consumer
 * Confidence, UMich Sentiment), the only free source is a public press
 * release/listing page. Rather than a brittle CSS-selector scraper, this
 * prompt asks the model to find the single most recent headline figure in
 * free text — resilient to page layout changes, fragile only to the org
 * actually changing how they phrase the number.
 */
const MACRO_HEADLINE_PROMPT_TEMPLATE = `You are extracting a single economic data point from a public web page's text content.

Indicator: {{indicator_name}}
What to find: {{instruction}}

Page text:
{{page_text}}

Find the most recent headline figure for this indicator and the period (month/date) it refers to. If you cannot find it with confidence, say so.

Return JSON only, no other text:
{
  "value": <number, or null if not found>,
  "period_date": "<YYYY-MM-DD, the first day of the month/period this reading covers, or null>",
  "found": <true or false>
}`;

/**
 * Real corporate sites carry tens of KB of nav/footer/cookie-banner text
 * before the actual press-release content — a Consumer Confidence fetch
 * failed in production because a 12,000-char cutoff never reached the real
 * text. 60,000 chars (~15K tokens) is cheap for a single short extraction
 * call and comfortably covers any of this dashboard's source pages.
 */
const MAX_PAGE_TEXT_CHARS = 60_000;

export function buildMacroHeadlinePrompt(indicatorName: string, instruction: string, pageText: string): string {
  return MACRO_HEADLINE_PROMPT_TEMPLATE.replace("{{indicator_name}}", indicatorName)
    .replace("{{instruction}}", instruction)
    .replace("{{page_text}}", pageText.slice(0, MAX_PAGE_TEXT_CHARS));
}
