-- dew-news Phase 1 schema
-- All tables from SPEC.md Section 4. UUID primary keys, timestamptz timestamps,
-- user_id on every table for future multi-user support, RLS enabled everywhere.
--
-- Note: SPEC.md Section 4 has a duplicate "4.14" heading (token_usage and
-- processing_log). Both are distinct tables and both are created here, giving
-- 16 tables total instead of the "15" mentioned in the prose.

-- ============================================================================
-- 4.1 users
-- ============================================================================
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  name          TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  last_login    TIMESTAMPTZ
);

-- ============================================================================
-- 4.6 entities (created early: referenced by item_entities, watchlist, conflicts, correlations)
-- ============================================================================
CREATE TABLE entities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,               -- "Gold"
  type          TEXT NOT NULL CHECK (type IN (
                  'commodity','equity','index','currency',
                  'country','person','institution','crypto','other'
                )),
  ticker        TEXT,                         -- "XAU", "CEG", "STI"
  exchange      TEXT,                         -- "NYSE" | "SGX" | "COMEX"
  gics_sector   TEXT,                         -- for equities
  country       TEXT,
  aliases       TEXT[] DEFAULT '{}',          -- ["gold", "XAU/USD", "Gold Spot"]
  first_seen    TIMESTAMPTZ DEFAULT NOW(),
  last_seen     TIMESTAMPTZ DEFAULT NOW(),
  mention_count INT DEFAULT 1,
  UNIQUE(user_id, name)
);

-- ============================================================================
-- 4.2 sources
-- ============================================================================
CREATE TABLE sources (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,             -- "Reuters Morning Brief"
  sender_email    TEXT NOT NULL,             -- "noreply@mail.reuters.com"
  provider        TEXT NOT NULL DEFAULT 'gmail',
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  fetch_priority  INT NOT NULL DEFAULT 1,    -- lower = processed first
  notes           TEXT,                      -- user label e.g. "primary macro source"
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 4.3 fetch_runs
-- ============================================================================
CREATE TABLE fetch_runs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  triggered_by          TEXT NOT NULL,        -- "cron" | "manual"
  started_at            TIMESTAMPTZ DEFAULT NOW(),
  completed_at          TIMESTAMPTZ,
  status                TEXT NOT NULL DEFAULT 'running', -- "running" | "success" | "partial" | "failed"
  emails_found          INT DEFAULT 0,
  emails_processed      INT DEFAULT 0,
  items_extracted       INT DEFAULT 0,
  items_deduplicated    INT DEFAULT 0,
  error_message         TEXT,
  provider_used         TEXT,
  model_used            TEXT,
  total_input_tokens    INT DEFAULT 0,
  total_output_tokens   INT DEFAULT 0,
  estimated_cost_usd    NUMERIC(10,6) DEFAULT 0
);

-- ============================================================================
-- 4.4 digests
-- ============================================================================
CREATE TABLE digests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fetch_run_id        UUID NOT NULL REFERENCES fetch_runs(id) ON DELETE CASCADE,
  source_id           UUID NOT NULL REFERENCES sources(id),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_subject       TEXT,
  email_date          TIMESTAMPTZ,            -- when the email was sent
  received_at         TIMESTAMPTZ,            -- when Gmail delivered it
  raw_body            TEXT NOT NULL,          -- full email text, stored for reprocessing
  processed_at        TIMESTAMPTZ,
  processing_status   TEXT NOT NULL DEFAULT 'pending', -- "pending" | "success" | "failed" | "skipped"
  item_count          INT DEFAULT 0,
  reading_time_seconds INT DEFAULT 0,
  input_tokens        INT DEFAULT 0,
  output_tokens       INT DEFAULT 0,
  estimated_cost_usd  NUMERIC(10,6) DEFAULT 0,
  reprocessed         BOOLEAN DEFAULT FALSE,
  reprocessed_at      TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 4.5 items
