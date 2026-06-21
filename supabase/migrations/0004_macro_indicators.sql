-- Macro Indicators Dashboard (see dashboard.md for full design/rationale).
-- Two new tables: a static catalog (macro_indicators) and a time series of
-- fetched readings (macro_indicator_readings). No existing tables touched.

-- ============================================================================
-- macro_indicators (static catalog, seeded once via scripts/seed-macro-indicators.ts)
-- ============================================================================
CREATE TABLE macro_indicators (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,               -- "ISM Manufacturing PMI"
  cycle_type        TEXT NOT NULL CHECK (cycle_type IN ('leading', 'coincident', 'lagging')),
  frequency         TEXT NOT NULL,                -- "Monthly (1st business day)", "Weekly (Thursday)", ...
  source_name       TEXT NOT NULL,                -- "Institute for Supply Management"
  source_url        TEXT NOT NULL,                -- ismworld.org / fred.stlouisfed.org / ...
  fred_series_id    TEXT,                         -- e.g. "MANEMP"; null if not on FRED
  press_release_url TEXT,                         -- for non-FRED indicators, fetched + AI-extracted
  lead_lag_months   TEXT,                         -- "1-3 months", "Concurrent", "-3 to -6 months"
  threshold_rule    TEXT NOT NULL,                -- free text: ">50 expanding, <45 recession risk"
  direction_rule_key TEXT NOT NULL,               -- code dispatch key, e.g. "ism_pmi_50", "sahm_rule" (see lib/ingestion/macro/direction.ts)
  analyst_note      TEXT,                         -- long-form practitioner note, shown in detail view
  sub_indices       TEXT[] DEFAULT '{}',          -- ["New Orders", "Employment"]
  sort_order        INT NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX macro_indicators_user_idx ON macro_indicators(user_id);
CREATE INDEX macro_indicators_sort_idx ON macro_indicators(sort_order);

-- ============================================================================
-- macro_indicator_readings (time series, one row per release period)
-- ============================================================================
CREATE TABLE macro_indicator_readings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_id    UUID NOT NULL REFERENCES macro_indicators(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_date     DATE NOT NULL,                  -- period this reading covers, e.g. 2026-06-01
  actual_value    NUMERIC,                         -- null = "Data unavailable" in UI, never fabricated
  previous_value  NUMERIC,                         -- prior period's actual ("Previous" column)
  released_at     TIMESTAMPTZ,
  direction       TEXT CHECK (direction IN ('up', 'down')), -- null = N/A, computed per lib/ingestion/macro/direction.ts
  fetch_error     TEXT,                            -- last fetch/extraction error, if any (cleared on success)
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (indicator_id, period_date)
);

CREATE INDEX macro_indicator_readings_indicator_idx ON macro_indicator_readings(indicator_id, period_date DESC);
CREATE INDEX macro_indicator_readings_user_idx ON macro_indicator_readings(user_id);

-- ============================================================================
-- Row Level Security (same pattern as 0001_init.sql's loop, applied directly
-- here since that DO block has already run and can't be re-invoked)
-- ============================================================================
ALTER TABLE macro_indicators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_own" ON macro_indicators FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert_own" ON macro_indicators FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own" ON macro_indicators FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "delete_own" ON macro_indicators FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE macro_indicator_readings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_own" ON macro_indicator_readings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert_own" ON macro_indicator_readings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own" ON macro_indicator_readings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "delete_own" ON macro_indicator_readings FOR DELETE USING (auth.uid() = user_id);
