# CLAUDE.md — Publication Trend System

> Context file for Claude Code (and any AI coding assistant) working on this repo.
> Read this first before touching code. Last updated: 2026-10-07.

### Multi-Agent Workflow Rules (.herdr):
- **Lệnh tắt siêu ngắn (Short Triggers)**:
  - `plan <tên>` hoặc `spec <tên>`: Tự động phân tích và xuất file kế hoạch vào `.herdr/specs/<tên>.md`.
  - `code` hoặc `làm` (hoặc `code <tên>`): **TỰ ĐỘNG quét file spec mới nhất trong `.herdr/specs/`**, đọc checklist và bắt tay vào code ngay. Người dùng **không cần gõ đường dẫn file**.
- **Vai trò 1 (Planner / Architect)**:
  - Khi người dùng bảo `plan...` hoặc `spec...`:
  - **MẶC ĐỊNH LUÔN TỰ ĐỘNG TẠO FILE TẠI `.herdr/specs/<ten-tinh-nang>.md`**.
  - File kế hoạch bắt buộc có checklist từng bước (`- [ ] Task`).
- **Vai trò 2 (Coder / Builder)**:
  - Khi người dùng chỉ cần gõ `code` (hoặc `làm`, `triển khai`):
  - Tự động tìm file spec mới nhất trong `.herdr/specs/` (file có checklist chưa hoàn thành).
  - Đọc checklist và code lần lượt từng task, tick `[x]` vào checklist và chạy test nghiệm thu.


---

## 1. What This Project Is

**Publication Trend System** — an AI-assisted academic publication trend analysis platform built as the WDP301 capstone at FPT University.

It is **not** a "build a new ML model" project. It investigates how **LLM + RAG + MCP** can be integrated into a paper-discovery system to improve:

- Paper search relevance (semantic, not just keyword)
- Trend explanation (why a topic is rising/falling)
- Research gap identification (grounded by retrieved evidence)
- Analytical report generation

**Target users:** lecturers, students, researchers. Three roles in code: `student`, `lecturer`, `researcher`, plus `admin`.

