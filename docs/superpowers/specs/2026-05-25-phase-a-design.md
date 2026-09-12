# Phase A Design — OpenAlex Sync Pipeline + Phase A Mongoose Models

**Status:** Approved (brainstorming complete)
**Date:** 2026-05-25
**Owner:** hoangtira
**Project:** Publication Trend System (WDP301 capstone)
**Estimated effort:** ~6-10 hours of focused implementation

---

## Goal

Build the first data pipeline that takes the system from an empty database to a working corpus of ~100 academic papers, sourced from OpenAlex, deduplicated, quality-checked, and queryable through the existing `GET /api/v1/papers` endpoint. This is the foundation every later phase (semantic search, RAG, AI reports) builds on.

Phase A also lays down the **shape of the data layer** for the rest of the project — the 12 Mongoose models created here are the structural backbone, even though only a few of their fields are read during Phase A itself.

---

## Non-Goals (Explicitly Deferred)

- **Embedding generation** — schema reserves the `embedding: [Number]` field but Phase A does not populate it. The Atlas Vector Search index sits idle waiting for Phase B.
- **Semantic Scholar, Crossref, arXiv clients** — only OpenAlex in Phase A. The provider abstraction makes adding them later a half-day each.
- **LLM, RAG, MCP code** — all Phase B-D.
- **Frontend pages and mobile screens** — Phase C+.
- **Admin auth wiring** — sync endpoint will exist with `requireAuth + requireRole('admin')` middleware in code, but the seed script that promotes a user to admin is itself a follow-up. For demo, the middleware can be temporarily relaxed with a feature flag.

---

## Decisions (Settled During Brainstorm)

| Question | Decision | Rationale |
|---|---|---|
| Scope of models | Subset of 12 (not all 40) | Ship a working slice; evolve schema with real edge cases |
| Demo topic | `large language model education`, year ≥ 2022 | Matches the brief and yields rich research-gap material |
| Worker process | Standalone (`pnpm worker:sync`) | Industry pattern; defendable to graders |
| Dedup strategy | Multi-source tracking + upsert merge | Matches the existing `paper_source_records` schema |
| Sync trigger | Manual admin endpoint + cron `0 2 * * *` | Manual for demo, cron for production-readiness |
| Quality check timing | Computed inline on insert | Check is field-presence only — fast, no need for a separate worker |

---

## Architecture

### Module Layout

```
apps/backend/src/modules/
├── auth/                          (existing — no changes)
├── papers/                        (existing — extend)
│   ├── dto/
│   ├── models/
│   │   ├── paper.model.ts         (existing — collection "research_papers")
│   │   ├── journal.model.ts                                          NEW
│   │   ├── author.model.ts                                           NEW
│   │   ├── keyword.model.ts                                          NEW
│   │   ├── research-topic.model.ts                                   NEW
│   │   ├── paper-source-record.model.ts                              NEW
│   │   └── paper-quality-check.model.ts                              NEW
│   ├── paper.controller.ts        (existing — extend with list/detail)
│   ├── paper.service.ts                                              NEW
│   └── paper.routes.ts            (existing)
│
├── api-sync/                                                         NEW
│   ├── models/
│   │   ├── api-provider.model.ts
│   │   ├── api-sync-config.model.ts
│   │   └── api-sync-run.model.ts
│   ├── dto/
│   │   └── trigger-sync.schema.ts
│   ├── providers/
│   │   ├── openalex.client.ts     OpenAlex HTTP wrapper, rate-limited
│   │   └── openalex.normalizer.ts JSON → Paper schema mapper
│   ├── sync.service.ts            Dedup + upsert merge + quality check
│   ├── sync.controller.ts         Admin endpoint
│   └── sync.routes.ts             POST /admin/sync, GET /admin/sync/runs
│
├── audit/                                                            NEW
│   ├── models/audit-log.model.ts
│   └── audit.service.ts
│
└── llm/, embeddings/              (existing — untouched)

apps/backend/src/workers/
└── sync.worker.ts                                                    NEW
    BullMQ Worker entry point. Wires the queue to sync.service. Also
    registers the cron schedule. Runs as a separate Node process.

apps/backend/src/infrastructure/queue.ts
    (existing — already exports apiSyncQueue; sync.worker imports it)
```

