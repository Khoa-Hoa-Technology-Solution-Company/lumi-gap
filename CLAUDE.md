# CLAUDE.md — Publication Trend System

> Context file for Claude Code (and any AI coding assistant) working on this repo.
> Read this first before touching code. Last updated: 2026-05-25.

---

## 1. What This Project Is

**Publication Trend System** — an AI-assisted academic publication trend analysis platform built as the WDP301 capstone at FPT University.

It is **not** a "build a new ML model" project. It investigates how **LLM + RAG + MCP** can be integrated into a paper-discovery system to improve:

- Paper search relevance (semantic, not just keyword)
- Trend explanation (why a topic is rising/falling)
- Research gap identification (grounded by retrieved evidence)
- Analytical report generation

**Target users:** lecturers, students, researchers. Three roles in code: `student`, `lecturer`, `researcher`, plus `admin`.

**Status:** Phase 0 (infrastructure) and Phase A design (data pipeline) complete. Phase A implementation begins next. See [Roadmap](#10-roadmap) below.

---

## 2. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Mono-repo | pnpm workspaces + Turborepo | Share `@trend/shared-types` between BE/Web/Mobile, atomic commits |
| Backend | Node.js 22 + Express 5 + TypeScript | Team familiarity, Express 5 has built-in async error handling |
| ORM | Mongoose 8 | Schema validation + Atlas integration in one package |
| Queue | BullMQ + Redis | Industry standard for Node job queues |
| Web | React 18 + Vite 6 + TypeScript | Fast HMR, ecosystem maturity |
| Web UI | Tailwind 3 + shadcn/ui | Composable primitives, no lock-in |
| Web routing | React Router v6 | Simplest learning curve |
| Web state | Zustand + TanStack Query | Zustand for client state, Query for server state |
| Mobile | Expo SDK 52 + React Native + TypeScript | OTA updates, EAS Build, no native toolchain pain |
| Mobile UI | NativeWind 4 | Reuse Tailwind knowledge cross-platform |
| AI — LLM | Gemini 3.5 Flash (cheap) + 2.5 Pro (reports) | Same SDK as embeddings, generous free tier |
| AI — Embedding | Gemini Embedding 2 (768 dim) | Same SDK, free tier sufficient for MVP |
| Vector store | MongoDB Atlas Vector Search | Co-located with metadata, no separate DB |
| Cache | Upstash Redis (TLS, Singapore region) | Free tier, no local Docker needed |
| Auth | JWT (15min access + 7d refresh) | Stateless, works for web + mobile |
| Validation | Zod | Single schema for HTTP DTOs and TypeScript types |
| Logging | Pino + pino-http | Structured JSON logs, pretty-printed in dev |
| Testing | Vitest | Vite-native test runner |

**Versions are pinned in `pnpm-lock.yaml`.** Commit it always.

---

## 3. Cloud Services

These are configured per developer in their own `.env`. The team lead (hoangtira) owns the infrastructure.

| Service | URL | Free tier covers |
|---|---|---|
| MongoDB Atlas | https://cloud.mongodb.com | 512 MB on M0, ~50K papers |
| Upstash Redis | https://console.upstash.com | 10K commands/day |
| Google AI Studio (Gemini) | https://aistudio.google.com | ~250 RPD on Flash, ~125 on Pro |
| OpenAlex API | https://api.openalex.org | Unlimited with polite mailto |
| GitHub | https://github.com/longdevlife/LiemResearch | **PUBLIC fork** — never commit secrets; old repo `publication-trend-system` is frozen |

**Each developer creates their own Gemini key** — sharing one hits rate limits faster.

**MongoDB URI + JWT secrets are shared** through Discord/Messenger DM, never via git or public channels.

---

## 4. Repository Layout

```
LiemResearch/                                    (repo root — fork of thiennhat-ctrl/LiemResearch)
├── apps/
│   ├── backend/                                 Express 5 API + BullMQ workers
│   ├── web/                                     React + Vite + shadcn web app
│   └── mobile/                                  Expo + NativeWind mobile app
├── packages/
│   └── shared-types/                            framework-agnostic TS types
├── legacy/                                      original LiemResearch code — port reference
│   ├── backend-js/                              ratings, points, notifications, S3 (JS)
│   └── web-figma/                               17 UI pages + rank badges (Tailwind v4)
│                                                → port per docs/MIGRATION_MAP.md, then delete
├── docs/
│   ├── MIGRATION_MAP.md                         legacy → monorepo porting checklist
│   └── superpowers/specs/                       design specs (per phase)
├── docker-compose.yml                           local Mongo + Redis (not used —
│                                                Atlas + Upstash instead)
├── pnpm-workspace.yaml                          workspace declaration
├── pnpm-lock.yaml                               COMMIT THIS — version pinning
├── turbo.json                                   task orchestration
├── tsconfig.base.json                           shared TS config
├── .gitignore                                   .env, node_modules, .turbo, etc.
├── .npmrc                                       pnpm settings (node-linker isolated)
└── CLAUDE.md                                    you are reading this
```

---

## 5. Per-App Layout (Feature-Based Pattern)

All three apps follow the same conceptual layout: routes are thin, features are self-contained modules, infrastructure is a single import boundary away.

### Backend (`apps/backend/src/`)

```
config/env.ts                     Zod-validated process.env (refuses boot if missing)

common/                           cross-cutting concerns
├── exceptions/app-error.ts       AppError class + factory methods
└── middleware/
    ├── auth.ts                   requireAuth (JWT) + requireRole
    ├── validate.ts               Zod request validation
    └── error-handler.ts          global handler + 404 handler

infrastructure/                   external system clients (one file per system)
├── db.ts                         Mongoose connect / disconnect
├── redis.ts                      ioredis client + lifecycle
├── cache.ts                      JSON cache wrapper + hashKey()
├── logger.ts                     Pino logger (pretty in dev)
└── queue.ts                      BullMQ queues (apiSync, embedding, report)

modules/                          feature modules — each self-contained
├── auth/
│   ├── dto/auth.schema.ts        Zod request schemas
│   ├── models/user.model.ts      User + RefreshToken (Mongoose)
│   ├── auth.controller.ts        thin HTTP handlers
│   ├── auth.service.ts           business logic
│   └── auth.routes.ts            route table
├── papers/
│   ├── models/paper.model.ts     Paper (Mongoose) — pinned to "research_papers"
│   ├── paper.controller.ts
│   └── paper.routes.ts
├── llm/gemini.client.ts          generateText / generateJSON
└── embeddings/                   provider interface + Gemini implementation

workers/                          standalone process entry points
└── (Phase A) sync.worker.ts

routes/index.ts                   mounts module routers under /api/v1
app.ts                            Express composition
server.ts                         entry — connect deps, listen, ready banner
```

### Web (`apps/web/src/`)

```
assets/                           images, fonts, icons (imports via @/assets)
components/                       shared UI building blocks
└── ui/                           shadcn primitives (generated)
constants/api.ts                  centralised backend route paths
features/                         feature modules — each owns api/, hooks/, components/
├── auth/                         api/, hooks/use-auth.ts, schemas/, index.ts
├── papers/                       api/, hooks/use-papers.ts, index.ts
├── search/                       (Phase B)
├── trends/                       (Phase B)
├── reports/                      (Phase C)
└── bookmarks/                    (Phase D)
hooks/                            app-wide hooks
layouts/                          MainLayout, AuthLayout
pages/                            route components (thin)
routes/app-routes.tsx             <Routes/> table with nested layouts
services/
├── api-client.ts                 axios + JWT refresh-on-401
└── query-client.ts               react-query defaults
stores/auth-store.ts              zustand persisted to localStorage
theme/globals.css                 Tailwind layers + shadcn CSS vars
utils/{cn,format}.ts              shadcn cn() + formatters
App.tsx                           renders <AppRoutes />
main.tsx                          providers: QueryClient + Router
```

### Mobile (`apps/mobile/`)

```
app/                              Expo Router routes (REQUIRED at this path)
├── _layout.tsx                   root providers
├── index.tsx                     home screen
├── (tabs)/                       tab group  (Phase C)
├── (auth)/                       auth group (Phase C)
└── paper/[id].tsx                paper detail (Phase C)

src/                              non-route code (same layout as web)
├── components/
├── constants/api.ts
├── features/
├── hooks/
├── layouts/
├── services/{api-client,query-client}.ts
├── stores/auth-store.ts          zustand persisted to expo-secure-store
├── theme/{globals.css,colors.ts}
└── utils/format.ts

assets/                           Expo icon/splash (REQUIRED at this path)
```

### Shared Types (`packages/shared-types/src/`)

```
common.ts                         ApiResponse<T>, ResponseMeta, ApiError, ISODateString
user.ts                           User, UserRole, AuthTokens, LoginRequest, ...
paper.ts                          Paper, PaperAuthorRef, PaperKeyword, PaperAiScore
author.ts, journal.ts             master entities
search.ts                         SearchRequest, SearchResponse, SearchFilters
trend.ts                          PublicationTrend, YearlyCount, TopItem
report.ts                         AnalyticalReport, ResearchGap, ReportStatus
```

**Rule:** this package is framework-agnostic. No Express, React, or Mongoose imports.

---

## 6. Conventions (Non-negotiable)

### File naming
- TypeScript files: kebab-case (`auth.service.ts`, `use-papers.ts`)
- React components and Mongoose models: PascalCase exports inside kebab-case files
- Tests: colocated `__tests__/foo.test.ts`

### Module structure (backend)
- A module under `modules/<name>/` owns its **own** routes, controller, service, schema, and Mongoose model.
- Controllers stay **thin** — orchestrate HTTP I/O only. Business logic lives in `*.service.ts`.
- Throw `AppError.*` from services. The global handler in `common/middleware/error-handler.ts` formats them.
- Validate with `validate(schema, "body" | "query" | "params")`, not inline Zod parsing.

### API response envelope (every endpoint)
```ts
// success
{ "success": true, "data": <T>, "meta"?: { page, pageSize, total, totalPages } }

// failure
{ "success": false, "error": { "code": "BAD_REQUEST", "message": "...", "details"?: ... } }
```

### Auth
- Access token: 15 min, signed with `JWT_ACCESS_SECRET`.
- Refresh token: 7 days, **hashed** in MongoDB with a TTL index. Rotated on each refresh.
- Web: tokens in localStorage. Mobile: tokens in expo-secure-store (Keychain / Keystore).
- 401 → client tries refresh once → on failure, clear tokens and redirect to login.

### Long-running work
- **Never** in request handlers. Enqueue to BullMQ. The worker is a **separate Node process** (`pnpm worker:sync`, etc.).
- Each worker has retry + exponential backoff (`attempts: 5, backoff: { type: "exponential", delay: 2000 }`).

### LLM calls
- Always go through `modules/llm/gemini.client.ts` so retries, logging, and cost tracking live in one place.
- **Cache** every LLM response in Redis with key = `hash(query + filters + model + prompt_version + retrieved_paper_ids)`. Default TTL 7 days.
- Never call LLM inside a search request. Only when the user explicitly requests AI analysis.

### Embeddings
- Always via `getEmbeddingProvider()` (factory). Do not import `GeminiEmbeddingProvider` directly outside the factory.
- Mongoose: `embedding` field is `select: false` so list queries don't carry vectors over the wire.

### Mongoose collection names
- **Always pin explicitly:** `mongoose.model("Paper", schema, "research_papers")`.
- Atlas Vector Search indexes are created against specific collection names. If you let Mongoose pluralize ("Paper" → "papers"), the index won't see your data. This bit us once — see git log `dd9c2d8`.

### Polymorphic relationships
- For `bookmarks`, `follows`, `notifications`, `publication_trends`: use a `targetKind` discriminator + a single `targetId`, **not** a nullable column per kind.

### Embed vs reference (MongoDB)
- Embed bounded child lists that are always read with the parent (paper.authors[], paper.keywords[], paper.topics[]).
- Reference everything else (paper_source_records, paper_quality_checks, paper_references).

### Shared types
- If both backend and frontend need a type (Paper, User, Report), it lives in `@trend/shared-types`.
- Do not copy types between packages.

### Secrets
- `.env` is `.gitignore`d. Do not commit, do not paste in chat, do not screenshot.
- Each developer maintains their own `.env`. Shared values (Mongo URI, JWT secrets) come from a pinned Discord message.
- Gemini API key: each developer has their own.

---

## 7. Common Commands

All commands run from the repo root unless noted.

```bash
# install everything
pnpm install

# typecheck across all packages
pnpm typecheck

# dev servers
pnpm dev                                # all apps in parallel (turbo)
pnpm dev:backend                        # just backend
pnpm dev:web                            # just web
pnpm dev:mobile                         # just mobile (opens Expo)

# workers (Phase A and later)
pnpm --filter backend worker:sync       # OpenAlex sync worker
pnpm --filter backend worker:embedding  # Gemini embedding worker (Phase B)
pnpm --filter backend worker:report     # report generator (Phase C)

# build
pnpm build

# tests
pnpm test                               # vitest run

# clean
pnpm clean                              # dist + .turbo

# Mongo connectivity smoke test
pnpm --filter backend test:mongo
```

**Backend boots with a ready banner:**
```
  ┌──────────────────────────────────────────────────────────┐
  │  🚀  Backend ready                                       │
  │     Local:    http://localhost:4000                      │
  │     Health:   http://localhost:4000/health               │
  │     API:      http://localhost:4000/api/v1               │
  └──────────────────────────────────────────────────────────┘
```

If env is invalid, a red banner names the missing variable.

---

## 8. Environment Variables

See [`apps/backend/.env.example`](apps/backend/.env.example) for the full template. Required for backend boot:

| Variable | Notes |
|---|---|
| `MONGODB_URI` | Atlas `mongodb+srv://` connection string. URL-encode special chars in the password (`@` → `%40`). Must include `/publication_trend` before the `?`. |
| `REDIS_URL` | Upstash `rediss://default:<password>@<host>:6379`. Note the double `s` (TLS required). |
| `JWT_ACCESS_SECRET` | ≥ 32 chars random hex. Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_REFRESH_SECRET` | ≥ 32 chars random hex. Must differ from access secret. |
| `GEMINI_API_KEY` | From https://aistudio.google.com/apikey. Each dev has their own. |

Optional (have sensible defaults):
- `PORT` (4000), `LOG_LEVEL` (info), `CORS_ORIGIN`, `SYNC_CRON`, `OPENALEX_MAILTO`, `GEMINI_MODEL_FAST`, `GEMINI_EMBEDDING_DIMENSIONS`, etc.

Web and mobile `.env` only contain the API base URL — no secrets.

---

## 9. Data Model Snapshot

### Currently in MongoDB (Phase 0 + Vector Search index)

```
publication_trend  (Atlas, AP_EAST_1)
├── users                  (UserModel)             — created
├── refreshtokens          (RefreshTokenModel)     — created, TTL indexed
└── research_papers        (PaperModel)            — created, EMPTY
    └── 🔍 paper_vector_index                       — READY
        • vector: embedding (768 dim, cosine)
        • filters: publicationYear, topics, dataStatus
```

### Planned by end of Phase A (10 new models)

`journals`, `authors`, `keywords`, `research_topics`, `paper_source_records`, `paper_quality_checks`, `api_providers`, `api_sync_configs`, `api_sync_runs`, `audit_logs`.

See [docs/superpowers/specs/2026-05-25-phase-a-design.md](docs/superpowers/specs/2026-05-25-phase-a-design.md) for full schemas, embed/reference decisions, and indexes.

### Deferred to later phases (~27 collections)

`paper_text_chunks`, `paper_embeddings` (B), `publication_trends` (B), `research_projects`, `project_members`, `project_papers` (C), `saved_searches`, `bookmarks`, `follows`, `notifications` (D), `uploaded_papers` (E), `rag_queries`, `rag_retrieved_contexts` (C), `ai_models`, `prompt_templates`, `llm_analysis_reports`, `paper_ai_scores`, `research_gaps`, `report_verifications`, `dashboard_reports` (C-D), `mcp_servers`, `mcp_tools`, `mcp_tool_runs` (D).

---

## 10. Roadmap

```
Phase 0  Setup & infrastructure                                  ✅ done
Phase A  OpenAlex sync pipeline + Phase A models                 📐 designed, ⏳ coding next
Phase B  Embeddings + semantic search + LLM relevance scoring    🔒 not started
Phase C  RAG pipeline + analytical reports + projects            🔒 not started
Phase D  MCP tools + research gap analysis                       🔒 not started
Phase E  Web pages + mobile screens + push notifications         🔒 not started
```

**Effort estimates** (4-person team):

| Phase | Hours | Calendar weeks |
|---|---|---|
| Phase A | 6–10 | ~1 |
| Phase B | 10–15 | ~1 |
| Phase C | 15–20 | ~1.5 |
| Phase D | 10–15 | ~1 |
| Phase E | 25–30 | ~2 |
| **Total** | **~70–90** | **~6 weeks** |

---

## 11. Important Decisions & Gotchas

These are the things that caused real bugs or near-misses. Keep them in mind:

1. **MongoDB, not PostgreSQL.** Decided before code. The schema looks SQL-ish but is adapted: embed junction tables, use polymorphic discriminators where SQL would use FK + nullable columns, JSON-as-object instead of JSON-as-text.

2. **Mongoose collection name must be explicit.** `mongoose.model("Paper", schema, "research_papers")` — without the third argument, Mongoose pluralizes to `papers` and the Atlas Vector Search index never sees writes. (See `dd9c2d8`.)

3. **Upstash Redis, not Docker Redis.** Docker Desktop has a known bug with its Inference Manager on Windows that blocks startup. We use Upstash (cloud, TLS) instead — same Redis protocol, no local install. Just switch `REDIS_URL`.

4. **URL-encode passwords in `MONGODB_URI`.** `@` becomes `%40`, `:` becomes `%3A`, `/` becomes `%2F`. Or autogenerate a password without special characters and avoid the problem.

5. **Auto-generated Atlas passwords are best.** Don't hand-roll passwords — they leak in URLs and chat. Atlas's Autogenerate Secure Password produces URL-safe characters.

6. **`.env` is `.gitignore`d, never committed.** Three secrets have already leaked in chat during setup (Mongo password, Upstash token). Each leak means rotating that credential.

7. **Atlas Vector Search index outlives the collection schema.** Build the index against the right collection name **before** writing the worker code that populates it. Confirmed in audit step.

8. **Worker is a separate Node process.** `pnpm worker:sync` runs `tsx src/workers/sync.worker.ts` in its own process. Dev terminal A: backend. Terminal B: worker. They share the Redis queue, nothing else.

9. **Cache every LLM call.** The free tier has rate limits. The cache key must include `prompt_version` so a prompt change invalidates old entries.

10. **The Atlas free tier (M0) is 512 MB.** Phase A targets ~100 papers (≪ 50 MB). `paper_source_records.rawMetadata` is the heaviest field; document an archive policy when usage approaches the cap.

11. **Mobile is Android-only for testing.** Team has no Macs and no iOS devices. Code stays cross-platform Expo (so iOS support comes free later), but every PR is tested on Android Studio emulator or Expo Go Android. Design mockups frame on **Pixel 6 (412×892dp)** — not iPhone. Touch target minimum is Material 3's 48dp, not iOS's 44pt. Forms use `KeyboardAvoidingView behavior="height"` (Android), not the iOS-style `"padding"`. See [docs/DESIGN_LANGUAGE.md §11](docs/DESIGN_LANGUAGE.md) for the full Android-specific gotcha list.

---

## 12. Where Else To Look

| Document | What's in it |
|---|---|
| [README.md](README.md) | First-time setup commands |
| [apps/backend/README.md](apps/backend/README.md) | Backend module layout + conventions |
| [apps/web/README.md](apps/web/README.md) | Web feature-based layout |
| [apps/mobile/README.md](apps/mobile/README.md) | Expo Router + NativeWind notes |
| [docs/superpowers/specs/2026-05-25-phase-a-design.md](docs/superpowers/specs/2026-05-25-phase-a-design.md) | Full Phase A design (data flow, schemas, acceptance criteria) |

---

## 13. For Claude (or Any AI Working In This Repo)

### Workflow rules
- **DO NOT auto-commit.** Edit files and verify them. Suggest a commit message at the end. The user runs `git add` and `git commit` themselves at their own pace.
- **DO NOT run `git push`, `git reset`, or any destructive git command** unless the user explicitly asks.
- **DO ask before** scaffolding new packages, installing global tools, or making changes outside `apps/`, `packages/`, or `docs/`.

### Code rules
- **Read the Phase A design spec first** before suggesting changes to data flow, model schemas, or sync logic.
- **Stay within the conventions in §6.** They are not preferences — they are constraints we agreed on.
- **Long-running work goes in BullMQ workers, not request handlers.** No exceptions.
- **Validate every new env var with Zod in `config/env.ts`.** Don't read `process.env.X` directly outside that file.
- **When adding a new Mongoose model, always:** (a) pass the collection name as the third arg to `mongoose.model()`, (b) add the relevant indexes, (c) export the typed `Doc` interface alongside the model.
- **When adding a new API endpoint:** controller is thin, service has logic, schema validates input, return the `{ success, data, meta }` envelope.
- **When asked to install a new dependency with a postinstall script**, update `pnpm-workspace.yaml`'s `allowBuilds` so the team doesn't trip the `ERR_PNPM_IGNORED_BUILDS` warning.
- **If something doesn't fit the structure**, surface it instead of working around it. The structure is more easily fixed than abandoned.
