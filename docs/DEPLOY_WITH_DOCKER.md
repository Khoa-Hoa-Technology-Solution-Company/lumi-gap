# Docker Compose runtime

Run commands from `lumi-gap/`. Docker Desktop must run Linux containers.
The stack includes PostgreSQL 16/pgvector, Redis, API, nginx web, AI Reviewer,
and eight workers. Docker serves production web bundles and `node dist`.
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

Default workers: topic sync, report, gaps, embedding, paper analysis, notifications,
corpus validation, community summary. Begin with roughly 8 GB Docker memory,
then adjust to measured workload. Stop workers on a smaller machine:

```bash
docker compose stop worker-sync worker-report worker-gaps worker-embedding worker-paper-analysis worker-notifications worker-corpus-validation worker-community-summary
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

## AI evaluation and paper indexing failures

- Keep `GEMINI_MODEL_FAST` and `GEMINI_MODEL_DEEP` set to models that can actually
  generate content with your project's key. A model listed by the provider can
  still return 404 for generation. The local default is `gemini-3.1-flash-lite`.
- `LLM_QUOTA_EXHAUSTED` means the provider reports a daily/monthly limit or zero
  available quota. Wait for the quota to reset, or update `GEMINI_API_KEY` in the
  root `.env` with a key from a project that has available quota. Keys belonging
  to the same Google project share its quota. Paper indexing stops without
  repeating the exhausted request. Per-minute limits use the provider's retry
  delay; temporary overload is retried a bounded number of times.
- After editing `.env`, recreate the API and workers with
  `docker compose up -d --no-build --pull never` when local images are already
  built. Reload nginx with `docker compose exec -T web nginx -s reload` after the
  backend is healthy, so it resolves the recreated backend container.
- Check `docker compose logs --tail 100 backend worker-paper-analysis` for the
  failing operation. An Index request returning 202 only means it was queued;
  successful indexing must reach `ready` with stored passages and embeddings.
- When the remote PDF cannot be read, indexing may use the abstract. The paper
  evidence panel reports **Abstract only** and source warnings; this does not
  provide full manuscript coverage.

## Rate limits and horizontal scaling

Every rate limiter in the backend is created through `createRateLimiter()`
(`apps/backend/src/common/middleware/rate-limit.ts`). By default the counters
live in the **memory** of each process, so with N backend instances behind a load
balancer the effective ceiling is roughly N times the configured value
(`SEMANTIC_SEARCH_MAX_PER_MINUTE`, `COMMUNITY_SUGGEST_MAX_PER_MINUTE`, ...).
These limiters exist mainly to protect the shared Gemini quota, so the multiplier
matters.

When you run more than one backend instance, set `RATE_LIMIT_STORE=redis` in the
root `.env`. Counters are then kept in the stack's Redis under `rl:<limiter>:*`
keys and shared by all instances. If Redis fails, requests are let through
(`passOnStoreError`) instead of returning a 500, so the limit is only
best-effort during an outage.

Leave it at the default (`memory`) for a single instance, and **do not enable it
on the hosted Upstash free tier**: that plan allows about 10K commands per day
and every rate-limited request costs one or two Redis commands, which would use
up the quota that BullMQ and the LLM cache also depend on. Use a local or paid
Redis when you turn it on.

`app.ts` sets `trust proxy` to 1, so limiters that key on `req.ip` see the real
client address when the backend runs behind a single reverse proxy.