**Why `api-sync` is its own module:** it has its own client, normalizer, dedup service, scheduler, and three Mongoose models. Putting all of that under `papers/` would bloat the papers module and conflate "what the API returns" with "where the data comes from."

**Why `audit` is separate:** it is cross-cutting. Auth, sync, and (later) AI reports all need to log to it. Putting it under any one feature module would couple them.

**Why `workers/` is outside `modules/`:** it represents a *process boundary*, not a feature. `sync.worker.ts` is an entry point that imports from `modules/api-sync/sync.service.ts`. The service holds the logic; the worker just hosts the BullMQ Worker.

### Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│  TRIGGER                                                    │
│  A. Admin: POST /api/v1/admin/sync                          │
│  B. Cron:  "0 2 * * *" — reads enabled api_sync_configs     │
└──────────────────────┬──────────────────────────────────────┘
                       ▼
            ┌──────────────────────┐
            │  BullMQ "api-sync"   │
            │  Job payload:        │
            │  { syncConfigId? |   │
            │    inlineConfig:     │
            │      { searchText,   │
            │        yearFrom,     │
            │        maxPages } }  │
            └──────────┬───────────┘
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  WORKER PROCESS (pnpm worker:sync)                          │
│                                                             │
│  1. Insert api_sync_runs (status="running", started_at)     │
│                                                             │
│  2. PAGE LOOP (cursor pagination, page = 1..maxPages):      │
│       a. openalexClient.fetchPage({ search, year, cursor })│
│          - Rate limit: 100ms between calls (10 req/s)       │
│          - User-Agent: "TrendSystem/0.1 (mailto:...)"       │
│          - Retry 3× with exponential backoff on 5xx         │
│       b. For each work in page (up to 200):                 │
│          - normalize() → Paper-shape object                 │
│          - findOne({ "externalIds.doi": doi })              │
│            → fallback findOne({ "externalIds.openalexId" })│
│          - mergeUpsert(existing, incoming)                  │
│          - insertOne(paper_source_records, { hash, raw })  │
│          - computeQualityCheck() + upsert                   │
│          - audit.log("paper.upserted", ...)                 │
│          - run counters: fetched++, inserted++ | updated++  │
│          - try/catch per paper — failures don't abort batch │
│       c. cursor = nextCursor; break if no more              │
│                                                             │
│  3. Update api_sync_runs (status, finished_at, all counts) │
│  4. audit.log("sync.completed", runId)                      │
└─────────────────────────────────────────────────────────────┘
                       │
                       ▼
              MongoDB Atlas — publication_trend
              (Vector index waits for Phase B embedding)
```

**Key decisions in the flow:**

- **Cursor pagination** rather than `?page=N` — OpenAlex's recommended approach for deep paging, avoids issues past 10K results.
- **200 papers per page** — the OpenAlex maximum, minimises round-trips.
- **Rate-limit 10 req/s** — OpenAlex's polite-pool limit when you supply a `mailto` in the User-Agent.
- **Per-paper try/catch** — a single malformed record cannot bring down a sync of 200.
- **Atomic upsert** via `findOneAndUpdate` with `$set` and `$max` — single round-trip per paper, citation_count uses `$max` so it never regresses.
- **`api_sync_runs` is written at the start** so partial failures are still visible.

---

## Data Model (12 Collections, Phase A Subset)

### Relationship Topology

```
users (existing) ──────────────────────► api_sync_configs.createdBy
                                                │
                                                ▼
api_providers ◄────── api_sync_configs ───► api_sync_runs
                                                │
                                                ▼
                       paper_source_records ───► research_papers ◄──── journals
                                                  │
                                                  │  embedded arrays:
                                                  │    authors[]
                                                  │    keywords[]
                                                  │    topics[]
                                                  │
                                                  └─► paper_quality_checks (1:1)

authors, keywords, research_topics  (master taxonomies, referenced from research_papers)

