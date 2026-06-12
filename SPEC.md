# Market Intelligence Platform — Full Specification
> Version 1.1 | Author: Kevin | Last Updated: June 2026
> This document is the single source of truth for the entire build. Every Claude Code session must read this file in full before executing any work. Do not deviate from any decision made here without explicit instruction from Kevin. When in doubt, follow the spec exactly.

---

## 1. Project Overview

### 1.1 What This Is
A private, self-hosted market intelligence platform that:
1. Automatically fetches financial newsletters from Gmail daily
2. Processes them through an AI provider (Claude by default) to extract financially relevant items
3. Stores everything in a structured, searchable Supabase database
4. Presents a clean, mobile-first interface for daily review, filtering, search, and annotation
5. Generates weekly and monthly AI-synthesised digests
6. Detects narrative conflicts and cross-category correlations automatically
7. Builds a long-term structured dataset that will eventually power a market analyser tool

### 1.2 What This Is Not
- Not a public-facing product
- Not connected to dew.codes public pages (though hosted on markets.dew.codes subdomain)
- Not a trading system or signal generator (yet)
- Not a replacement for professional terminals — a personal intelligence layer on top of free sources

### 1.3 Long-Term Vision
This platform is Phase 1 of a larger market analyser tool. The database schema, annotation layer, and structured tagging system are designed to serve as training data and RAG context for a future AI-powered market analysis engine. Every architectural decision must preserve this future use case. Build clean, build extensible.

### 1.4 Owner
Single user: Kevin. Singapore-based equity investor active in both US and SGX-listed markets. Primary interests: macro, rates, energy (including nuclear — CEG is a core position), commodities (gold), SGX-listed equities. Build for a single authenticated user for now but architect the schema with multi-user in mind (user_id on every table).

---

## 2. Hosting & Infrastructure

### 2.1 Domain
- **Public site:** dew.codes (existing Next.js site, do not touch)
- **This app:** markets.dew.codes (separate Vercel deployment, separate repository)
- These are completely independent codebases and deployments. They share a domain only.

### 2.2 Stack
| Layer | Technology | Notes |
|---|---|---|
| Frontend | Next.js 14 (App Router) | Kevin already uses Next.js on dew.codes |
| Database | Supabase (PostgreSQL) | Free tier sufficient for now |
| Auth | NextAuth.js v5 with Google OAuth | Single user, Google SSO only |
| Deployment | Vercel | Automatic deploys from main branch |
| Scheduling | Vercel Cron Jobs | Free tier supports daily cron |
| AI (default) | Anthropic Claude API | claude-sonnet-4-6 default model |
| AI (alt) | Google Gemini API | Swappable via settings |
| AI (alt) | OpenAI API | Swappable via settings |
| Email | Gmail API via Google OAuth | Same Google account as auth |
| Styling | Tailwind CSS | Mobile-first, responsive |
| Language | TypeScript | Strict mode, no any types |

### 2.3 Environment Variables Required
```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# NextAuth
NEXTAUTH_URL=https://markets.dew.codes
NEXTAUTH_SECRET=

# Google OAuth (Auth + Gmail)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=

# AI Providers
ANTHROPIC_API_KEY=
GOOGLE_AI_API_KEY=
OPENAI_API_KEY=

# Cron Security
CRON_SECRET=
```

### 2.4 Repository Structure
```
/
├── app/
│   ├── (auth)/
│   │   └── login/
│   ├── (dashboard)/
│   │   ├── feed/              ← daily feed, default view
│   │   ├── digest/            ← weekly/monthly summaries
│   │   ├── watchlist/
│   │   ├── conflicts/
│   │   ├── correlations/
│   │   ├── search/
│   │   └── settings/
│   └── api/
│       ├── auth/
│       ├── fetch/             ← manual fetch trigger
│       ├── process/           ← extraction pipeline
│       └── cron/              ← scheduled fetch endpoint
├── components/
│   ├── feed/
│   ├── digest/
│   ├── annotations/
│   ├── settings/
│   ├── watchlist/
│   └── ui/                    ← shared primitives
├── lib/
│   ├── ai/
│   │   ├── provider.ts        ← unified AI interface
│   │   ├── claude.ts
│   │   ├── gemini.ts
│   │   └── openai.ts
│   ├── gmail/
│   │   └── client.ts
│   ├── supabase/
│   │   ├── client.ts
│   │   └── server.ts
│   └── prompts/
│       ├── extraction.ts
│       ├── dedup.ts
│       ├── summary.ts
│       ├── conflict.ts
│       └── correlation.ts
├── types/
│   └── database.ts            ← generated from Supabase schema
└── SPEC.md                    ← this file, always at root
```

---

## 3. Authentication

### 3.1 Strategy
- NextAuth.js v5 with Google OAuth provider
- Single authorised account: `dewlearns@gmail.com`. Any login attempt from a different Google account must be rejected immediately and redirected to `/login` with an "Unauthorised account" error. This check must be enforced in the NextAuth `signIn` callback.
- On first login, auto-create the user record in Supabase `users` table
- All API routes and pages behind auth middleware — no public routes except `/login`
- Session strategy: JWT, 30-day expiry, `updateAge: 86400` (session only refreshes once per 24 hours, not on every request — minimises unnecessary re-authentication prompts)
- The Google OAuth scope must include Gmail readonly access: `https://www.googleapis.com/auth/gmail.readonly`

