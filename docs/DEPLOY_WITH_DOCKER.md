# Docker Compose runtime

Run commands from `lumi-gap/`. Docker Desktop must run Linux containers.
The stack includes PostgreSQL 16/pgvector, Redis, API, nginx web, AI Reviewer,
and seven workers. Docker serves production web bundles and `node dist`.
Production keeps its Jenkins credential contract; see [production](../README_PRODUCTION.md).

## Configure and start

```bash
cp .env.example .env
# Fill GEMINI_API_KEY; change example passwords before sharing a demo.
docker compose config -q
docker compose up -d --build
```

PowerShell uses `Copy-Item .env.example .env`. No extra env-file option is needed.
Node/pnpm are optional for Docker. If installed, `pnpm setup` generates four
random secrets and native JWT keys; it preserves existing `.env` and keys.
Docker creates its own RS256 key pair in a persistent named volume.

`migrate` waits for PostgreSQL and applies all committed Prisma migrations.
API/workers wait for successful migration, JWT initialization, and healthy Redis.
Web waits for a healthy API; failed initializers block dependent services.

Open **http://localhost:8080**. Health: **http://localhost:4000/health**;
readiness: **http://localhost:4000/ready**; docs: **http://localhost:4000/api-docs**.
Host ports are `WEB_PORT`, `API_PORT`, `POSTGRES_HOST_PORT`, `REDIS_HOST_PORT`.
Keep `VITE_API_BASE=/api/v1` so nginx and Vite proxy API calls.
Only `VITE_*` enters the web bundle; never prefix a secret with `VITE_`.

## Demo seed and optional services

```bash
docker compose --profile seed up seed
```

Sign in with `admin@liemresearch.com` / `Admin123456!`. Seed runs in development
mode because fixtures reject production. Use it only for local/demo data;
repeated seed upserts fixtures and may reset demo passwords and fixture values.

Default workers: report, gaps, embedding, paper analysis, notifications,
corpus validation, community summary. Begin with roughly 8 GB Docker memory,
then adjust to measured workload. Stop workers on a smaller machine:

```bash
docker compose stop worker-report worker-gaps worker-embedding worker-paper-analysis worker-notifications worker-corpus-validation worker-community-summary
```

They start again on the next full `up`. Optional profiles:

```bash
# Set TRANSLATION_PROVIDER=libretranslate in root .env first.
docker compose --profile translation up -d --build
# Set OPENALEX_API_KEY before requesting new provider data.
docker compose --profile ingest up -d --build
```

Ingest does not start a campaign automatically; an admin starts it through the
application. LibreTranslate may take longer on first startup to load models.

## Native apps with the same .env

Stop the full Docker stack first to avoid duplicate API/workers, then:

```bash
pnpm install
pnpm setup
# Fill GEMINI_API_KEY in root .env.
pnpm docker:infra
pnpm --filter backend db:migrate:deploy
pnpm --filter backend db:seed
pnpm dev:backend   # terminal A, localhost:4000
pnpm dev:web       # terminal B, localhost:3000
```

Run `pnpm --filter backend dev:workers` in another terminal if needed.
AI review also needs `docker compose up -d --build ai-reviewer`.
Relative JWT paths are anchored to `apps/backend` regardless of shell cwd.

## Stop, reset, and transfer existing settings

```bash
pnpm docker:logs
pnpm docker:down    # preserves named volumes
pnpm docker:reset   # deletes DB, Redis, uploads, reviewer data, Docker JWT keys
```

Back up needed data before resetting. Native keys under `apps/backend/.keys`
survive Docker reset. Existing installations should transfer Gemini, OAuth,
storage and email credentials into root `.env` after `pnpm setup`. Reuse the
Postgres password for existing volumes: changing its initialization variable
does not change an existing database role. Redis applies its password on startup;
recreate Redis and clients together when rotating it. Local Compose passwords
must be alphanumeric, avoiding separate URL-encoded password variables.
Remove obsolete local environment files once the new configuration is verified.

The independent AI Reviewer repository retains its own standalone configuration;
the root Compose stack injects root `.env`.

## Verify a fresh installation

Use a disposable checkout/project so reset cannot delete developer data:

```bash
docker compose config -q
docker compose up -d --build
docker compose ps -a
docker compose exec postgres psql -U lumi_gap -d lumi_gap -c '\dt'
curl http://localhost:4000/health
curl http://localhost:8080/api/v1/auth/me  # expected 401 without a token
docker compose --profile seed up seed
```

Sign in at the web URL with the seeded admin to verify nginx and authentication.
Then verify native apps as above and run `pnpm typecheck`, `pnpm test`,
`pnpm --filter web build`, and `pnpm test:e2e`.
Integration/browser tests need PostgreSQL/Redis and seeded apps; AI calls need
valid provider credentials. Health checks do not verify an external AI provider.