audit_logs  (cross-cutting — every important action writes one row)
```

### Embed vs Reference Decisions

| Relationship (SQL form) | MongoDB form | Reason |
|---|---|---|
| `paper_authors` (junction) | **Embed** `authors[]` in `research_papers` | Bounded list (5–10), always read together with the paper |
| `paper_keywords` (junction) | **Embed** `keywords[]` | Same |
| `paper_topics` (junction) | **Embed** `topics[]` | Same |
| `paper_references` (junction) | **Reference** (separate collection, deferred to Phase B) | Can be in the hundreds — would bloat the parent document |
| `paper_source_records` | **Reference** | One paper, many sources; we query them independently |
| `paper_quality_checks` | **Reference (1:1)** | Recomputed independently; keeping it out keeps the paper document lean |

### Collection Schemas

> Field names use camelCase to match Mongoose convention. The Atlas Vector Search index already created against `research_papers` looks for `embedding`, `publicationYear`, `topics`, and `dataStatus` paths, so those field names are fixed.

#### `journals`
```ts
{
  externalIds: { openalexId, issn, eissn, crossrefId },
  name: String,                       // text-indexed
  publisher: String,
  country: String,
  type: enum["journal", "conference", "repository", "book-series", "other"],
  isOpenAccess: Boolean,
  homepageUrl: String,
  worksCount: Number,
  citedByCount: Number,
}
// Indexes: externalIds.openalexId (unique sparse), name (text)
```

#### `authors`
```ts
{
  externalIds: { openalexId, orcid, scholarId },
  displayName: String,
  affiliations: [{ name, country, ror }],
  hIndex: Number,
  citedByCount: Number,
  worksCount: Number,
}
// Indexes: externalIds.openalexId (unique sparse), displayName (text)
```

#### `keywords`
```ts
{
  keywordName: String,
  normalizedName: String,             // lowercase, trimmed — used for dedup
}
// Indexes: normalizedName (unique)
```

#### `research_topics`
```ts
{
  parentTopicId: ObjectId,            // null for top-level
  topicName: String,
  description: String,
  researchField: String,              // broader umbrella (e.g. "Computer Science")
}
// Indexes: { parentTopicId, topicName }
```

#### `research_papers` (already exists — schema extends)
```ts
{
  externalIds: {
    doi: String,                      // unique sparse
    openalexId: String,
    semanticScholarId: String,
    arxivId: String,
    pubmedId: String,
  },
  title: String,                      // text-indexed
  abstractText: String,               // text-indexed
  authors: [{                         // EMBED
    authorId: ObjectId,
    displayName: String,
    position: Number,
    isCorresponding: Boolean,
  }],
  journalId: ObjectId,
  journalName: String,                // denormalised for display speed
  publicationYear: Number,
  publicationDate: Date,
  paperKind: enum["article", "proceedings", "preprint", "review", "book-chapter", "other"],
  language: String,
  openAccessStatus: enum["gold", "green", "hybrid", "bronze", "closed", "unknown"],
  openAccessUrl: String,
  licenseName: String,
  citationCount: Number,
  keywords: [{                        // EMBED
    keywordId: ObjectId,
    keywordName: String,
    detectedBy: enum["openalex", "ai", "user"],
    confidence: Number,               // 0..1
  }],
  topics: [{                          // EMBED — searchable as filter
    topicId: ObjectId,
    topicName: String,
    detectedBy: enum["openalex", "ai", "user"],
    confidence: Number,
  }],
  primaryProvider: enum["openalex", "semanticscholar", "crossref", "arxiv"],
  dataStatus: enum["draft", "active", "low-quality", "archived"],
  dataQualityScore: Number,           // 0..1, denormalised from latest quality check
  isAiAnalyzable: Boolean,            // derived from quality check
  embedding: [Number],                // 768 dim — populated Phase B, select:false
}
// Indexes (created by Mongoose):
//   - externalIds.doi unique sparse
//   - externalIds.openalexId sparse
//   - title text + abstractText text (compound text index)
//   - { "topics.topicName": 1, publicationYear: -1 }
//   - { publicationYear: -1, citationCount: -1 }
// Index already created in Atlas (manual):
//   - paper_vector_index (vectorSearch, 768 dim, cosine, filters on
//     publicationYear / topics / dataStatus)
```

#### `paper_source_records`
```ts
{
  paperId: ObjectId,                  // ref research_papers
  providerId: ObjectId,               // ref api_providers
  externalRecordId: String,           // e.g. "W2741809807" for OpenAlex
  rawMetadata: Mixed,                 // full raw JSON from the provider
  metadataHash: String,               // sha256(rawMetadata) — change detection
  fetchedAt: Date,
}
// Indexes: { paperId, providerId } compound, metadataHash
// Note: rawMetadata can be large; future cleanup can move records
//       older than 90 days to cold storage.
```

#### `paper_quality_checks`
```ts
{
  paperId: ObjectId,                  // ref, effectively 1:1
  hasTitle: Boolean,
  hasAbstract: Boolean,
  hasDoi: Boolean,
  hasJournal: Boolean,
  hasPublicationYear: Boolean,
  hasAuthors: Boolean,
  hasOpenAccessUrl: Boolean,
  qualityScore: Number,               // weighted 0..1
  checkStatus: enum["pass", "warn", "fail"],
  checkedAt: Date,
}
// Indexes: { paperId } unique, { checkStatus, checkedAt: -1 }
```

#### `api_providers`
```ts
{
  providerName: String,               // unique — "openalex", "semanticscholar", ...
  baseUrl: String,
  providerKind: enum["academic-api"],
  providerStatus: enum["active", "disabled"],
  rateLimitPerMin: Number,
}
// Seeded by a script: openalex, semanticscholar, crossref, arxiv (disabled).
```

#### `api_sync_configs`
```ts
{
  providerId: ObjectId,
  createdBy: ObjectId,                // ref users
  configName: String,                 // e.g. "LLM in education — OpenAlex"
  searchText: String,
  fromPublicationYear: Number,
  toPublicationYear: Number,
  scheduleCron: String,               // e.g. "0 2 * * *"
  configStatus: enum["enabled", "disabled"],
  lastRunAt: Date,
  nextRunAt: Date,
}
```

#### `api_sync_runs`
```ts
{
  syncConfigId: ObjectId,
  providerId: ObjectId,
  runStatus: enum["running", "succeeded", "failed", "cancelled"],
  startedAt: Date,
  finishedAt: Date,
  totalFetched: Number,
  totalInserted: Number,
  totalUpdated: Number,
  totalDuplicates: Number,
  errorMessage: String,
}
// Indexes: { startedAt: -1 } (admin dashboard listing)
```

#### `audit_logs`
```ts
{
  userId: ObjectId,                   // nullable for system actions
  actionName: String,                 // "sync.started", "paper.upserted", ...
  targetTableName: String,
  targetRecordId: String,             // string to keep polymorphic
  detailsText: Mixed,
}
// Indexes: { userId, createdAt: -1 }, { actionName, createdAt: -1 }
// TTL: 90 days
```

---

## Acceptance Criteria

Phase A is **done** when all of these are true:

### Functional
- [ ] All 13 Mongoose models from the Data Model section load without error
      (10 new + 3 existing: User, RefreshToken, Paper)
- [ ] `pnpm typecheck` passes for all four workspace packages
- [ ] `openalex.client` fetches one page of 200 papers from the live API with rate limit + retry
- [ ] `openalex.normalizer` maps a real OpenAlex JSON sample to the Paper schema correctly (unit-tested with 5+ samples covering edge cases — missing DOI, missing abstract, multi-author)
- [ ] Dedup is correct: running the same sync twice yields the same paper count, with `totalDuplicates > 0` on the second run
- [ ] Quality checks are computed for every paper, score in `[0, 1]`
- [ ] `POST /api/v1/admin/sync` enqueues a job and returns `{ runId }` immediately
- [ ] `pnpm worker:sync` consumes the job and writes to MongoDB
- [ ] Cron registered (configurable via env `SYNC_CRON`, default `0 2 * * *`)
- [ ] `api_sync_runs` populated with correct stats after each run
- [ ] `audit_logs` has `sync.started` and `sync.completed` entries per run
- [ ] `paper_source_records` has at least one entry per paper

### Non-functional
- [ ] Rate limit honoured: never exceeds 10 req/s against OpenAlex
- [ ] One bad paper does not abort the batch — error logged, loop continues
- [ ] All steps emit structured Pino logs (info on success, error on failure)
- [ ] Worker stays under 200MB RSS for a 100-paper sync

---

## Demo Script (≈ 5 minutes)

```powershell
# 1. Show empty state — Mongo MCP or curl
curl http://localhost:4000/api/v1/papers
# → { "success": true, "data": [], "meta": { "total": 0, ... } }