### 3.2 Middleware
Apply auth middleware to all routes under `/(dashboard)` and all `/api/*` routes except `/api/auth/*`.

### 3.3 Login Page Design
- Match the dark navy theme of the dashboard (`#0a0f1e` background)
- Centred layout, vertically and horizontally
- App name "dew-news" in Inter font, large, white
- Single "Sign in with Google" button using the official Google sign-in button style
- If redirected with an error (wrong account): show a small red message below the button — "This account is not authorised. Please sign in with dewlearns@gmail.com."
- No other content, no links, no footer

---

## 4. Database Schema

> All tables use UUID primary keys. All timestamps are `timestamptz`. All tables include `user_id` for future multi-user support. Row Level Security (RLS) must be enabled on all tables with policies that restrict each user to their own data.

### 4.1 `users`
```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  name          TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  last_login    TIMESTAMPTZ
);
```

### 4.2 `sources`
Every newsletter sender that the system monitors.
```sql
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
```

**Seed source (insert on Phase 1 setup):**
```sql
INSERT INTO sources (user_id, name, sender_email, provider, is_active, fetch_priority, notes)
VALUES (
  (SELECT id FROM users WHERE email = 'dewlearns@gmail.com'),
  'Reuters Newsletter',
  '%@thomsonreuters.com',  -- wildcard: matches all @thomsonreuters.com senders
  'gmail',
  TRUE,
  1,
  'Primary news source — Thomson Reuters'
);
```
Note: The Gmail search query must use `from:(@thomsonreuters.com)` to match any sender at that domain, since Reuters may send from multiple subaddresses.

### 4.3 `fetch_runs`
One record per fetch execution (automated or manual).
```sql
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
```

### 4.4 `digests`
One record per email processed within a fetch run.
```sql
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
```

### 4.5 `items`
The core unit of the system. Every extracted financial point.
```sql
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
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX items_date_idx ON items(date);
CREATE INDEX items_user_date_idx ON items(user_id, date);
CREATE INDEX items_significance_idx ON items(significance);
CREATE INDEX items_gics_sector_idx ON items(gics_sector);
```

### 4.6 `entities`
Normalised registry of every named entity across all items.
```sql
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
```

### 4.7 `item_entities`
Junction table linking items to entities.
```sql
CREATE TABLE item_entities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id       UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  entity_id     UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  mention_count INT DEFAULT 1,
  relevance     TEXT NOT NULL CHECK (relevance IN ('primary','secondary','contextual')),
  UNIQUE(item_id, entity_id)
);
```

### 4.8 `watchlist`
User-curated and dynamically scored entity watch list.
```sql
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
```

### 4.9 `annotations`
Per-sentence and per-item user annotations.
```sql
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
```

### 4.10 `conflicts`
Auto-detected narrative contradictions between items.
```sql
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
```

### 4.11 `correlations`
Auto-detected cross-category relationships between items.
```sql
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
```

### 4.12 `summaries`
Auto-generated weekly and monthly digests. Separate from raw items.
```sql
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
```

### 4.13 `conflicts_in_summaries`
Links conflicts detected and referenced within a summary period.
```sql
CREATE TABLE conflicts_in_summaries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_id  UUID NOT NULL REFERENCES summaries(id) ON DELETE CASCADE,
  conflict_id UUID NOT NULL REFERENCES conflicts(id) ON DELETE CASCADE,
  UNIQUE(summary_id, conflict_id)
);
```

### 4.14 `token_usage`
Granular API cost tracking per call.
```sql
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
```

### 4.14 `processing_log`
Human-readable audit trail of all system operations.
```sql
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
```

### 4.15 `settings`
One row per user, upserted on change.
```sql
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
```

---

## 5. Category Taxonomy

### 5.1 Primary Categories (GICS-Aligned)
These map directly to GICS sectors and are used as `gics_sector` on items:
- Energy
- Materials
- Industrials
- Consumer Discretionary
- Consumer Staples
- Healthcare
- Financials
- Information Technology
- Communication Services
- Utilities
- Real Estate

### 5.2 Extended Categories
These are non-GICS but essential for financial news context. Stored in `secondary_categories` array:
- **Macro & Central Banks** — interest rates, inflation, GDP, Fed/ECB/MAS/BOJ decisions, yield curves, FX, monetary policy
- **Markets & Commodities** — equities overview, indices (S&P, STI, Nikkei), volatility (VIX), commodities (oil, gold, silver, copper), crypto
- **Geopolitics & Trade** — sanctions, tariffs, trade wars, elections with market implications, military conflicts affecting supply chains
- **Policy & Regulation** — government fiscal policy, financial regulation, SEC/MAS rulings, antitrust
- **Sustainability & ESG** — climate policy, carbon markets, green finance, ESG ratings, transition risk, renewable energy policy
- **Governance** — corporate governance failures, fraud, activist investors, board changes, executive compensation controversies
- **Miscellaneous** — items with financial signal that don't fit other categories

### 5.3 Multi-Tagging Rule
Every item must have exactly one `gics_sector` (or NULL if not equity-specific) and can have 0–3 entries in `secondary_categories`. An oil sanctions story would be: `gics_sector: "Energy"`, `secondary_categories: ["Geopolitics & Trade", "Macro & Central Banks"]`.

---

## 6. AI Provider Architecture