-- ============================================================================
CREATE TABLE items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  digest_id           UUID NOT NULL REFERENCES digests(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date                DATE NOT NULL,              -- normalised date of the news event
  summary             TEXT NOT NULL,              -- Claude's one-sentence extraction
  sentences           JSONB NOT NULL DEFAULT '[]', -- [{index: 0, text: "..."}, ...]
  full_context        TEXT,                        -- fuller paragraph for annotation context
  significance        INT NOT NULL CHECK (significance IN (1,2,3)), -- 1=low, 2=medium, 3=high
  sentiment           TEXT NOT NULL CHECK (sentiment IN ('bullish','bearish','neutral','mixed')),
  sentiment_reasoning TEXT,                        -- why Claude assigned this sentiment
  gics_sector         TEXT,                        -- e.g. "Energy"
  gics_industry_group TEXT,                        -- e.g. "Energy"
  gics_industry       TEXT,                        -- e.g. "Oil Gas & Consumable Fuels"
  gics_sub_industry   TEXT,                        -- e.g. "Integrated Oil & Gas"
  secondary_categories TEXT[] DEFAULT '{}',        -- ["Geopolitics", "Macro & Central Banks"]
  custom_tags         TEXT[] DEFAULT '{}',          -- user-defined tags
  reading_time_seconds INT DEFAULT 0,
  is_duplicate        BOOLEAN DEFAULT FALSE,
  duplicate_of        UUID REFERENCES items(id),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  -- From Section 9.7 (Search View): full-text search column, included in the
  -- initial schema so no later migration is needed to add it.
  search_vector       tsvector GENERATED ALWAYS AS (
                        to_tsvector('english', coalesce(summary, '') || ' ' || coalesce(full_context, ''))
                      ) STORED
);

CREATE INDEX items_date_idx ON items(date);
CREATE INDEX items_user_date_idx ON items(user_id, date);
CREATE INDEX items_significance_idx ON items(significance);
CREATE INDEX items_gics_sector_idx ON items(gics_sector);
CREATE INDEX items_search_idx ON items USING GIN(search_vector);

-- ============================================================================
-- 4.7 item_entities
-- ============================================================================
CREATE TABLE item_entities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id       UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  entity_id     UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  mention_count INT DEFAULT 1,
  relevance     TEXT NOT NULL CHECK (relevance IN ('primary','secondary','contextual')),
  UNIQUE(item_id, entity_id)
);

-- ============================================================================
-- 4.8 watchlist
-- ============================================================================
CREATE TABLE watchlist (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_id           UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  type                TEXT NOT NULL CHECK (type IN ('static','dynamic')),
  added_at            TIMESTAMPTZ DEFAULT NOW(),
  priority            INT DEFAULT 0,          -- manual sort order for static entries
  dynamic_score       NUMERIC DEFAULT 0,      -- frequency score, recalculated daily
  dynamic_window_days INT DEFAULT 7,          -- rolling window for frequency calculation
  is_active           BOOLEAN DEFAULT TRUE,
  notes               TEXT,                   -- "core position" | "watching for entry"
  alert_threshold     INT DEFAULT 2,          -- significance score that triggers top-of-feed pin
  UNIQUE(user_id, entity_id)
);

-- ============================================================================
-- 4.9 annotations
-- ============================================================================
CREATE TABLE annotations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id          UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  sentence_index   INT,                        -- NULL = annotation on whole item
  annotation_type  TEXT NOT NULL CHECK (annotation_type IN ('highlight','star','note')),
  highlight_colour TEXT CHECK (highlight_colour IN ('yellow','green','red')),
  note_text        TEXT,                       -- NULL if not a note annotation
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  is_deleted       BOOLEAN DEFAULT FALSE        -- soft delete
);

CREATE INDEX annotations_item_idx ON annotations(item_id);
CREATE INDEX annotations_user_idx ON annotations(user_id);

-- ============================================================================
-- 4.10 conflicts
-- ============================================================================
CREATE TABLE conflicts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_a_id         UUID NOT NULL REFERENCES items(id),
  item_b_id         UUID NOT NULL REFERENCES items(id),
  detected_at       TIMESTAMPTZ DEFAULT NOW(),
  conflict_summary  TEXT NOT NULL,             -- "Fed signalled cuts on Jan 5 but hikes on Feb 12"
  category          TEXT,                      -- which category the conflict sits in
  entity_id         UUID REFERENCES entities(id), -- central entity of the conflict
  days_apart        INT,                       -- gap between the two items
  is_resolved       BOOLEAN DEFAULT FALSE,
  resolution_note   TEXT,                      -- user's explanation of resolution
  acknowledged      BOOLEAN DEFAULT FALSE      -- user has seen the flag
);

-- ============================================================================
-- 4.11 correlations
-- ============================================================================
CREATE TABLE correlations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_a_id           UUID NOT NULL REFERENCES items(id),
  item_b_id           UUID NOT NULL REFERENCES items(id),
  detected_at         TIMESTAMPTZ DEFAULT NOW(),
  correlation_summary TEXT NOT NULL,           -- "Oil prices up may pressure airline margins"
  direction           TEXT NOT NULL CHECK (direction IN ('positive','negative','neutral')),
  confidence          NUMERIC(3,2) CHECK (confidence BETWEEN 0 AND 1),
  category_a          TEXT,
  category_b          TEXT,
  entity_a_id         UUID REFERENCES entities(id),
  entity_b_id         UUID REFERENCES entities(id),
  is_dismissed        BOOLEAN DEFAULT FALSE    -- user can dismiss false positives
);