# 2. Show two processes running
# Terminal A: pnpm dev:backend     (Express + Atlas + Redis)
# Terminal B: pnpm worker:sync     (BullMQ Worker on "api-sync")

# 3. Trigger sync
curl -X POST http://localhost:4000/api/v1/admin/sync `
  -H "Content-Type: application/json" `
  -d '{ "searchText": "large language model education", "yearFrom": 2022, "maxPages": 1 }'
# → { "success": true, "data": { "runId": "...", "status": "queued" } }

# 4. Watch worker logs (real time)
# [INFO] openalex fetch page=1 ms=843 results=200
# [INFO] paper upserted doi=10.1234/... action=insert quality=0.85
# [INFO] paper upserted doi=10.5678/... action=update quality=0.92
# ...
# [INFO] sync run completed runId=... fetched=200 inserted=200 updated=0

# 5. Verify
curl http://localhost:4000/api/v1/papers?q=LLM%20education&pageSize=5
# → 5 papers, each with title/authors/year/citationCount

curl http://localhost:4000/api/v1/admin/sync/runs
# → recent runs with stats

# 6. (Optional) Run the same sync again to demonstrate dedup
curl -X POST .../admin/sync ...   # same payload
# Stats: totalDuplicates=200, totalInserted=0, totalUpdated=200
```