**Status:** Phases 0–D are largely implemented (OpenAlex sync/ingest, embeddings + hybrid retrieval, paper analysis/scoring, RAG reports, research gaps, MCP tools). Phase E UI work plus community/forum, peer-review, projects, credits, and personal AI connections are in active development. See [Roadmap](#10-roadmap) below.

---

## 2. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Mono-repo | pnpm workspaces + Turborepo | Share `@trend/shared-types` between BE/Web/Mobile, atomic commits |
| Backend | Node.js 22 + Express 5 + TypeScript | Team familiarity, Express 5 has built-in async error handling |
| Database/ORM | PostgreSQL 16 + pgvector + Prisma 7 | Relational integrity, migrations, and vector search in one database |
| Queue | BullMQ + Redis | Industry standard for Node job queues |
| Web | React 18 + Vite 6 + TypeScript | Fast HMR, ecosystem maturity |
| Web UI | Tailwind 3 + shadcn/ui | Composable primitives, no lock-in |
| Web routing | React Router v6 | Simplest learning curve |
| Web state | Zustand + TanStack Query | Zustand for client state, Query for server state |
| Mobile | Expo SDK 52 + React Native + TypeScript | OTA updates, EAS Build, no native toolchain pain |
| Mobile UI | NativeWind 4 | Reuse Tailwind knowledge cross-platform |
| AI — LLM | Gemini via `GEMINI_MODEL_FAST` (summary, scoring, rerank) and `GEMINI_MODEL_DEEP` (report, gap, trend); both default to `gemini-3.1-flash-lite` in `config/env.ts` | Same SDK as embeddings, generous free tier. Never hardcode a model name: read it through `env` (or `aiModel()` / `routeLlmModel()`), because a user with a personal AI connection overrides it |
| AI — Embedding | Gemini Embedding 2 (768 dim) | Same SDK, free tier sufficient for MVP |
| Vector store | pgvector | Co-located with PostgreSQL metadata |
| Cache | Redis | Cache and BullMQ transport; local Compose and hosted Redis are supported |
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
| PostgreSQL | Local Docker or managed PostgreSQL with pgvector | Primary application datastore |
| Upstash Redis | https://console.upstash.com | 10K commands/day |
| Cloudinary | https://cloudinary.com | Optional file/PDF storage; `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (all three or none). PDFs can also use `local` or `r2` storage (`infrastructure/pdf-storage.service.ts`) |
| Google AI Studio (Gemini) | https://aistudio.google.com | ~250 RPD on Flash, ~125 on Pro |
| OpenAlex API | https://api.openalex.org | Unlimited with polite mailto |
| GitHub | https://github.com/longdevlife/LiemResearch | **PUBLIC fork** — never commit secrets; old repo `publication-trend-system` is frozen |

**Each developer creates their own Gemini key** — sharing one hits rate limits faster.

**Database credentials + JWT secrets are never committed** and must only be shared through an approved secret channel.

---

## 4. Repository Layout

```
LumiGap/                                    (repo root — fork of thiennhat-ctrl/LiemResearch)
├── apps/
│   ├── backend/                                 Express 5 API + BullMQ workers
│   ├── web/                                     React + Vite + shadcn web app
│   ├── mobile/                                  Expo + NativeWind mobile app
│   ├── flutter_mobile/                          Flutter mobile app (parallel client)
│   └── ai-reviewer/                             Python (FastAPI-style) paper-review agent service
├── packages/
│   └── shared-types/                            framework-agnostic TS types
├── legacy/                                      original LumiGap code — port reference only
│   ├── backend-js/                              ratings, points, notifications, S3 (JS)
│   └── web-figma/                               17 UI pages + rank badges (Tailwind v4)
├── docs/                                        guides, runbooks, migration audits
│   └── superpowers/specs/                       design specs (per phase)
├── .herdr/                                      multi-agent workflow (specs/ holds plans)
├── tests/ + playwright.config.ts                Playwright e2e (pnpm test:e2e)
├── scripts/                                     setup.mjs and other repo scripts
├── deploy/, Jenkinsfile, Dockerfile.*           deployment and CI
├── docker-compose.yml                           local PostgreSQL/pgvector + Redis
├── pnpm-workspace.yaml                          workspace declaration
├── pnpm-lock.yaml                               COMMIT THIS — version pinning
├── turbo.json                                   task orchestration
├── tsconfig.base.json                           shared TS config
├── .gitignore                                   .env, node_modules, .turbo, etc.
├── .npmrc                                       pnpm settings (node-linker hoisted)
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
    ├── auth.ts                   requireAuth / optionalAuth (JWT) + requireRole; also binds the caller's personal AI connection
    ├── permission.ts             requirePermission(...) checks role permissions
    ├── upload.ts                 multer memory-storage upload; the controller decides where to store the file
    ├── rate-limit.ts             createRateLimiter(name, options): memory or Redis store (RATE_LIMIT_STORE)
    ├── validate.ts               Zod request validation
    └── error-handler.ts          global handler + 404 handler

infrastructure/                   external system clients (one file per system)
├── database/                    prisma.ts (Prisma client lifecycle), database-id.ts, postgres-paper-search.ts,
│                                 postgres-only-runtime.ts (guard behind runtime:audit:postgres)
├── redis.ts                      ioredis client + lifecycle
├── cache.ts                      JSON cache wrapper + hashKey(), LLM_CACHE_TTL_SECONDS (7 days)
├── logger.ts                     Pino logger (pretty in dev)
├── queue.ts                      BullMQ queues (apiSync, embedding, report, ...)
├── cloudinary-storage.service.ts Cloudinary upload/delete helpers
├── pdf-storage.service.ts        PDF storage behind one interface: local | r2 | cloudinary
├── readiness.ts                  dependency checks behind GET /ready
└── worker-heartbeat.ts           worker liveness records (see scripts/verify-worker-heartbeats.ts)

modules/                          feature modules — each self-contained
├── auth/
│   ├── dto/auth.schema.ts        Zod request schemas
│   ├── auth.controller.ts        thin HTTP handlers
│   ├── auth.service.ts           business logic
│   └── auth.routes.ts            route table
├── papers/
│   ├── paper.controller.ts
│   └── paper.routes.ts
├── llm/                          gemini.client.ts (generateText / generateJSON), llm.run.ts (cachedGenerate*), llm.factory.ts
├── user-ai/                      per-user personal AI connections (encrypted keys, see docs/PERSONAL_AI_CONNECTIONS.md)
├── embeddings/                   provider interface + Gemini implementation
└── ...                           api-sync, retrieval, search, scoring, trends, reports, gaps, mcp,
                                  bookmarks, forum, communities, projects, recruitment, submissions,
                                  reviews, credits, notifications, ai-jobs, admin, analytics, ...
                                  (list `apps/backend/src/modules/` for the current set)

workers/                          standalone process entry points
└── sync, openalex-ingest, corpus-validation, embedding, paper-analysis, report,
    gaps, notification, ai-jobs, community-summary

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
├── search/, trends/, reports/, gaps/, literature/, compare/
├── bookmarks/, forum/, projects/, submissions/, reviews/
└── admin/, credits/, notifications/, user-ai/, academic-profile/, ...
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

> TODO(team): confirm which mobile app is the primary one. Both `apps/mobile` (Expo, in the pnpm workspace) and `apps/flutter_mobile` (Flutter, not in the workspace; `pnpm dev:flutter_mobile`) exist and no document says which is canonical.

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

### AI Reviewer (`apps/ai-reviewer/`)

Python service (FastAPI served by uvicorn, `app.main:app`, started by `run.py`) that pre-reviews manuscripts, extracts PDF text and checks formats. It has its own `AGENTS.md`, `requirements.txt` and `Dockerfile`, and is **not** part of the pnpm workspace. The TypeScript/Express conventions in §6 do **not** apply to it.

- Run: `pip install -r apps/ai-reviewer/requirements.txt`, then `python apps/ai-reviewer/run.py` (host/port from `REVIEW_APP_*`), or Docker Compose (service `ai-reviewer`, port 8001).
- The backend calls it over HTTP at `AI_REVIEWER_URL` (default `http://localhost:8001`) with an `X-Internal-Key: INTERNAL_SERVICE_KEY` header: `/internal/pre-review`, `/internal/extract-text`, `/internal/health`, `/internal/format-presets` (see `modules/papers/ai-reviewer.client.ts`, `modules/knowledge/knowledge.source.ts`).

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

**Rule:** this package is framework-agnostic. No Express, React, Prisma, or database-client imports.

---

## 6. Conventions (Non-negotiable)

### File naming
- TypeScript files: kebab-case (`auth.service.ts`, `use-papers.ts`)
- React components: PascalCase exports inside kebab-case files
- Tests: colocated `__tests__/foo.test.ts`

### Module structure (backend)
- A module under `modules/<name>/` owns its **own** routes, controller, service, and validation schema. Persistent models live in the multi-file Prisma schema.
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
- Access token: 15 min, signed with an RS256 private key.
- Refresh token: 7 days, **hashed** in PostgreSQL and rotated on each refresh.
- Web: tokens in localStorage. Mobile: tokens in expo-secure-store (Keychain / Keystore).
- 401 → client tries refresh once → on failure, clear tokens and redirect to login.

### Long-running work
- **Never** in request handlers. Enqueue to BullMQ. The worker is a **separate Node process** (`pnpm worker:sync`, etc.).
- Each worker has retry + exponential backoff (`attempts: 5, backoff: { type: "exponential", delay: 2000 }`).

### LLM calls
- Call the LLM through `modules/llm/`: `cachedGenerateJSON` / `cachedGenerateText` (`llm.run.ts`) for cached calls, `getLlmProvider()` (`llm.factory.ts`) or `generateText` / `generateJSON` (`gemini.client.ts`) otherwise. Retries, quota errors and logging live there. Do not create your own Gemini client.
- **Which key is used:** `requireAuth` / `optionalAuth` and the BullMQ workers (report, gaps, paper-analysis, ai-jobs) wrap the work in `withUserAi(userId, ...)` (`modules/user-ai/user-ai.runtime.ts`). If that user has a saved personal AI connection, `personalAiRuntime()` is set and `gemini.client.ts` sends the call through `personal-ai.client.ts` with the user's provider, base URL, model and key. Otherwise the platform key `GEMINI_API_KEY` and `GEMINI_MODEL_*` are used. A new worker that makes LLM calls on a user's behalf must also wrap its work in `withUserAi`.
- **Cache** every LLM response in Redis. The key is `llm:<task>:<promptVersion>:<hash>` where the hash covers `model`, `keyParts` (query, filters, retrieved paper ids, ...), `inputHash` (prompt + system) and, for personal connections only, a `providerScope` (`userId:connectionId:updatedAt`) so users never read each other's cached output and editing a connection invalidates it. Platform calls share one namespace. Default TTL 7 days. Always build the key with `buildLlmCacheKey`, and bump `promptVersion` when a prompt changes.
- **Personal keys:** stored encrypted (AES-256-GCM, `user-ai.crypto.ts`, bound to the user id), decrypted lazily only when a call is made, never logged and never returned to the client. See [docs/PERSONAL_AI_CONNECTIONS.md](docs/PERSONAL_AI_CONNECTIONS.md).
- Never call LLM inside a search request. Only when the user explicitly requests AI analysis.

### Rate limiting
- Create every limiter with `createRateLimiter(name, options)` from `common/middleware/rate-limit.ts`; do not import `express-rate-limit` directly. `name` must be unique (it prefixes the Redis keys).
- Counters are in memory per process by default. `RATE_LIMIT_STORE=redis` shares them between instances, but costs Redis commands per request, so do not enable it on the Upstash free tier. A failing store lets requests through.

### Embeddings
- Always via `getEmbeddingProvider()` (factory). Do not import `GeminiEmbeddingProvider` directly outside the factory.
- Embedding queries use pgvector through parameterized Prisma SQL. Ordinary list endpoints must not select vector payloads.

### Polymorphic relationships
- For `bookmarks`, `follows`, `notifications`, `publication_trends`: use a `targetKind` discriminator + a single `targetId`, **not** a nullable column per kind.

### Relational persistence
- Define relations, constraints, and indexes in `apps/backend/prisma/*.prisma`.
- Use Prisma transactions for multi-row state changes and Prisma tagged SQL for pgvector or advanced queries.

### Shared types
- If both backend and frontend need a type (Paper, User, Report), it lives in `@trend/shared-types`.
- Do not copy types between packages.

### Secrets
- `.env` is `.gitignore`d. Do not commit, do not paste in chat, do not screenshot.
- Each developer maintains their own `.env`. Database credentials and JWT secrets are never committed.
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

# workers (each is its own process; see apps/backend/package.json for all)
pnpm --filter backend worker:sync            # OpenAlex sync
pnpm --filter backend worker:openalex-ingest # bulk OpenAlex ingest
pnpm --filter backend worker:embedding       # Gemini embeddings
pnpm --filter backend worker:paper-analysis  # AI paper analysis/scoring
pnpm --filter backend worker:report          # report generator
pnpm --filter backend worker:gaps            # research gap analysis
pnpm --filter backend worker:notifications | worker:ai-jobs | worker:community-summary | worker:corpus-validation

# read-only similarity report to tune COMMUNITY_SUGGEST_MIN_SIMILARITY (needs a real GEMINI_API_KEY)
pnpm --filter backend eval:community-suggest "machine learning" "học máy"   # or: --file queries.txt

# build
pnpm build

# tests
pnpm test                               # vitest run
pnpm test:e2e                           # Playwright e2e
pnpm lint                               # eslint via turbo

# docker
pnpm setup                              # generate local .env secrets/keys
pnpm docker:infra                       # postgres + redis only
pnpm docker:up                          # full stack

# clean
pnpm clean                              # dist + .turbo

# PostgreSQL-only runtime audit and readiness probe
pnpm --filter backend runtime:audit:postgres
curl http://localhost:4000/ready
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

See root [`.env.example`](.env.example) and [the key inventory](docs/environment-variables.md). Run `pnpm setup` to generate local passwords and RS256 keys, then fill in `GEMINI_API_KEY`. Backend/Prisma/workers load root `.env` independent of cwd and expand `${...}`; Compose overrides internal hosts.

Use `pnpm docker:infra` for native backend/web or `pnpm docker:up` for the full stack with default workers. Migrations and Docker JWT keys initialize automatically. Demo seed is opt-in (`docker compose --profile seed up seed`). Vite uses root `envDir` and exposes only `VITE_*`; native web runs on port 3000. Mobile launchers consume only public API configuration from root `.env`. Production uses the separate root `.env.production.example` template and the existing Jenkins credential contract.

---

## 9. Data Model Snapshot

### Current PostgreSQL/pgvector persistence

```
lumigap_db  (PostgreSQL 16 + pgvector)
├── identity and access: users, refresh_tokens, roles, permissions
├── academic data: papers, authors, topics, embeddings
├── collaboration: communities, forum, projects, recruitment
├── review workflow: submissions, revisions, reviewer assignments
└── AI/RAG: reports, research gaps, AI jobs, evidence relations
```

The authoritative schema is `apps/backend/prisma/`. Apply checked-in migrations with `pnpm --filter backend db:migrate:deploy`.

---

## 10. Roadmap

```
Phase 0  Setup & infrastructure                                  ✅ done
Phase A  OpenAlex sync pipeline + Phase A models                 ✅ implemented
Phase B  Embeddings + semantic search + LLM relevance scoring    ✅ implemented
Phase C  RAG pipeline + analytical reports + projects            ✅ implemented (hardening ongoing)
Phase D  MCP tools + research gap analysis                       ✅ implemented (hardening ongoing)
Phase E  Web pages + mobile screens + push notifications         ⏳ in progress (web far ahead of mobile)
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

1. **PostgreSQL-only runtime.** Server, API routes, and workers use Prisma/PostgreSQL. Do not introduce Mongoose or MongoDB runtime imports.

2. **pgvector stays in Docker locally.** Developers do not need a Windows pgvector installation. Local Compose exposes PostgreSQL on port `5433`.

3. **Redis supports local Compose or hosted TLS.** Keep credentials in `.env`; BullMQ and application cache share the same protocol.

4. **Use Prisma migrations.** Schema changes require a checked-in migration. Never patch production tables ad hoc.

5. **`.env` is `.gitignore`d, never committed.** Rotate any secret that appears in chat, logs, screenshots, or version control.

6. **Use deterministic, parameterized persistence.** Prefer Prisma queries and transactions; only use Prisma tagged SQL for pgvector or database capabilities Prisma cannot express.

7. **Runtime audit must stay green.** `pnpm --filter backend runtime:audit:postgres` rejects server/worker import paths that reach Mongoose or legacy model files.

8. **Worker is a separate Node process.** `pnpm worker:sync` runs `tsx src/workers/sync.worker.ts` in its own process. Dev terminal A: backend. Terminal B: worker. They share the Redis queue, nothing else.

9. **Cache every LLM call.** The free tier has rate limits. The cache key must include `prompt_version` so a prompt change invalidates old entries.

10. **Raw provider metadata can be large.** Monitor PostgreSQL storage and document an archive policy before corpus-scale ingestion.

11. **Mobile is Android-only for testing.** Team has no Macs and no iOS devices. Code stays cross-platform Expo (so iOS support comes free later), but every PR is tested on Android Studio emulator or Expo Go Android. Design mockups frame on **Pixel 6 (412×892dp)** — not iPhone. Touch target minimum is Material 3's 48dp, not iOS's 44pt. Forms use `KeyboardAvoidingView behavior="height"` (Android), not the iOS-style `"padding"`. See [docs/DESIGN_LANGUAGE.md §11](docs/DESIGN_LANGUAGE.md) for the full Android-specific gotcha list.

12. **Do not change `nodeLinker`.** Both `.npmrc` and `pnpm-workspace.yaml` set `hoisted`, because Metro (Expo) cannot follow pnpm's isolated symlinks. Switching to `isolated` breaks the mobile bundler with "Unable to resolve X" errors.

---

## 12. Where Else To Look

| Document | What's in it |
|---|---|
| [README.md](README.md) | First-time setup commands |
| [apps/backend/README.md](apps/backend/README.md) | Backend module layout + conventions |
| [apps/web/README.md](apps/web/README.md) | Web feature-based layout |
| [apps/mobile/README.md](apps/mobile/README.md) | Expo Router + NativeWind notes |
| [docs/PERSONAL_AI_CONNECTIONS.md](docs/PERSONAL_AI_CONNECTIONS.md) | Per-user AI provider connections (encrypted keys) |
| [docs/environment-variables.md](docs/environment-variables.md) | Inventory of every env variable |
| [docs/DEPLOY_WITH_DOCKER.md](docs/DEPLOY_WITH_DOCKER.md) | Docker deploy, troubleshooting, rate limits and scaling |
| [.herdr/README.md](.herdr/README.md) | Multi-agent (planner/builder) workflow and spec format |
| [docs/superpowers/specs/2026-05-25-phase-a-design.md](docs/superpowers/specs/2026-05-25-phase-a-design.md) | Full Phase A design (data flow, schemas, acceptance criteria) |

---

## 13. For Claude (or Any AI Working In This Repo)

### Workflow rules
- **DO NOT auto-commit.** Edit files and verify them. Suggest a commit message at the end. The user runs `git add` and `git commit` themselves at their own pace.
- **DO NOT run `git push`, `git reset`, or any destructive git command** unless the user explicitly asks.
- **DO ask before** scaffolding new packages, installing global tools, or making changes outside `apps/`, `packages/`, or `docs/`.

### Code rules
- **Read the relevant design spec first** (Phase A spec for sync/data flow; other specs under `docs/superpowers/specs/`) before suggesting changes to data flow, model schemas, or sync logic.
- **Stay within the conventions in §6.** They are not preferences — they are constraints we agreed on.
- **Long-running work goes in BullMQ workers, not request handlers.** No exceptions.
- **Validate every new env var with Zod in `config/env.ts`.** Don't read `process.env.X` directly outside that file.
- **When changing persistence:** update the Prisma schema, create a migration, preserve foreign keys/indexes, and use transactions for multi-row writes.
- **When adding a new API endpoint:** controller is thin, service has logic, schema validates input, return the `{ success, data, meta }` envelope.
- **When asked to install a new dependency with a postinstall script**, update `pnpm-workspace.yaml`'s `allowBuilds` so the team doesn't trip the `ERR_PNPM_IGNORED_BUILDS` warning.
- **If something doesn't fit the structure**, surface it instead of working around it. The structure is more easily fixed than abandoned.