### 6.1 Provider Abstraction
All AI calls go through a unified interface at `lib/ai/provider.ts`. The active provider is read from the user's settings at runtime. Never hardcode a provider anywhere except in the individual provider files.

```typescript
// lib/ai/provider.ts
export interface AIProvider {
  extract(newsletterBody: string, ragContext?: string): Promise<ExtractionResult>
  dedup(newItems: Item[], existingItems: Item[]): Promise<DeduplicationResult>
  summarise(items: Item[], type: 'weekly' | 'monthly'): Promise<SummaryResult>
  detectConflicts(newItem: Item, recentItems: Item[]): Promise<ConflictResult[]>
  detectCorrelations(newItem: Item, recentItems: Item[]): Promise<CorrelationResult[]>
}
```

### 6.2 Supported Providers
| Provider | Default Model | Notes |
|---|---|---|
| Claude (Anthropic) | claude-sonnet-4-6 | Default, most consistent JSON output |
| Gemini (Google) | gemini-2.0-flash | Alternative, fast and capable |
| OpenAI | gpt-4o | Alternative, well-documented |

### 6.3 Model Selection Logic
User selects provider and model variant in Settings. The settings row is read at the start of each fetch run and passed down the pipeline. All token counts and costs are logged regardless of provider.

**Model list is not hardcoded.** The model variant dropdown in Settings is a free-text input field, not a hardcoded dropdown. This means Kevin can type any model string (e.g. `gemini-2.5-pro`, `claude-opus-4-6`, `gpt-4.5`) and it will be passed directly to the provider's API. The `active_model` field in `settings` stores whatever string Kevin enters. Each provider implementation passes this value directly to its API call without validation — if the model doesn't exist, the API will return an error which is caught, logged, and surfaced in the Settings UI as a red "Last run failed: invalid model" message. This future-proofs the system against new model releases without requiring code changes.

### 6.4 Temperature Setting
Default: 0.2. Lower = more deterministic, consistent JSON. Higher = more interpretive summaries. Exposed in settings with a slider. Apply the same temperature value to all call types unless a specific override is needed (summaries may benefit from slightly higher temperature — implement as `Math.min(temperature + 0.1, 0.8)` for summary calls only).

---

## 7. Extraction Pipeline

### 7.1 Full Flow (per fetch run)
```
1. Cron/Manual trigger → create fetch_run record (status: "running")
2. Gmail API → search for emails from whitelisted senders in last 24h
3. For each email:
   a. Create digest record
   b. Strip HTML, clean body text
   c. If RAG enabled: fetch last N days of items from DB as context
   d. Call AI provider extraction prompt
   e. Parse JSON response
   f. For each extracted item: create item record, extract entities
4. Run deduplication pass across all new items
5. Run conflict detection against last 90 days of items
6. Run correlation detection against last 30 days of items
7. Update watchlist dynamic scores
8. Update fetch_run record (status: "success" | "partial" | "failed")
9. Write all steps to processing_log
```

### 7.2 Extraction Prompt (canonical, at `lib/prompts/extraction.ts`)
```
You are a financial news analyst extracting structured data from a newsletter for a private investment database.

Your task: read the newsletter body and extract every item that has financial or market relevance.

IGNORE: human interest stories, sports, entertainment, weather, and anything with zero financial signal.

For each relevant item, return a JSON object with EXACTLY these fields:
{
  "summary": "One clear sentence describing the financial event and its significance",
  "sentences": [
    {"index": 0, "text": "First sentence of context"},
    {"index": 1, "text": "Second sentence of context"}
  ],
  "full_context": "2-3 sentence paragraph providing full context",
  "significance": 1 | 2 | 3,  // 1=minor market note, 2=notable development, 3=major market-moving event
  "sentiment": "bullish" | "bearish" | "neutral" | "mixed",
  "sentiment_reasoning": "One sentence explaining the sentiment assignment",
  "gics_sector": "exact GICS sector name or null if macro/cross-sector",
  "gics_industry_group": "exact GICS industry group or null",
  "gics_industry": "exact GICS industry or null",
  "gics_sub_industry": "exact GICS sub-industry or null",
  "secondary_categories": ["category1", "category2"],  // max 3, from approved list only
  "entities": [
    {
      "name": "Gold",
      "type": "commodity",
      "ticker": "XAU",
      "relevance": "primary"
    }
  ],
  "date": "YYYY-MM-DD"  // date of the news event, not publication date
}

Approved secondary_categories: ["Macro & Central Banks", "Markets & Commodities", "Geopolitics & Trade", "Policy & Regulation", "Sustainability & ESG", "Governance", "Miscellaneous"]

Significance scoring guide:
- 3: Central bank rate decisions, major geopolitical events affecting global markets, significant earnings beats/misses from major companies, commodity price moves >2%, index moves >1%
- 2: Policy signals, earnings in line with moderate guidance change, commodity moves 0.5-2%, analyst upgrades/downgrades on major names, M&A announcements
- 1: Minor price movements, routine corporate announcements, background context items

Return ONLY a valid JSON array of items. No preamble, no explanation, no markdown. If no financially relevant items exist, return an empty array [].

{{RAG_CONTEXT_BLOCK}}
```

RAG context block (appended when `rag_context_enabled = true`):
```
EXISTING RESEARCH CONTEXT (last {{N}} days):
The following entities and themes have been tracked recently. Weight significance scores accordingly — if something contradicts recent data, note it in sentiment_reasoning.

Watchlist entities: {{watchlist_entities}}
Recent high-significance items: {{recent_items_summary}}
```

