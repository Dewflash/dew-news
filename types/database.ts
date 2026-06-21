/**
 * Hand-written types matching supabase/migrations/0001_init.sql (SPEC.md Section 4).
 *
 * These mirror the shape produced by `supabase gen types typescript`. If the
 * Supabase CLI is linked to the project later, this file can be regenerated
 * and should match closely.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/** Fields in `K` are required for insert; everything else is optional. */
type Insertable<Row, K extends keyof Row> = {
  [P in K]: Row[P];
} & {
  [P in Exclude<keyof Row, K>]?: Row[P];
};

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------
export type UsersRow = {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
  last_login: string | null;
};
export type UsersInsert = {
  id?: string;
  email: string;
  name?: string | null;
  created_at?: string;
  last_login?: string | null;
};
export type UsersUpdate = Partial<UsersRow>;

// ---------------------------------------------------------------------------
// entities
// ---------------------------------------------------------------------------
export type EntityType =
  | "commodity"
  | "equity"
  | "index"
  | "currency"
  | "country"
  | "person"
  | "institution"
  | "crypto"
  | "other";

export type EntitiesRow = {
  id: string;
  user_id: string;
  name: string;
  type: EntityType;
  ticker: string | null;
  exchange: string | null;
  gics_sector: string | null;
  country: string | null;
  aliases: string[];
  first_seen: string;
  last_seen: string;
  mention_count: number;
};
export type EntitiesInsert = Insertable<EntitiesRow, "user_id" | "name" | "type">;
export type EntitiesUpdate = Partial<EntitiesRow>;

// ---------------------------------------------------------------------------
// sources
// ---------------------------------------------------------------------------
export type SourcesRow = {
  id: string;
  user_id: string;
  name: string;
  sender_email: string;
  provider: string;
  is_active: boolean;
  fetch_priority: number;
  notes: string | null;
  created_at: string;
};
export type SourcesInsert = Insertable<SourcesRow, "user_id" | "name" | "sender_email">;
export type SourcesUpdate = Partial<SourcesRow>;

// ---------------------------------------------------------------------------
// fetch_runs
// ---------------------------------------------------------------------------
export type FetchRunStatus = "running" | "success" | "partial" | "failed";

export type FetchRunsRow = {
  id: string;
  user_id: string;
  triggered_by: string;
  started_at: string;
  completed_at: string | null;
  status: FetchRunStatus;
  emails_found: number;
  emails_processed: number;
  items_extracted: number;
  items_deduplicated: number;
  error_message: string | null;
  provider_used: string | null;
  model_used: string | null;
  total_input_tokens: number;
  total_output_tokens: number;
  estimated_cost_usd: number;
};
export type FetchRunsInsert = Insertable<FetchRunsRow, "user_id" | "triggered_by">;
export type FetchRunsUpdate = Partial<FetchRunsRow>;

// ---------------------------------------------------------------------------
// digests
// ---------------------------------------------------------------------------
export type ProcessingStatus = "pending" | "success" | "failed" | "skipped";

export type DigestsRow = {
  id: string;
  fetch_run_id: string;
  source_id: string;
  user_id: string;
  email_subject: string | null;
  email_date: string | null;
  received_at: string | null;
  raw_body: string;
  gmail_message_id: string | null;
  processed_at: string | null;
  processing_status: ProcessingStatus;
  item_count: number;
  reading_time_seconds: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  reprocessed: boolean;
  reprocessed_at: string | null;
  created_at: string;
};
export type DigestsInsert = Insertable<
  DigestsRow,
  "fetch_run_id" | "source_id" | "user_id" | "raw_body"
>;
export type DigestsUpdate = Partial<DigestsRow>;

// ---------------------------------------------------------------------------
// items
// ---------------------------------------------------------------------------
export type Significance = 1 | 2 | 3;
export type Sentiment = "bullish" | "bearish" | "neutral" | "mixed";

export interface ItemSentence {
  index: number;
  text: string;
}

