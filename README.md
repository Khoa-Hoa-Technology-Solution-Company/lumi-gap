# LumiGap — Publication Trend System

> **AI-assisted Scientific Publication Trend Analysis** — multi-source academic metadata aggregation + vector semantic search + LLM-grounded analytical reports + MCP tool calling, to help researchers discover trends, evaluate papers, and identify research gaps.
>
> WDP301 capstone @ FPT University.

This repository is a **pnpm + Turborepo mono-repo** containing the backend, web, two mobile clients, a Python AI reviewer service, and one shared package.

## Production deployment

| Service | Address |
|---|---|
| LumiGap web application | [https://lumigap.uk](https://lumigap.uk) |
| LumiGap API | [https://api.lumigap.uk](https://api.lumigap.uk) |

Production is deployed from `main` by Jenkins using the repository's
[`Jenkinsfile`](Jenkinsfile). Nginx Proxy Manager terminates TLS and routes the
public domains to Docker containers over the private `nginx-network`.

The production stack contains:

- the React web application, Express backend, and the internal Python (FastAPI) AI Reviewer service;
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
| **publication-trend-system** (60 commits) | The entire monorepo: TypeScript backend (OpenAlex sync pipeline, Gemini embeddings, semantic search, BullMQ workers), web (shadcn/ui + TanStack Query), mobile (Expo), Flutter mobile, AI reviewer, shared types |
| **LumiGap** (original) | Community features to be ported: ratings, points/credits, notifications, PDF requests, rank badges, 17 UI pages — preserved under [`legacy/`](legacy/) |

`legacy/` is **reference material only** (it is not part of the pnpm workspace and is never built). Each feature gets ported into the monorepo following [docs/MIGRATION_MAP.md](docs/MIGRATION_MAP.md); once everything is ported, `legacy/` will be deleted.

---

## Repo layout

```
.
├── apps/
│   ├── backend/              Node.js 20+ · Express 5 · TypeScript · Prisma · BullMQ · Gemini
│   ├── web/                  React 18 · Vite · Tailwind · shadcn/ui · TanStack Query · React Router
│   ├── mobile/               Expo SDK 52 · React Native · Expo Router · NativeWind · TanStack Query
│   ├── flutter_mobile/       Flutter mobile client (not part of the pnpm workspace)
│   └── ai-reviewer/          Python FastAPI internal service for paper review/analysis
├── packages/
│   └── shared-types/         framework-agnostic TypeScript types shared by the TypeScript apps
├── legacy/                   original LumiGap code (port reference — see docs/MIGRATION_MAP.md)
│   ├── backend-js/           JS backend: ratings, points, notifications, S3 PDF upload
│   └── web-figma/            Figma-exported React UI: 17 pages + rank badge assets
├── deploy/                   deployment assets
├── docs/                     project documentation
├── tests/                    Playwright e2e tests (playwright.config.ts)
├── Dockerfile.backend / Dockerfile.web / Dockerfile.e2e
├── docker-compose.yml        PostgreSQL/pgvector + Redis + backend + web + ai-reviewer (+ default workers and seed/translation/ingest profiles)
├── .env.example              single local environment template
├── Jenkinsfile               production CI/CD pipeline
├── pnpm-workspace.yaml
├── turbo.json
└── tsconfig.base.json
```

---

## Prerequisites

| Tool | Version | How to get it |
|---|---|---|
| Node.js | **>= 20** (22 recommended) | https://nodejs.org |
| pnpm | **>= 11** (repo pins `pnpm@11.3.0`) | `npm install -g pnpm` |
| Docker Desktop | latest | https://docker.com/products/docker-desktop |
| Git | any | https://git-scm.com |
| **Gemini API key** | free tier OK | https://aistudio.google.com/apikey |
| Flutter SDK | only for `apps/flutter_mobile` | https://flutter.dev |
| Android Studio | only for mobile Android emulator | https://developer.android.com/studio |
| Xcode | only for mobile iOS simulator (Mac only) | App Store |

> PostgreSQL with pgvector is the only supported runtime database. MongoDB is
> not required for the backend, API, or workers.

---

## First-time setup

Run commands from `lumi-gap/` (the directory containing `docker-compose.yml`).

### Full Docker stack

Docker Desktop must be running with Linux containers. Node/pnpm are optional for this route.

```bash
cp .env.example .env
# Set GEMINI_API_KEY in .env; change the example passwords before sharing a demo.
docker compose up -d --build
```

PowerShell: use `Copy-Item .env.example .env`. Open **http://localhost:8080**;
API health is **http://localhost:4000/health**. PostgreSQL migrations and JWT
key generation run automatically before the API and workers start.

To create demo accounts (explicitly, once the stack is ready):

```bash
docker compose --profile seed up seed
```

Sign in with `admin@liemresearch.com` / `Admin123456!`. Seed data is for local demos only.

### Native development with the same .env

```bash
pnpm install
pnpm setup                    # preserves an existing .env; creates native JWT keys
# Set GEMINI_API_KEY in root .env.
pnpm docker:infra             # PostgreSQL :5433 and Redis :6379 only
pnpm --filter backend db:migrate:deploy
pnpm --filter backend db:seed
pnpm dev:backend              # terminal A, http://localhost:4000
pnpm dev:web                  # terminal B, http://localhost:3000
```

Use `pnpm --filter backend dev:workers` in another terminal for native workers.
To use AI review natively, also start `docker compose up -d --build ai-reviewer`.
Stop a full Docker stack with `pnpm docker:down` before switching to native apps,
so API/worker ports and queues are not shared accidentally.

Only root `.env` is edited locally. Backend and Prisma load it using an absolute
path and expand URL variables. Vite loads it with `envDir` and exposes only
`VITE_*`. Keep `VITE_API_BASE=/api/v1` so both Vite and nginx proxy API calls.
`API_PORT`, `WEB_PORT`, `POSTGRES_HOST_PORT`, and `REDIS_HOST_PORT` configure host ports.
Passwords must contain only letters and digits; `pnpm setup` generates random hex values.

`pnpm dev:mobile` loads root `EXPO_PUBLIC_*` for Expo. `pnpm dev:flutter_mobile`
reads root `API_BASE_URL` and passes only that public value via a temporary JSON `--dart-define-from-file`.
Android emulator URLs default to `http://10.0.2.2:4000/api/v1`; use your computer's LAN IP for a physical phone.

Eight workers start with the Docker stack, including OpenAlex topic sync. Allow roughly 8 GB RAM for the full
stack (a starting allocation; actual use depends on workload). For lighter native
work, start only `pnpm docker:infra` and the workers you need. Docker workers can
also be stopped with `docker compose stop worker-sync worker-report worker-gaps worker-embedding worker-paper-analysis worker-notifications worker-corpus-validation worker-community-summary`.

The demo seed does not populate a searchable research corpus. In the admin UI,
run a topic sync (for example, `large language model`), then run embedding for
semantic search. Search reads imported local papers; selecting OpenAlex filters
the local corpus and does not fetch new papers from the provider. Configure
`OPENALEX_API_KEY` and optionally `OPENALEX_MAILTO` in root `.env` before syncing.
The sync worker also registers the daily schedule configured by `SYNC_CRON`.

Optional services:

```bash
docker compose --profile translation up -d --build  # set TRANSLATION_PROVIDER=libretranslate
docker compose --profile ingest up -d --build       # requires OPENALEX_API_KEY
```

See [Docker setup and verification](docs/DEPLOY_WITH_DOCKER.md),
[environment inventory](docs/environment-variables.md), and
[production deployment](README_PRODUCTION.md).
The [validation report](docs/single-env-docker-validation.md) records Docker,
native, browser, and test results for the single environment migration.

### Existing installations

Run `pnpm setup`, then transfer your Gemini/OAuth/storage credentials from the old
app environment into root `.env`. Preserve the database and Redis passwords used
for existing volumes. If the old passwords contain special characters, use a
properly encoded URL for native development and rotate credentials deliberately
before using the new local Compose URL format.

Once verified, remove obsolete local app/Compose env files. Postgres initialization
credentials apply only when creating a fresh volume; changing the root password
does not update an existing database role. Redis applies `requirepass` when its
container starts, so recreate clients and Redis together when rotating its password.
`pnpm docker:reset` deletes **all local Compose data, uploads, and Docker JWT keys**;
back up anything you need first. Native keys under `apps/backend/.keys` are preserved.

---

## Common commands

```bash
pnpm dev                      # turbo: run all apps' dev and dev:workers scripts in parallel
pnpm dev:backend              # backend only
pnpm dev:web                  # web only
pnpm dev:mobile               # mobile only (Expo)
pnpm dev:flutter_mobile       # Flutter mobile (Android emulator API base)

pnpm build                    # build all
pnpm typecheck                # tsc --noEmit across the whole repo
pnpm lint                     # lint everything
pnpm test                     # unit tests (turbo)
pnpm test:e2e                 # Playwright e2e tests

pnpm docker:up                # full Docker stack, builds images
pnpm docker:down              # stop them
pnpm docker:infra             # only PostgreSQL + Redis
pnpm docker:logs              # tail their logs
pnpm docker:reset             # delete local Compose volumes/data

# backend workers (run from the repo root with --filter backend)
pnpm --filter backend dev:all             # API + all workers (runs dev:check first)
pnpm --filter backend dev:workers         # all workers only
pnpm --filter backend worker:<name>       # one of: report, gaps, notifications, embedding,
                                          #   paper-analysis, corpus-validation, community-summary,
                                          #   ai-jobs, sync, openalex-ingest
pnpm --filter backend workers:verify:heartbeats
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