---

## Testing Plan

**Unit tests** (`vitest`, colocated `__tests__/`):
- `openalex.normalizer.test.ts` — JSON fixture → Paper, covering: standard article, missing DOI, missing abstract (uses inverted_index reconstruction), multi-author with affiliations.
- `sync.service.test.ts` — dedup logic with a mocked Paper model: insert-new, update-existing-by-doi, update-existing-by-openalex-id-when-no-doi.
- `paper-quality.test.ts` — quality scoring with 7 equally-weighted fields:
  all 7 present → 1.0, exactly 4 → ≈ 0.571, only title → ≈ 0.143.

**Integration test** (one file, real Mongoose against a test database):
- `sync.integration.test.ts` — stubbed OpenAlex client returning 5 papers, real `sync.service`, asserts: `research_papers` count = 5, `paper_source_records` count = 5, `paper_quality_checks` count = 5, `api_sync_runs` has one row with `runStatus = "succeeded"` and `totalFetched = 5`.

**Manual verification:**
- Run the demo script end-to-end against the real Atlas cluster.
- Open Atlas → Collections → check `research_papers` document shape with the embedded `authors`/`keywords`/`topics`.
- Re-run sync, confirm `totalDuplicates` increments rather than `totalInserted`.

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| OpenAlex JSON has variants we did not anticipate (e.g. missing fields) | Normalizer is permissive: any missing field becomes `undefined`/`null` rather than throwing. Unit tests cover the known edge cases. |
| Sync runs forever / leaks memory | `SYNC_MAX_PAGES_PER_RUN` env caps it (default 10 pages = 2,000 papers). |
| Atlas free tier (M0) is small (512 MB) | Phase A targets only ~100–500 papers (≪ 50 MB). `paper_source_records.rawMetadata` is the heaviest field; archive policy is documented for the future. |
| Worker crashes mid-batch | BullMQ retries automatically (5 attempts, exponential backoff). `api_sync_runs` still has the `running` row visible until manually cleaned. |
| Admin endpoint is open without admin auth | Endpoint gated by `requireAuth + requireRole('admin')` in code. For demo before an admin seed exists, the role check can be bypassed temporarily via env flag. |

---

## Out of Scope (Phase B and Beyond)

- Embedding pipeline (Phase B)
- Atlas Vector Search query path (Phase B)
- Semantic Scholar / Crossref clients (Phase B)
- LLM relevance scoring (Phase B)
- RAG analytical reports (Phase C)
- Research gap generation (Phase D)
- MCP tools (Phase D)
- Frontend pages — login/search/dashboard (Phase C-E web)
- Mobile screens (Phase C-E mobile)
- Push notifications, DOI scanner (Phase E mobile)