-- ============================================================================
-- 4.12 summaries
-- ============================================================================
CREATE TABLE summaries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type                TEXT NOT NULL CHECK (type IN ('weekly','monthly')),
  period_start        DATE NOT NULL,
  period_end          DATE NOT NULL,
  generated_at        TIMESTAMPTZ DEFAULT NOW(),
  content             TEXT NOT NULL,           -- full generated summary text
  key_themes          TEXT[] DEFAULT '{}',     -- top themes Claude identified
  dominant_sentiment  TEXT CHECK (dominant_sentiment IN ('bullish','bearish','neutral','mixed')),
  item_count          INT DEFAULT 0,
  watchlist_mentions  JSONB DEFAULT '{}',      -- {entity_id: mention_count}
  provider_used       TEXT,
  model_used          TEXT,
  input_tokens        INT DEFAULT 0,
  output_tokens       INT DEFAULT 0,
  estimated_cost_usd  NUMERIC(10,6) DEFAULT 0,
  is_pinned           BOOLEAN DEFAULT FALSE
);

-- ============================================================================
-- 4.13 conflicts_in_summaries
-- ============================================================================
CREATE TABLE conflicts_in_summaries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_id  UUID NOT NULL REFERENCES summaries(id) ON DELETE CASCADE,
  conflict_id UUID NOT NULL REFERENCES conflicts(id) ON DELETE CASCADE,
  UNIQUE(summary_id, conflict_id)
);

-- ============================================================================
-- 4.14 token_usage
-- ============================================================================
CREATE TABLE token_usage (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  timestamp       TIMESTAMPTZ DEFAULT NOW(),
  call_type       TEXT NOT NULL CHECK (call_type IN (
                    'extraction','dedup','summary','correlation',
                    'conflict','rag_context','other'
                  )),
  provider        TEXT NOT NULL,
  model           TEXT NOT NULL,
  input_tokens    INT NOT NULL,
  output_tokens   INT NOT NULL,
  estimated_cost_usd NUMERIC(10,6),
  reference_id    UUID,                        -- FK to whichever table triggered the call
  reference_type  TEXT                         -- "digest" | "summary" | "conflict" etc
);

CREATE INDEX token_usage_user_idx ON token_usage(user_id);
CREATE INDEX token_usage_timestamp_idx ON token_usage(timestamp);

-- ============================================================================
-- 4.14 (second) processing_log
-- ============================================================================
CREATE TABLE processing_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fetch_run_id  UUID REFERENCES fetch_runs(id),
  timestamp     TIMESTAMPTZ DEFAULT NOW(),
  level         TEXT NOT NULL CHECK (level IN ('info','warning','error')),
  stage         TEXT NOT NULL CHECK (stage IN (
                  'fetch','extract','dedup','correlate',
                  'conflict','summarise','annotation','system'
                )),
  message       TEXT NOT NULL,
  metadata      JSONB DEFAULT '{}'            -- flexible extra context
);

CREATE INDEX processing_log_run_idx ON processing_log(fetch_run_id);
CREATE INDEX processing_log_level_idx ON processing_log(level);