### 7.3 Deduplication Prompt
```
You are comparing two lists of financial news items to identify duplicates.

New items (just extracted): {{new_items}}
Existing items from today: {{existing_items}}

For each new item, determine if it is substantively the same event as an existing item.
Two items are duplicates if they describe the same event, even if wording differs.
Two items are NOT duplicates if they cover the same topic but describe different events or timepoints.

Return ONLY a valid JSON array:
[{"new_item_index": 0, "is_duplicate": true, "duplicate_of_id": "uuid-here"}]

If no duplicates, return [].
```

### 7.4 Conflict Detection Prompt
```
You are analysing a new financial news item against recent items to detect narrative conflicts.

New item: {{new_item}}
Recent items (last 90 days, same entities/categories): {{recent_items}}

A conflict exists when the new item directly contradicts a recent item on the same entity or topic.
Examples: "Fed signals rate cuts" vs previous "Fed signals rate hikes". "Oil supply tightening" vs previous "Oil supply glut".

Return ONLY a valid JSON array of conflicts:
[{
  "existing_item_id": "uuid",
  "conflict_summary": "One sentence describing the contradiction",
  "days_apart": 14
}]

If no conflicts, return [].
```

### 7.5 Correlation Detection Prompt
```
You are analysing a new financial news item to identify correlations with recent items from different categories.

New item: {{new_item}}
Recent items (last 30 days, different categories): {{recent_items}}

A correlation exists when two items from different categories are likely to have a causal or consequential relationship.
Examples: "Oil price spike" + "airline cost pressure". "USD strengthening" + "emerging market outflows". "Rate hike" + "real estate softening".

Only flag correlations with confidence >= 0.6.

Return ONLY a valid JSON array:
[{
  "existing_item_id": "uuid",
  "correlation_summary": "One sentence describing the relationship",
  "direction": "positive" | "negative" | "neutral",
  "confidence": 0.0-1.0
}]

If no correlations, return [].
```

### 7.6 Summary Generation Prompt
```
You are generating a {{weekly|monthly}} market intelligence digest for a private investor.

Period: {{start_date}} to {{end_date}}
Total items: {{item_count}}
Items: {{items_json}}

Generate a structured narrative summary covering:
1. Dominant macro themes of the period
2. Notable sector developments (only sectors with 2+ items)
3. Key entity movements (focus on watchlist entities if present)
4. Sentiment shift — did the overall tone change during the period?
5. Items that may have lasting implications

Format as clear prose sections with headers. Do not use bullet points. Write for an investor who has read the raw items and wants synthesis, not repetition.

Then return a JSON footer:
{
  "key_themes": ["theme1", "theme2", "theme3"],
  "dominant_sentiment": "bullish" | "bearish" | "neutral" | "mixed",
  "watchlist_mentions": {"entity_name": mention_count}
}
```

### 7.7 Reading Time Calculation
Reading time is calculated at extraction time and stored on both `items` and `digests`.

- Per item: `Math.ceil(wordCount / 200)` seconds where wordCount is the word count of `full_context`
- Per digest: sum of all item reading times within that digest
- Display format: under 60 seconds = "< 1 min read", otherwise `Math.ceil(seconds / 60)` + " min read"
- Feed total: sum of all items in the current filtered view, shown at top of feed

---

### 8.1 OAuth Scope
The Google OAuth flow must request `https://www.googleapis.com/auth/gmail.readonly`. This scope is requested during the NextAuth sign-in flow and the refresh token is stored in the environment.

### 8.2 Search Query
Use a rolling 24-hour window, not a calendar day. This ensures newsletters sent in non-SGT timezones (Reuters operates on US/UK time) are never missed due to timezone boundary mismatches.

Gmail search query:
```
from:({{whitelisted_sender_emails}}) after:{{unix_timestamp_24h_ago}}
```

- `{{unix_timestamp_24h_ago}}` = `Math.floor((Date.now() - 86400000) / 1000)` — exact 24-hour lookback from time of fetch
- Build the `from:()` part dynamically from active sources. For domain-level matching (e.g. all @thomsonreuters.com), use `from:(@thomsonreuters.com)`. For exact address matching, use the full address.
- Sources table supports both patterns — if `sender_email` starts with `%@`, treat as domain wildcard and strip the `%` when building the Gmail query.

**Date normalisation for items:** The `items.date` field stores the date the news event occurred, not the email send date and not the fetch date. The extraction prompt instructs Claude to infer the event date from article content. If the event date cannot be determined, fall back to the email send date converted to SGT (UTC+8). All date storage and display is in SGT.

### 8.3 Email Body Extraction
1. Fetch the full message via `messages.get` with `format: 'full'`
2. Extract the plain text part (`text/plain`) first, fall back to `text/html`
3. If HTML: strip all tags, decode HTML entities, collapse whitespace
4. Remove unsubscribe footers, legal disclaimers (match common patterns)
5. Store the cleaned body in `digests.raw_body`

