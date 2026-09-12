# LiemResearch — Publication Trend System

> **AI-assisted Scientific Publication Trend Analysis** — multi-source academic metadata aggregation + vector semantic search + LLM-grounded analytical reports + MCP tool calling, to help researchers discover trends, evaluate papers, and identify research gaps.
>
> WDP301 capstone @ FPT University.

This repository is a **pnpm + Turborepo mono-repo** containing three runnable apps and one shared package.

## Production deployment

| Service | Address |
|---|---|
| PaperLens web application | [https://paperlens.uk](https://paperlens.uk) |
| PaperLens API | [https://api.paperlens.uk](https://api.paperlens.uk) |

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
- the teacher-managed MongoDB server, with MongoDB Search/mongot for vector
  retrieval.

Redis uses authenticated connections, AOF persistence, a Docker volume, and an
internal Docker network. Port `6379` is not published publicly. Production does
not depend on Upstash quotas or an external Redis API key.

> Local development and production are intentionally different. Local
> `docker compose` can start MongoDB and Redis for development; production uses
> the managed server configuration described above.

For environment preparation, Jenkins configuration, deployment, worker
verification, rollback, and secret-handling rules, follow the version-controlled
**[PaperLens Production Deployment Runbook](README_PRODUCTION.md)**.

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
│   ├── backend/              Node.js 20+ · Express 5 · TypeScript · Mongoose · BullMQ · Gemini
│   ├── web/                  React 18 · Vite · Tailwind · shadcn/ui · TanStack Query · React Router
│   └── mobile/               Expo SDK 52 · React Native · Expo Router · NativeWind · TanStack Query
├── packages/
│   └── shared-types/         framework-agnostic TypeScript types shared by all three apps
├── legacy/                   original LiemResearch code (port reference — see docs/MIGRATION_MAP.md)
│   ├── backend-js/           JS backend: ratings, points, notifications, S3 PDF upload
│   └── web-figma/            Figma-exported React UI: 17 pages + rank badge assets
├── docker-compose.yml        local MongoDB + Redis (+ optional mongo-express UI)
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

> You do not need access to the production MongoDB server during local
> development. `docker compose` starts local MongoDB and Redis. Vector search is
> available only when the selected MongoDB environment has MongoDB Search/mongot
> and the required vector index configured.

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
#   JWT_ACCESS_SECRET=...     (run the one-liner the .env.example shows)
#   JWT_REFRESH_SECRET=...    (different value from the access secret)

# 3. start MongoDB + Redis
pnpm docker:up                # mongo:27017, redis:6379, mongo-express:8081

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

pnpm docker:up                # start mongo + redis (detached)
pnpm docker:down              # stop them
pnpm docker:logs              # tail their logs
```

---

## What goes where (rules to keep the repo sane)

- **Shared TypeScript types live in `packages/shared-types`.** If both web and backend need an interface (e.g. `Paper`, `Report`, `AuthTokens`), put it there. No framework imports allowed inside that package.
- **Backend modules are self-contained.** A module under `apps/backend/src/modules/<name>/` owns its own routes, controller, service, schema, and Mongoose model. Cross-module calls go through the service layer, never directly into another module's model.
- **Long-running work goes through BullMQ.** API sync, embedding generation, and report generation MUST be enqueued — never run inside an HTTP handler. See `apps/backend/src/queue/queue.ts`.
- **LLM calls are cached.** Every LLM response is keyed by `hash(query + filters + model + prompt_version + retrieved_paper_ids)` and stored in Redis. We never call the LLM during normal search — only when the user explicitly requests AI analysis.
- **Embeddings go through `getEmbeddingProvider()`.** Don't import `GeminiEmbeddingProvider` directly outside the factory — that's how we swap to self-hosted `@xenova/transformers` later.
- **Auth is JWT with rotated refresh tokens.** Refresh tokens are stored hashed in Mongo with a TTL index. Web persists tokens to localStorage; mobile persists to expo-secure-store (keychain/keystore).

---

## Tech decisions (and why)

| Decision | Why |
|---|---|
| Mono-repo with pnpm + Turborepo | Share `@trend/shared-types` between 3 apps without copy-paste. Vercel-friendly. |
| Express 5 over Fastify | Team familiarity; Express 5 has built-in async error handling. |
| MongoDB + MongoDB Vector Search | Single store for metadata + embeddings; production uses the teacher-managed MongoDB server with MongoDB Search/mongot. |
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
