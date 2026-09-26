# LiemResearch — Publication Trend System

> **AI-assisted Scientific Publication Trend Analysis** — multi-source academic metadata aggregation + vector semantic search + LLM-grounded analytical reports + MCP tool calling, to help researchers discover trends, evaluate papers, and identify research gaps.
>
> WDP301 capstone @ FPT University.

This repository is a **pnpm + Turborepo mono-repo** containing three runnable apps and one shared package.

## Production deployment

| Service | Address |
|---|---|
| LumiGap web application | [https://paperlens.uk](https://paperlens.uk) |
| LumiGap API | [https://api.paperlens.uk](https://api.paperlens.uk) |

Production is deployed from `main` by Jenkins using the repository's
[`Jenkinsfile`](Jenkinsfile). Nginx Proxy Manager terminates TLS and routes the
public domains to Docker containers over the private `nginx-network`.

The production stack contains:

- the React web application and Express backend;
- six BullMQ worker processes for reports, research gaps, notifications,
  embeddings, paper analysis, and corpus validation;
- a private self-hosted Redis container for queues, cache, locks, and worker
  heartbeats;
- LibreTranslate for on-demand paper translation;
- PostgreSQL 16 with pgvector as the only application database.

Redis uses authenticated connections, AOF persistence, a Docker volume, and an
internal Docker network. Port `6379` is not published publicly. Production does
not depend on Upstash quotas or an external Redis API key.

> Local development and production use the same PostgreSQL/Prisma persistence
> model. Docker Compose starts PostgreSQL with pgvector and Redis.

For environment preparation, Jenkins configuration, deployment, worker
verification, rollback, and secret-handling rules, follow the version-controlled
**[LumiGap Production Deployment Runbook](README_PRODUCTION.md)**.

---

## Project lineage

This repo is a fork of [thiennhat-ctrl/LiemResearch](https://github.com/thiennhat-ctrl/LiemResearch) (a Research Paper Management System), merged with the team's production engine from `publication-trend-system`. Both git histories are preserved.

| Came from | What |
|---|---|
| **publication-trend-system** (60 commits) | The entire monorepo: TypeScript backend (OpenAlex sync pipeline, Gemini embeddings, semantic search, BullMQ workers), web (shadcn/ui + TanStack Query), mobile (Expo), shared types |
| **LiemResearch** (original) | Community features to be ported: ratings, points/credits, notifications, PDF requests, rank badges, 17 UI pages — preserved under [`legacy/`](legacy/) |

`legacy/` is **reference material only** (it is not part of the pnpm workspace and is never built). Each feature gets ported into the monorepo following [docs/MIGRATION_MAP.md](docs/MIGRATION_MAP.md); once everything is ported, `legacy/` will be deleted.

---

## Repo layout

```
.
├── apps/
│   ├── backend/              Node.js 20+ · Express 5 · TypeScript · Prisma · BullMQ · Gemini
│   ├── web/                  React 18 · Vite · Tailwind · shadcn/ui · TanStack Query · React Router
│   └── mobile/               Expo SDK 52 · React Native · Expo Router · NativeWind · TanStack Query
├── packages/
│   └── shared-types/         framework-agnostic TypeScript types shared by all three apps
├── legacy/                   original LiemResearch code (port reference — see docs/MIGRATION_MAP.md)
│   ├── backend-js/           JS backend: ratings, points, notifications, S3 PDF upload
│   └── web-figma/            Figma-exported React UI: 17 pages + rank badge assets
├── docker-compose.yml        PostgreSQL/pgvector + Redis + application services
├── pnpm-workspace.yaml
├── turbo.json
└── tsconfig.base.json
```

---

## Prerequisites

| Tool | Version | How to get it |
|---|---|---|
| Node.js | **>= 20** (22 recommended) | https://nodejs.org |
| pnpm | **>= 11** | `npm install -g pnpm` |
| Docker Desktop | latest | https://docker.com/products/docker-desktop |
| Git | any | https://git-scm.com |
| **Gemini API key** | free tier OK | https://aistudio.google.com/apikey |
| Android Studio | only for mobile Android emulator | https://developer.android.com/studio |
| Xcode | only for mobile iOS simulator (Mac only) | App Store |

> PostgreSQL with pgvector is the only supported runtime database. MongoDB is
> not required for the backend, API, or workers.

---

## First-time setup

```bash
# 1. install all workspace deps (one command for backend + web + mobile + shared-types)
pnpm install

# 2. copy env templates and fill them in
cp apps/backend/.env.example apps/backend/.env
cp apps/web/.env.example     apps/web/.env
cp apps/mobile/.env.example  apps/mobile/.env

# In apps/backend/.env, set at minimum:
#   GEMINI_API_KEY=...        (from Google AI Studio)
#   DATABASE_URL=postgresql://...
#   REDIS_URL=redis://...
# Then generate the ignored RS256 key pair:
pnpm --filter backend auth:keys:generate

# 3. start PostgreSQL/pgvector + Redis
pnpm docker:up                # postgres:5433, redis:6379

# 4. start everything (backend + web; mobile starts separately because it opens a UI)
pnpm dev:backend              # http://localhost:4000  → GET /health
pnpm dev:web                  # http://localhost:5173
pnpm dev:mobile               # opens Expo dev tools, scan QR with Expo Go
```

To stop the databases when you're done: `pnpm docker:down`.

---

## Common commands

```bash
pnpm dev                      # turbo: run all apps' dev scripts in parallel
pnpm dev:backend              # backend only
pnpm dev:web                  # web only
pnpm dev:mobile               # mobile only (Expo)

pnpm build                    # build all
pnpm typecheck                # tsc --noEmit across the whole repo
pnpm lint                     # lint everything

pnpm docker:up                # start PostgreSQL/pgvector + Redis (detached)
pnpm docker:down              # stop them
pnpm docker:logs              # tail their logs
```

---

## What goes where (rules to keep the repo sane)

- **Shared TypeScript types live in `packages/shared-types`.** If both web and backend need an interface (e.g. `Paper`, `Report`, `AuthTokens`), put it there. No framework imports allowed inside that package.
- **Backend modules are self-contained.** A module under `apps/backend/src/modules/<name>/` owns its routes, controller, service, and validation schema. PostgreSQL access goes through the generated Prisma client.
- **Long-running work goes through BullMQ.** API sync, embedding generation, and report generation MUST be enqueued — never run inside an HTTP handler. See `apps/backend/src/queue/queue.ts`.
- **LLM calls are cached.** Every LLM response is keyed by `hash(query + filters + model + prompt_version + retrieved_paper_ids)` and stored in Redis. We never call the LLM during normal search — only when the user explicitly requests AI analysis.
- **Embeddings go through `getEmbeddingProvider()`.** Don't import `GeminiEmbeddingProvider` directly outside the factory — that's how we swap to self-hosted `@xenova/transformers` later.
- **Auth uses short-lived RS256 JWT access tokens and rotated opaque refresh tokens.** Only SHA-256 refresh-token hashes are stored in PostgreSQL; reuse detection revokes the token family.

---

## Tech decisions (and why)

| Decision | Why |
|---|---|
| Mono-repo with pnpm + Turborepo | Share `@trend/shared-types` between 3 apps without copy-paste. Vercel-friendly. |
| Express 5 over Fastify | Team familiarity; Express 5 has built-in async error handling. |
| PostgreSQL + pgvector + Prisma | Relational integrity, transactional security workflows, migrations, and vector retrieval in one supported runtime store. |
| Gemini (LLM + embeddings) | One SDK, one API key, generous free tier, cheap production tier. |
| BullMQ + Redis | Industry standard for Node job queues; survives restarts. |
| Expo over bare React Native | OTA updates, EAS Build, no native toolchain pain for the common case. |
| NativeWind | Reuse Tailwind muscle memory across web + mobile. |

---

## Phase roadmap (high level)

1. **Phase 1 — Core** · auth · paper CRUD · OpenAlex sync · keyword search · trend dashboard
2. **Phase 2 — AI basics** · embeddings (Gemini) · semantic search · LLM summary · relevance scoring
3. **Phase 3 — RAG + Reports** · retrieve-augment-generate pipeline · markdown analytical reports
4. **Phase 4 — MCP + Gaps** · define MCP tools · LLM calls tools · research gap analysis
5. **Phase 5 — Polish** · mobile push notifications · DOI scanner · admin dashboard

See individual app READMEs for module-level layout.

---

## License

UNLICENSED — academic project (FPT University WDP301).