export type ItemsRow = {
  id: string;
  digest_id: string;
  user_id: string;
  date: string;
  summary: string;
  sentences: ItemSentence[];
  full_context: string | null;
  significance: Significance;
  sentiment: Sentiment;
  sentiment_reasoning: string | null;
  gics_sector: string | null;
  gics_industry_group: string | null;
  gics_industry: string | null;
  gics_sub_industry: string | null;
  secondary_categories: string[];
  custom_tags: string[];
  reading_time_seconds: number;
  is_duplicate: boolean;
  duplicate_of: string | null;
  created_at: string;
  updated_at: string;
  /** Generated column, read-only. */
  search_vector: unknown;
};
export type ItemsInsert = Insertable<
  Omit<ItemsRow, "search_vector">,
  "digest_id" | "user_id" | "date" | "summary" | "significance" | "sentiment"
>;
export type ItemsUpdate = Partial<Omit<ItemsRow, "search_vector">>;

// ---------------------------------------------------------------------------
// item_entities
// ---------------------------------------------------------------------------
export type EntityRelevance = "primary" | "secondary" | "contextual";

export type ItemEntitiesRow = {
  id: string;
  item_id: string;
  entity_id: string;
  mention_count: number;
  relevance: EntityRelevance;
};
export type ItemEntitiesInsert = Insertable<ItemEntitiesRow, "item_id" | "entity_id" | "relevance">;
export type ItemEntitiesUpdate = Partial<ItemEntitiesRow>;

// ---------------------------------------------------------------------------
// watchlist
// ---------------------------------------------------------------------------
export type WatchlistType = "static" | "dynamic";

export type WatchlistRow = {
  id: string;
  user_id: string;
  entity_id: string;
  type: WatchlistType;
  added_at: string;
  priority: number;
  dynamic_score: number;
  dynamic_window_days: number;
  is_active: boolean;
  notes: string | null;
  alert_threshold: number;
};
export type WatchlistInsert = Insertable<WatchlistRow, "user_id" | "entity_id" | "type">;
export type WatchlistUpdate = Partial<WatchlistRow>;

// ---------------------------------------------------------------------------
// annotations
// ---------------------------------------------------------------------------
export type AnnotationType = "highlight" | "star" | "note";
export type HighlightColour = "yellow" | "green" | "red";

export type AnnotationsRow = {
  id: string;
  user_id: string;
  item_id: string;
  sentence_index: number | null;
  annotation_type: AnnotationType;
  highlight_colour: HighlightColour | null;
  note_text: string | null;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
};
export type AnnotationsInsert = Insertable<AnnotationsRow, "user_id" | "item_id" | "annotation_type">;
export type AnnotationsUpdate = Partial<AnnotationsRow>;

// ---------------------------------------------------------------------------
// conflicts
// ---------------------------------------------------------------------------
export type ConflictsRow = {
  id: string;
  user_id: string;
  item_a_id: string;
  item_b_id: string;
  detected_at: string;
  conflict_summary: string;
  category: string | null;
  entity_id: string | null;
  days_apart: number | null;
  is_resolved: boolean;
  resolution_note: string | null;
  acknowledged: boolean;
};
export type ConflictsInsert = Insertable<
  ConflictsRow,
  "user_id" | "item_a_id" | "item_b_id" | "conflict_summary"
>;
export type ConflictsUpdate = Partial<ConflictsRow>;

// ---------------------------------------------------------------------------
// correlations
// ---------------------------------------------------------------------------
export type CorrelationDirection = "positive" | "negative" | "neutral";

export type CorrelationsRow = {
  id: string;
  user_id: string;
  item_a_id: string;
  item_b_id: string;
  detected_at: string;
  correlation_summary: string;
  direction: CorrelationDirection;
  confidence: number | null;
  category_a: string | null;
  category_b: string | null;
  entity_a_id: string | null;
  entity_b_id: string | null;
  is_dismissed: boolean;
};
export type CorrelationsInsert = Insertable<
  CorrelationsRow,
  "user_id" | "item_a_id" | "item_b_id" | "correlation_summary" | "direction"