-- ============================================================================
-- 4.15 settings
-- ============================================================================
CREATE TABLE settings (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,

  -- AI Provider
  active_provider         TEXT NOT NULL DEFAULT 'claude'
                            CHECK (active_provider IN ('claude','gemini','openai')),
  active_model            TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  temperature             NUMERIC(3,2) NOT NULL DEFAULT 0.2
                            CHECK (temperature BETWEEN 0 AND 1),
  max_tokens              INT NOT NULL DEFAULT 2000,

  -- Fetch
  fetch_schedule          TEXT NOT NULL DEFAULT '0 6 * * *', -- 6am SGT daily
  fetch_enabled           BOOLEAN NOT NULL DEFAULT TRUE,
  lookback_days           INT NOT NULL DEFAULT 7,
  dedup_sensitivity       TEXT NOT NULL DEFAULT 'moderate'
                            CHECK (dedup_sensitivity IN ('aggressive','moderate','loose')),

  -- Extraction
  min_significance        INT NOT NULL DEFAULT 1 CHECK (min_significance IN (1,2,3)),
  active_categories       TEXT[] DEFAULT ARRAY[
                            'Macro & Central Banks',
                            'Markets & Commodities',
                            'Energy',
                            'Financials',
                            'Technology',
                            'Healthcare',
                            'Industrials',
                            'Real Estate',
                            'Consumer',
                            'Utilities',
                            'Materials',
                            'Communication Services',
                            'Geopolitics & Trade',
                            'Policy & Regulation',
                            'Sustainability & ESG',
                            'Governance',
                            'Miscellaneous'
                          ],
  entity_extraction       BOOLEAN NOT NULL DEFAULT TRUE,
  rag_context_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  rag_lookback_days       INT NOT NULL DEFAULT 30,

  -- Display
  default_view            TEXT NOT NULL DEFAULT 'day'
                            CHECK (default_view IN ('day','week','month')),
  default_filter          TEXT NOT NULL DEFAULT 'all',
  card_density            TEXT NOT NULL DEFAULT 'expanded'
                            CHECK (card_density IN ('compact','expanded')),
  show_sentiment_badges   BOOLEAN NOT NULL DEFAULT TRUE,
  show_reading_time       BOOLEAN NOT NULL DEFAULT TRUE,
  watchlist_pin_enabled   BOOLEAN NOT NULL DEFAULT TRUE,

  -- Digest
  weekly_digest_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
  monthly_digest_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  digest_day_of_week      INT NOT NULL DEFAULT 0 CHECK (digest_day_of_week BETWEEN 0 AND 6),
  digest_day_of_month     INT NOT NULL DEFAULT 1 CHECK (digest_day_of_month BETWEEN 1 AND 28),

  -- Annotations
  export_format           TEXT NOT NULL DEFAULT 'json'
                            CHECK (export_format IN ('json','csv')),

  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Row Level Security
--
-- This app authenticates via NextAuth (not Supabase Auth), and all
-- server-side data access uses the Supabase service_role key, which bypasses
-- RLS entirely. These policies are therefore a defense-in-depth layer: they
-- ensure the public anon key (exposed to the browser) can never read or
-- write any row, since auth.uid() will never match an application user_id
-- for requests that aren't authenticated through Supabase Auth.
-- ============================================================================

-- users: own row keyed by id
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_own" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "insert_own" ON users FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "update_own" ON users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "delete_own" ON users FOR DELETE USING (auth.uid() = id);

-- All tables with a direct user_id column
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'entities','sources','fetch_runs','digests','items','watchlist',
    'annotations','conflicts','correlations','summaries','token_usage',
    'processing_log','settings'
  ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "select_own" ON %I FOR SELECT USING (auth.uid() = user_id)', t);
    EXECUTE format('CREATE POLICY "insert_own" ON %I FOR INSERT WITH CHECK (auth.uid() = user_id)', t);
    EXECUTE format('CREATE POLICY "update_own" ON %I FOR UPDATE USING (auth.uid() = user_id)', t);
    EXECUTE format('CREATE POLICY "delete_own" ON %I FOR DELETE USING (auth.uid() = user_id)', t);
  END LOOP;
END $$;

-- item_entities: ownership derived via items.user_id
ALTER TABLE item_entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_own" ON item_entities FOR SELECT USING (
  EXISTS (SELECT 1 FROM items WHERE items.id = item_entities.item_id AND items.user_id = auth.uid())
);
CREATE POLICY "insert_own" ON item_entities FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM items WHERE items.id = item_entities.item_id AND items.user_id = auth.uid())
);
CREATE POLICY "update_own" ON item_entities FOR UPDATE USING (
  EXISTS (SELECT 1 FROM items WHERE items.id = item_entities.item_id AND items.user_id = auth.uid())
);
CREATE POLICY "delete_own" ON item_entities FOR DELETE USING (
  EXISTS (SELECT 1 FROM items WHERE items.id = item_entities.item_id AND items.user_id = auth.uid())
);

-- conflicts_in_summaries: ownership derived via summaries.user_id
ALTER TABLE conflicts_in_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_own" ON conflicts_in_summaries FOR SELECT USING (
  EXISTS (SELECT 1 FROM summaries WHERE summaries.id = conflicts_in_summaries.summary_id AND summaries.user_id = auth.uid())
);
CREATE POLICY "insert_own" ON conflicts_in_summaries FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM summaries WHERE summaries.id = conflicts_in_summaries.summary_id AND summaries.user_id = auth.uid())
);
CREATE POLICY "update_own" ON conflicts_in_summaries FOR UPDATE USING (
  EXISTS (SELECT 1 FROM summaries WHERE summaries.id = conflicts_in_summaries.summary_id AND summaries.user_id = auth.uid())
);
CREATE POLICY "delete_own" ON conflicts_in_summaries FOR DELETE USING (
  EXISTS (SELECT 1 FROM summaries WHERE summaries.id = conflicts_in_summaries.summary_id AND summaries.user_id = auth.uid())
);