### 8.4 Error Handling
- If Gmail API returns 401: log error, mark fetch_run as failed, do not retry automatically
- If a single email fails to process: mark that digest as failed, continue with remaining emails, mark fetch_run as "partial"
- If all emails fail: mark fetch_run as "failed"
- All errors written to `processing_log` with level "error"
- If Gmail search returns zero emails matching the query: still create the fetch_run record with `emails_found: 0`, `status: "success"`. Do not treat as an error. Log one `info` entry: "No new emails found in 24h window." This keeps the audit trail complete and makes it easy to spot days where no newsletters arrived vs days where the pipeline failed.

---

## 9. Frontend — Views & Components

### 9.1 Global Layout
- Top navigation bar: logo/title, nav links (Feed, Digest, Watchlist, Conflicts, Correlations, Search, Settings)
- Mobile: bottom tab bar with icons for the 5 most used views (Feed, Digest, Watchlist, Search, Settings)
- Dark mode only. Color scheme: deep navy background (#0a0f1e), card surfaces (#111827), accent (#3b82f6 blue), bullish green (#10b981), bearish red (#ef4444), neutral gray (#6b7280)
- Font: Inter for UI, JetBrains Mono for data/numbers
- Fully responsive, mobile-first. Primary use case is phone browser.

### 9.2 Feed View (`/feed`)
**Default view on login.**

Controls bar (sticky top):
- Date picker (default: today) with quick buttons: Today / This Week / This Month / This Year
- Category filter (multi-select dropdown, all selected by default)
- Sentiment filter (All / Bullish / Bearish / Neutral / Mixed)
- Significance filter (All / High only / Medium+ / All)
- Sort: Significance (default) / Time / Sentiment
- Card density toggle (Compact / Expanded)

Feed:
- Watchlist-pinned items shown first in a distinct "Watching" section with blue left border
- Remaining items sorted by significance score descending, then by time
- Each card shows:
  - Significance badge (coloured dot: red=3, amber=2, gray=1)
  - Sentiment badge (green=bullish, red=bearish, gray=neutral, purple=mixed) — toggleable via settings
  - GICS sector tag + up to 2 secondary category tags
  - Summary sentence (bold)
  - Entity pills (ticker/name of extracted entities)
  - Source name + time
  - Estimated reading time for expanded context
  - Annotation indicators (star icon if starred, highlight count if any)
  - Conflict indicator (orange warning icon if this item has a linked conflict)
  - Correlation indicator (blue link icon if this item has a linked correlation)

Card expanded state (tap to expand):
- Full sentences array rendered, each sentence individually tappable/selectable for annotation
- On sentence tap: annotation action bar appears (highlight yellow / highlight green / highlight red / add note)
- Star button for whole item
- "View conflict" / "View correlation" links if applicable
- Source label + link to original digest

Reading time indicator at top of feed: "~4 min read for today"

### 9.3 Digest View (`/digest`)
Two tabs: **Weekly** and **Monthly**

- List of generated summaries, most recent first
- Each summary card shows: period label, dominant sentiment badge, item count, key themes as pills, is_pinned indicator
- Tap to expand full summary text
- Pin/unpin button
- "Generated by AI" label clearly visible — user must always know this is synthesised content, not raw data
- Empty state: "No weekly digest yet. Digests are generated automatically every Monday."

### 9.4 Watchlist View (`/watchlist`)
Two sections:

**Static Watchlist** (user-managed):
- List of pinned entities with: name, ticker, type, user notes, alert threshold setting
- Add entity: search existing entities or type new name
- Drag to reorder priority
- Remove button

**Trending This Week** (dynamic, auto-updated daily):
- Top 10 entities by mention frequency in the rolling window
- Shows: entity name, mention count, trend arrow (up/down vs last week), dominant sentiment this week
- User can promote any trending entity to static watchlist with one tap

### 9.5 Conflicts View (`/conflicts`)
- List of all detected conflicts, unacknowledged first
- Each conflict card: entity name, conflict summary, Item A summary + date, Item B summary + date, days apart
- Mark as acknowledged, mark as resolved (with optional resolution note)
- Filter: All / Unacknowledged / Resolved

### 9.6 Correlations View (`/correlations`)
- List of all detected correlations, most recent first
- Each card: correlation summary, direction badge, confidence percentage, Item A + Item B summaries and categories
- Dismiss button (removes from active list, keeps in DB)
- Filter: All / High confidence (>0.8) / Dismissed

### 9.7 Search View (`/search`)
- Full-text search across: item summaries, sentences, entity names, custom tags
- Results grouped by date
- Filter by category, sentiment, date range, significance
- Each result shows the matched item card (same as feed card)
- Always use Supabase full-text search — no client-side fallback, no switching logic. Consistent from day one regardless of dataset size.

Implementation: 
- Add a generated `tsvector` column to `items` combining `summary`, `full_context`, and entity names
- Create a GIN index on this column for fast search
```sql
ALTER TABLE items ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(summary, '') || ' ' || coalesce(full_context, ''))
  ) STORED;
CREATE INDEX items_search_idx ON items USING GIN(search_vector);
```
- Search query: `SELECT * FROM items WHERE search_vector @@ plainto_tsquery('english', $1)`
- Entity name search handled separately: join `item_entities` → `entities` and filter on `entities.name ILIKE '%query%'` then UNION with the tsvector results, deduplicated by item id.

### 9.8 Settings View (`/settings`)
Organised into collapsible sections:

**AI Provider**
- Provider selector: Claude / Gemini / GPT-4o (radio buttons)
- Model variant dropdown (populated based on selected provider)
- Temperature slider (0.0–1.0, step 0.05, default 0.2)
- Max tokens input

**Data Sources**
- List of whitelisted senders with active/inactive toggle and delete
- Add new source form: name + email address
- Fetch schedule: cron expression input with human-readable preview ("Every day at 6:00 AM SGT")
- Fetch on/off master toggle
- Lookback days (first run only)
- Deduplication sensitivity selector

**Extraction**
- Minimum significance threshold (1/2/3)
- Category toggles (each category can be turned off)
- Entity extraction toggle
- RAG context toggle + lookback days slider

**Display**
- Default view (Day/Week/Month)
- Card density (Compact/Expanded)
- Sentiment badges toggle
- Reading time toggle
- Watchlist pinning toggle

**Digests**
- Weekly digest toggle + day of week selector
- Monthly digest toggle + day of month selector

**System**
- Manual fetch trigger button ("Fetch Now") with last run status
- Processing log viewer: scrollable list of last 100 log entries, filterable by level
- Token usage summary: total tokens used this month, estimated cost, breakdown by provider and call type
- Database stats: total items, date range of archive, total annotations, total entities
- Export annotations: download starred/highlighted items as JSON or CSV

---

## 10. Annotation System

### 10.1 Highlight Colours and Meaning
- **Yellow** — general interest, worth remembering
- **Green** — bullish signal, positive implication for a position or thesis
- **Red** — bearish signal, risk or threat to monitor

### 10.2 Per-Sentence Interaction
Each sentence in `items.sentences` is rendered as a discrete element. On mobile: long-press to activate annotation mode. On desktop: click to activate. The annotation action bar appears inline below the sentence with four options: yellow highlight, green highlight, red highlight, add note. Tapping a colour toggles the highlight — tapping the same colour again removes it. Only one highlight colour per sentence at a time.

**iOS Safari note:** long-press triggers the native text selection menu on iOS. To avoid this conflict, use a `touchstart`/`touchend` timer approach (activate annotation mode if touch held > 500ms without movement > 10px) and call `preventDefault()` on the touch event. Test on Safari iOS explicitly during Phase 3.

### 10.3 Stars
A star annotation on the whole item (sentence_index = NULL) marks it for the annotations export. Starred items appear with a filled star icon on their card in the feed.

### 10.4 Notes
Free text, per sentence or per item. Notes appear as a small speech bubble icon. Hovering/tapping the icon shows the note text inline.

### 10.5 Export
Export from Settings. Produces a file containing all non-deleted annotations with: item date, item summary, sentence text (if sentence-level), annotation type, highlight colour, note text, entity tags, GICS category. This is training data — the format must be clean, structured, and machine-readable.

JSON format:
```json
[{
  "date": "2026-06-12",
  "item_summary": "...",
  "sentence": "Gold rose 1.2% on safe-haven demand",
  "sentence_index": 2,
  "annotation_type": "highlight",
  "highlight_colour": "green",
  "note": null,
  "entities": ["Gold", "XAU"],
  "gics_sector": null,
  "secondary_categories": ["Markets & Commodities", "Geopolitics & Trade"],
  "item_significance": 2,
  "item_sentiment": "bullish"
}]
```

---

## 11. Watchlist Behaviour

### 11.1 Static Watchlist
Manually managed by Kevin. Entities added here are permanently pinned in the feed as long as `is_active = true` and `alert_threshold` is met by the item's significance score. Kevin's initial static watchlist (seed data): CEG (equity), Gold/XAU (commodity), MAS (institution), Federal Reserve/Fed (institution), SGX Composite Index/STI (index).

### 11.2 Dynamic Watchlist
Recalculated nightly as part of the cron job. For each entity, count mentions in items from the last `dynamic_window_days` days (default 7). Top entities by mention count get a `dynamic_score`. Display top 10 in the Trending section of the Watchlist view.

### 11.3 Feed Pinning Behaviour
At the top of the Feed, before regular items, show a "Watching" section. Include in this section any item where:
- At least one of its entities is on the static watchlist AND
- The item's significance >= the watchlist entry's `alert_threshold`

If `watchlist_pin_enabled = false` in settings, skip this section.

---

## 12. Conflict & Correlation Detection

### 12.1 When to Run
Both detection passes run after every successful extraction batch, as part of the fetch run pipeline. They are not run in real-time per item — batch after all items in the run are saved.

### 12.2 Conflict Detection Scope
For each new item, query existing items from the last 90 days that share at least one entity OR share the same GICS sector. Pass these as context to the conflict detection prompt. Limit to 20 existing items per new item to control token usage.

### 12.3 Correlation Detection Scope
For each new item, query existing items from the last 30 days from DIFFERENT categories (to find cross-category links). Limit to 20 items per new item.

### 12.4 Display Rules
- Unacknowledged conflicts: orange badge on nav Conflicts link
- Unacknowledged correlations: blue badge on nav Correlations link
- Items with conflicts: orange warning icon on their feed card
- Items with correlations: blue link icon on their feed card

---

## 13. Auto-Digest Generation

### 13.1 Weekly Digest
Triggered by cron on the day set in settings (default Monday). Collects all items from the previous 7 days. Passes to summary generation prompt. Saves to `summaries` table with `type = 'weekly'`.

### 13.2 Monthly Digest
Triggered by cron on the day set in settings (default 1st of month). Collects all items from the previous calendar month. Saves with `type = 'monthly'`.

### 13.3 Regeneration
User can manually regenerate any digest from the Digest view. Creates a new record (does not overwrite) with the same period. Both versions are stored and shown, with the latest marked as current.

---

## 14. Cron Job

### 14.1 Vercel Cron Configuration (`vercel.json`)
```json
{
  "crons": [
    {
      "path": "/api/cron/fetch",
      "schedule": "0 22 * * *"
    }
  ]
}
```
Note: Vercel cron runs in UTC. 22:00 UTC = 06:00 SGT. This is the default. The user's fetch_schedule setting in the DB stores their preferred time in cron format (SGT), and the actual Vercel cron runs at a fixed UTC time — the API endpoint checks whether the user's preferred time window has been met before proceeding.

### 14.2 Cron Endpoint Security
The `/api/cron/fetch` endpoint must verify the `CRON_SECRET` environment variable matches the `Authorization: Bearer` header. Vercel injects this automatically for its own cron calls.

---

## 15. Development Phases

> Each phase must be completed and verified before the next begins. Claude Code should read this spec at the start of every session. At the end of each phase, update a `PROGRESS.md` file at the project root noting what was completed, any deviations from spec, and what Phase N+1 requires.

### Phase 1 — Foundation (Est. 2–3 hours)
**Goal:** Working infrastructure, nothing more. No features.

Tasks:
1. Initialise Next.js 14 project with TypeScript, Tailwind, App Router
2. Set up Supabase project, run all 15 CREATE TABLE statements from Section 4
3. Enable RLS on all tables, write policies: users can only SELECT/INSERT/UPDATE/DELETE their own rows
4. Set up NextAuth v5 with Google OAuth provider
5. Create user record on first login (upsert into `users` table)
6. Deploy to Vercel, configure all environment variables
7. Confirm: login works, session persists, Supabase connection verified
8. Create `PROGRESS.md` at root

Acceptance criteria: Kevin can log in at markets.dew.codes, session persists, Supabase dashboard shows the 15 tables with RLS enabled.

### Phase 2a — Feed UI (Est. 3–4 hours)
**Goal:** Full feed interface with seed data.

Tasks:
1. Create seed data script: 20 realistic items across multiple categories, dates, and entities. Include items that would trigger watchlist pins (CEG, Gold mentions). Include items that would be conflicts and correlations.
2. Build feed page with all controls (date picker, filters, sort, density toggle)
3. Build item card component (compact and expanded states)
4. Build sentence-level render with individual sentence elements
5. Watchlist "Watching" section at feed top
6. Conflict and correlation indicator icons on cards
7. Reading time estimate at feed top

Acceptance criteria: Feed loads with seed data, all filters work, cards expand correctly, watchlist section shows pinned items.

### Phase 2b — Supporting Views UI (Est. 3–4 hours)
**Goal:** All remaining views with seed data.

Tasks:
1. Digest view (two tabs, summary cards, pin toggle)
2. Watchlist view (static list, trending section)
3. Conflicts view (list, acknowledge, resolve)
4. Correlations view (list, dismiss)
5. Search view (input, results, filters)
6. Settings view (all sections from Section 9.8)
7. Global nav (desktop top bar, mobile bottom tabs)
8. Dark mode colour scheme applied consistently

Acceptance criteria: All views render correctly on mobile and desktop with seed data.

### Phase 3 — Annotation Layer (Est. 3–4 hours)
**Goal:** Fully working annotation system persisting to Supabase.

Tasks:
1. Per-sentence tap/click interaction (long-press mobile, click desktop)
2. Annotation action bar component
3. Highlight colours applied visually to sentence elements
4. Star annotation on whole item
5. Note annotation (text input inline)
6. All annotations write to `annotations` table in Supabase
7. Annotations load on feed render (hydrate from DB)
8. Star/highlight count indicators on collapsed cards
9. Export function in settings (JSON and CSV)

Acceptance criteria: Kevin can highlight a sentence, reload the page, and the highlight persists. Export produces correct JSON.

### Phase 4 — Ingestion Pipeline (Est. 4–6 hours)
**Goal:** Real data flowing from Gmail through Claude into the database.

Tasks:
1. Gmail OAuth client at `lib/gmail/client.ts`
2. Email search and body extraction logic
3. HTML stripping and cleaning
4. AI provider abstraction layer (`lib/ai/provider.ts`)
5. Claude implementation (`lib/claude.ts`)
6. Extraction prompt integration (from Section 7.2)
7. JSON response parsing with error handling
8. Entity normalisation and upsert logic
9. Item and entity saving to Supabase
10. Deduplication pass (prompt from Section 7.3)
11. Token usage logging to `token_usage` table
12. Processing log writes at every step
13. Manual fetch trigger in Settings ("Fetch Now" button)
14. Fetch run status display in Settings

Acceptance criteria: Kevin clicks "Fetch Now", a Reuters email is processed, items appear in the feed with correct categories, token usage is logged.

### Phase 5 — Automation & Intelligence (Est. 5–7 hours)
**Goal:** Fully automated pipeline with conflict/correlation detection and RAG.

Tasks:
1. Vercel cron job setup (`vercel.json` from Section 14.1)
2. Cron endpoint with secret verification
3. RAG context building (fetch recent items and watchlist for prompt injection)
4. Conflict detection pass (prompt from Section 7.4)
5. Correlation detection pass (prompt from Section 7.5)
6. Conflict and correlation records saved to DB
7. Watchlist dynamic score recalculation (nightly)
8. Unacknowledged conflict/correlation badges on nav
9. Gemini and OpenAI provider implementations
10. Provider switching live in settings (no restart required)

Acceptance criteria: Cron runs at 6am SGT, processes newsletters, conflict and correlation records appear in DB, provider can be switched in settings and next fetch uses the new provider.

### Phase 6 — Digests & Polish (Est. 3–4 hours)
**Goal:** Auto-digests working, mobile polish, production-ready.

Tasks:
1. Weekly digest generation (prompt from Section 7.6)
2. Monthly digest generation
3. Digest cron triggers
4. Manual digest regeneration in Digest view
5. Digest view fully populated with real generated content
6. Mobile layout pass — test all views at 375px width
7. Performance: add loading skeletons, optimistic UI for annotations
8. Error states: empty feed, failed fetch, API errors shown in UI
9. Database stats in settings populated from real queries
10. Token usage chart in settings (monthly spend by provider)
11. Final `PROGRESS.md` update noting complete

Acceptance criteria: Weekly digest generates correctly on Monday, all views work at 375px, no console errors in production.

---

## 16. Seed Data Specification

The seed data script must create realistic data covering:
- At least 20 items across 8+ different categories
- Items dated across the last 14 days
- At least 3 items mentioning watchlist entities (CEG, Gold, Fed)
- At least 1 conflict pair (e.g. Item A: "Fed signals rate cuts" dated 7 days ago, Item B: "Fed signals rates on hold" dated 2 days ago)
- At least 1 correlation pair (e.g. "Oil price spike" + "Airline sector under pressure")
- At least 2 items with significance=3
- Items from at least 2 different sources
- One weekly summary covering the past week

---

## 17. Non-Functional Requirements

### 17.1 Performance
- Feed initial load < 2 seconds on mobile
- Search results < 500ms for datasets up to 10,000 items
- Annotation save < 200ms (optimistic UI, background sync)

### 17.2 Reliability
- Failed fetch runs must never lose data — partial success is acceptable, silent failure is not
- All AI API calls wrapped in try/catch with exponential backoff (max 3 retries)
- If all retries fail: mark digest as failed, log error, continue pipeline

### 17.3 Security
- All API routes authenticated — no unauthenticated reads
- Gmail access read-only
- No user data logged to console in production
- Supabase service role key only used server-side, never exposed to client
- CRON_SECRET required for cron endpoint

### 17.4 Code Quality
- TypeScript strict mode throughout
- No `any` types
- All Supabase queries typed using generated types from `types/database.ts`
- Consistent error handling pattern: all errors returned as `{error: string}` JSON from API routes
- Comments on all prompt functions explaining what they extract and why

---

## 18. Future Considerations (Do Not Build Now)

These are noted so the schema and architecture account for them without implementing them:

- **Public insights on dew.codes** — curated market outlook section pulling anonymised/editorialised items from this database. The `is_pinned` and annotation system will feed this.
- **Market analyser engine** — AI model fine-tuned or RAG-powered on the annotations export from this system
- **Multi-source expansion** — Bloomberg, FT, Straits Times, SGX announcements
- **Portfolio integration** — link entities to actual positions, show P&L context alongside news
- **Alert system** — push notification when a watchlist entity hits significance=3
- **Multi-user** — the user_id architecture supports this from day one

---

## 19. Claude Code Session Instructions

Every Claude Code session must begin by running:
```
cat SPEC.md
cat PROGRESS.md
```

Do not begin any work until both files have been read in full. If `PROGRESS.md` does not exist, you are starting Phase 1 — create it as your first action after reading SPEC.md.

### PROGRESS.md Format
```markdown
# Build Progress

## Completed Phases
- Phase X — [date] — [brief notes, any deviations from spec]

## Current Phase
Phase N — [name]

## Last Session Summary
[What was done, what was left incomplete]

## Known Issues
[Any bugs, workarounds, or technical debt introduced]

## Next Session Must
[Specific first actions for the next Claude Code session]
```

### Rules for Claude Code
1. Never skip a phase or merge phases without explicit instruction from Kevin
2. Never change the database schema from what is defined in Section 4 without flagging it first
3. Never expose `SUPABASE_SERVICE_ROLE_KEY` or any secret to the client side
4. Always update `PROGRESS.md` at the end of every session
5. If a phase's acceptance criteria cannot be met, stop and document why in `PROGRESS.md` rather than proceeding
6. The canonical prompts in Section 7 are final — do not rewrite or "improve" them without instruction
7. If an npm package is unavailable or incompatible, choose the closest alternative and document the deviation in `PROGRESS.md`
8. TypeScript strict mode throughout — no suppressing errors with `@ts-ignore` or `any`

---

## 20. Repository, Deployment & Data Retention

- **Repository name:** `dew-news`
- **Vercel project name:** `dew-news`
- **Custom domain:** `markets.dew.codes` — configure in Vercel project settings after first deploy
- **Branch strategy:** single `main` branch, Vercel deploys automatically on push
- **Data retention:** no automatic deletion. The archive grows indefinitely. This is intentional — the dataset is future training data for the market analyser. Never add any scheduled deletion, TTL, or archival logic unless explicitly instructed by Kevin.

---

*End of specification. This document covers every decision made in the design sessions. Build exactly this.*