>;
export type CorrelationsUpdate = Partial<CorrelationsRow>;

// ---------------------------------------------------------------------------
// summaries
// ---------------------------------------------------------------------------
export type SummaryType = "weekly" | "monthly";

export type SummariesRow = {
  id: string;
  user_id: string;
  type: SummaryType;
  period_start: string;
  period_end: string;
  generated_at: string;
  content: string;
  key_themes: string[];
  dominant_sentiment: Sentiment | null;
  item_count: number;
  watchlist_mentions: Json;
  provider_used: string | null;
  model_used: string | null;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  is_pinned: boolean;
};
export type SummariesInsert = Insertable<
  SummariesRow,
  "user_id" | "type" | "period_start" | "period_end" | "content"
>;
export type SummariesUpdate = Partial<SummariesRow>;

// ---------------------------------------------------------------------------
// conflicts_in_summaries
// ---------------------------------------------------------------------------
export type ConflictsInSummariesRow = {
  id: string;
  summary_id: string;
  conflict_id: string;
};
export type ConflictsInSummariesInsert = Insertable<
  ConflictsInSummariesRow,
  "summary_id" | "conflict_id"
>;
export type ConflictsInSummariesUpdate = Partial<ConflictsInSummariesRow>;

// ---------------------------------------------------------------------------
// token_usage
// ---------------------------------------------------------------------------
export type TokenCallType =
  | "extraction"
  | "dedup"
  | "summary"
  | "correlation"
  | "conflict"
  | "rag_context"
  | "other";

export type TokenUsageRow = {
  id: string;
  user_id: string;
  timestamp: string;
  call_type: TokenCallType;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number | null;
  reference_id: string | null;
  reference_type: string | null;
};
export type TokenUsageInsert = Insertable<
  TokenUsageRow,
  "user_id" | "call_type" | "provider" | "model" | "input_tokens" | "output_tokens"
>;
export type TokenUsageUpdate = Partial<TokenUsageRow>;

// ---------------------------------------------------------------------------
// processing_log
// ---------------------------------------------------------------------------
export type LogLevel = "info" | "warning" | "error";
export type LogStage =
  | "fetch"
  | "extract"
  | "dedup"
  | "correlate"
  | "conflict"
  | "summarise"
  | "annotation"
  | "system";

export type ProcessingLogRow = {
  id: string;
  user_id: string;
  fetch_run_id: string | null;
  timestamp: string;
  level: LogLevel;
  stage: LogStage;
  message: string;
  metadata: Json;
};
export type ProcessingLogInsert = Insertable<
  ProcessingLogRow,
  "user_id" | "level" | "stage" | "message"
>;
export type ProcessingLogUpdate = Partial<ProcessingLogRow>;

// ---------------------------------------------------------------------------
// settings
// ---------------------------------------------------------------------------
export type ActiveProvider = "claude" | "gemini" | "openai";
export type DedupSensitivity = "aggressive" | "moderate" | "loose";
export type DefaultView = "day" | "week" | "month";
export type CardDensity = "compact" | "expanded";
export type ExportFormat = "json" | "csv";

export type SettingsRow = {
  id: string;
  user_id: string;
  active_provider: ActiveProvider;
  active_model: string;
  temperature: number;
  max_tokens: number;
  fetch_schedule: string;
  fetch_enabled: boolean;
  lookback_days: number;
  dedup_sensitivity: DedupSensitivity;
  min_significance: Significance;
  active_categories: string[];
  entity_extraction: boolean;
  rag_context_enabled: boolean;
  rag_lookback_days: number;
  default_view: DefaultView;
  default_filter: string;
  card_density: CardDensity;
  show_sentiment_badges: boolean;
  show_reading_time: boolean;
  watchlist_pin_enabled: boolean;
  weekly_digest_enabled: boolean;
  monthly_digest_enabled: boolean;
  digest_day_of_week: number;
  digest_day_of_month: number;
  export_format: ExportFormat;
  updated_at: string;
};
export type SettingsInsert = Insertable<SettingsRow, "user_id">;
export type SettingsUpdate = Partial<SettingsRow>;

