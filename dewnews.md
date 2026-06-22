Here’s a **refined, Claude-ready prompt** that includes everything *plus* the critical next step: defining a strong explanation engine and forcing proper architecture decisions.

You can paste this directly into Claude.

---

# SYSTEM DESIGN TASK: Market Explanation Engine (Finance + News)

You are an expert systems architect and quantitative engineer.

Your task is to **refine, stress-test, and improve** the following system design.
Do NOT summarise—**critique, restructure, and upgrade it** into a production-quality architecture.

---

# 🎯 Objective

Build a system that explains:

> “Why did the market move?”

Using:

* Market price data
* Financial news
* Macro-economic indicators

Constraints:

* Fully **free data sources only**
* Acceptable delay: **3–4 hours (NOT real-time)**
* Focus on **interpretation, not raw data collection**

---

# 🧠 Core Principle

This is NOT a scraper.

This is a:

> **Market Explanation Engine (cause inference system)**

Pipeline:

```plaintext
Data → Processing → Analysis → Explanation
```

---

# 📦 Data Sources

### Market Data

* yfinance (stocks, indices)

### News

* RSS feeds (Reuters, CNBC, etc.) via feedparser

### Macro

* FRED API (rates, CPI, etc.)

Optional:

* GDELT (requires heavy filtering)

---

# 🏗️ Proposed Architecture

## Collectors

* market_collector
* news_collector
* macro_collector

## Processing

* cleaning
* deduplication
* timestamp normalization (UTC)

## Storage

* SQLite (initial)
* store raw + processed data

## Analysis Engine

* event detection
* news matching
* scoring

## Output

* API (FastAPI) or CLI

---

# ⚙️ Core Logic

## 1. Event Detection

Trigger when:

* Market moves beyond threshold (e.g. ±1% in 3–4h window)

---

## 2. Time Alignment

For event at time T:

* Only consider news in [T-4h, T]

---

## 3. Relevance Filtering

Keyword-based filtering:

* “Fed”, “rates”, “inflation”, “earnings”, etc.

---

## 4. Scoring System (TO BE DESIGNED PROPERLY)

Articles must be scored based on:

* keyword relevance
* recency
* source credibility

---

## 5. Output

Generate explanation:

* ranked causes
* grouped themes
* multiple supporting articles

---

# 🚨 CRITICAL: YOU MUST DESIGN THIS PROPERLY

## A. Define what makes a “good explanation”

Explicitly answer:

* What distinguishes a strong vs weak explanation?
* How do you avoid false causality?
* How do you ensure relevance and diversity?

---

## B. Design a robust scoring algorithm

Go beyond simple keyword matching. Include:

* weighted scoring formula
* handling of duplicate narratives
* clustering/grouping of similar articles into “themes”

Example goal:

```plaintext
Theme: "Fed rate concerns"
- Article 1
- Article 2
- Article 3
```

---

## C. Design the “cause inference layer”

This is the core innovation.

Define:

* How events map to candidate causes
* How multiple causes are ranked
* How confidence is expressed (NOT deterministic)

---

## D. Prevent common failure modes

Your design must explicitly address:

* false correlations
* noisy/irrelevant news
* duplicate content
* missing or delayed data
* market moves with no clear news

---

# 🧩 Implementation Phases

## Phase 1 — Data Collection

## Phase 2 — Time Alignment

## Phase 3 — Event Detection

## Phase 4 — News Linking

## Phase 5 — Explanation Engine

---

# ⚠️ Non-Negotiable Constraints

* All timestamps in UTC
* Strict time-window causality (no future leakage)
* Idempotent data storage (no duplicates on reruns)
* Modular architecture (clear separation of concerns)
* Graceful failure handling

---

# 🧪 Required Output from You

You MUST produce:

## 1. Improved Architecture

* Refined system design
* Better modular breakdown
* Suggested technologies if needed

---

## 2. Explanation Engine Design (DETAILED)

* scoring formula (explicit)
* theme clustering approach
* ranking logic
* confidence estimation

---

## 3. Data Flow Diagram

* end-to-end pipeline

---

## 4. Key Functions (with signatures)

Examples:

```python
detect_market_event()
get_candidate_news()
score_article()
cluster_themes()
generate_explanation()
```

---

## 5. Failure Mode Analysis

* list of failure cases
* mitigation strategies

---

## 6. Suggested MVP Scope

* smallest system that still produces meaningful explanations

---

# 🚀 Goal

Turn this into:

> A robust, extensible system that produces **credible, explainable reasons for market movements**

NOT:

* a scraper
* a dashboard
* a data dump

---

Be critical. Improve aggressively. Fill in missing logic. Challenge assumptions.

---

If you want after this, I can:

* convert Claude’s output into a **Copilot-ready repo (files + code stubs)**
* or help you implement just the **explanation engine (hardest + most important part)**