// ---------------------------------------------------------------------------
// macro_indicators / macro_indicator_readings (see dashboard.md)
// ---------------------------------------------------------------------------
export type CycleType = "leading" | "coincident" | "lagging";
export type Direction = "up" | "down";

export type MacroIndicatorsRow = {
  id: string;
  user_id: string;
  name: string;
  cycle_type: CycleType;
  frequency: string;
  source_name: string;
  source_url: string;
  fred_series_id: string | null;
  press_release_url: string | null;
  lead_lag_months: string | null;
  threshold_rule: string;
  direction_rule_key: string;
  analyst_note: string | null;
  sub_indices: string[];
  sort_order: number;
  created_at: string;
  updated_at: string;
};
export type MacroIndicatorsInsert = Insertable<
  MacroIndicatorsRow,
  "user_id" | "name" | "cycle_type" | "frequency" | "source_name" | "source_url" | "threshold_rule" | "direction_rule_key" | "sort_order"
>;
export type MacroIndicatorsUpdate = Partial<MacroIndicatorsRow>;

export type MacroIndicatorReadingsRow = {
  id: string;
  indicator_id: string;
  user_id: string;
  period_date: string;
  actual_value: number | null;
  previous_value: number | null;
  released_at: string | null;
  direction: Direction | null;
  fetch_error: string | null;
  created_at: string;
  updated_at: string;
};
export type MacroIndicatorReadingsInsert = Insertable<
  MacroIndicatorReadingsRow,
  "indicator_id" | "user_id" | "period_date"
>;
export type MacroIndicatorReadingsUpdate = Partial<MacroIndicatorReadingsRow>;

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------
type Table<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      users: Table<UsersRow, UsersInsert, UsersUpdate>;
      entities: Table<EntitiesRow, EntitiesInsert, EntitiesUpdate>;
      sources: Table<SourcesRow, SourcesInsert, SourcesUpdate>;
      fetch_runs: Table<FetchRunsRow, FetchRunsInsert, FetchRunsUpdate>;
      digests: Table<DigestsRow, DigestsInsert, DigestsUpdate>;
      items: Table<ItemsRow, ItemsInsert, ItemsUpdate>;
      item_entities: Table<ItemEntitiesRow, ItemEntitiesInsert, ItemEntitiesUpdate>;
      watchlist: Table<WatchlistRow, WatchlistInsert, WatchlistUpdate>;
      annotations: Table<AnnotationsRow, AnnotationsInsert, AnnotationsUpdate>;
      conflicts: Table<ConflictsRow, ConflictsInsert, ConflictsUpdate>;
      correlations: Table<CorrelationsRow, CorrelationsInsert, CorrelationsUpdate>;
      summaries: Table<SummariesRow, SummariesInsert, SummariesUpdate>;
      conflicts_in_summaries: Table<
        ConflictsInSummariesRow,
        ConflictsInSummariesInsert,
        ConflictsInSummariesUpdate
      >;
      token_usage: Table<TokenUsageRow, TokenUsageInsert, TokenUsageUpdate>;
      processing_log: Table<ProcessingLogRow, ProcessingLogInsert, ProcessingLogUpdate>;
      settings: Table<SettingsRow, SettingsInsert, SettingsUpdate>;
      macro_indicators: Table<MacroIndicatorsRow, MacroIndicatorsInsert, MacroIndicatorsUpdate>;
      macro_indicator_readings: Table<
        MacroIndicatorReadingsRow,
        MacroIndicatorReadingsInsert,
        MacroIndicatorReadingsUpdate
      >;
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
  };
};
