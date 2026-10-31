# API integration guide

How web (React) and mobile (Flutter) clients talk to the LumiGap backend. This file only describes behaviour that is
implemented; for the complete endpoint list use the generated OpenAPI documentation instead of this file.

- Interactive docs: `http://localhost:4000/api-docs` (Swagger UI). Machine-readable schema: `http://localhost:4000/openapi.json`.
- Router mounting: `apps/backend/src/routes/index.ts` (everything is under `/api/v1`).
- Health: `GET /health`; dependency readiness (PostgreSQL, Redis): `GET /ready`. Both are outside `/api/v1`.

## 1. Base URL

| Client | Setting | Value |
|---|---|---|
| Web | `VITE_API_BASE` in the root `.env` (`.env.example` sets `/api/v1`) | Relative `/api/v1`, proxied by Vite (dev) or nginx (Docker). If unset, `apps/web/src/services/api-client.ts` falls back to `/api/v1`. |
| Mobile (Flutter) | `API_BASE_URL` in the root `.env`, passed by `pnpm dev:flutter_mobile` | `http://10.0.2.2:4000/api/v1` for the Android emulator; use the machine's LAN IP on a real device. |

On an Android emulator `localhost` is the emulator itself, hence `10.0.2.2`. Start the backend with `pnpm dev:backend`
(native) or `pnpm docker:up` (Docker); the API listens on `API_PORT` (default 4000).

## 2. Response envelope

```json
{ "success": true, "data": "<T>", "meta": { "page": 1, "pageSize": 20, "total": 200, "totalPages": 10 } }
{ "success": false, "error": { "code": "NOT_FOUND", "message": "...", "details": {} } }
```

`meta` appears on paginated endpoints only; `details` is optional. Error codes produced by `AppError`
(`apps/backend/src/common/exceptions/app-error.ts`): `BAD_REQUEST` 400, `UNAUTHORIZED` 401, `FORBIDDEN` 403,
`NOT_FOUND` 404, `CONFLICT` 409, `TOO_MANY_REQUESTS` 429, `INTERNAL` 500, `SERVICE_UNAVAILABLE` 503. Request validation
failures are also reported through the error handler (`common/middleware/error-handler.ts`).

## 3. Authentication

Access tokens are RS256 JWTs (default TTL `JWT_ACCESS_TTL=15m`); refresh tokens last `JWT_REFRESH_TTL=7d` and are rotated
on each refresh. Send `Authorization: Bearer <accessToken>`.

The web client (`apps/web/src/services/api-client.ts`) attaches the bearer token automatically, and on a 401 on a
protected request it calls `/auth/refresh` once and retries; if that fails it clears the auth store.

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/register` | Body `{ email, password, fullName, invitationToken? }` (strict: no other fields). Password: 10-128 chars with a lowercase letter, an uppercase letter and a digit. Returns 201. |
| POST | `/auth/login` | Body `{ email, password }` |
| POST | `/auth/refresh` | Body `{ refreshToken }` |
| POST | `/auth/logout` | Body `{ refreshToken }` |
| GET | `/auth/me` | Requires bearer token; returns `{ user }` |
| POST | `/auth/email/verify`, `/auth/email/resend` | Email verification |
| POST | `/auth/password/forgot`, `/auth/password/reset` | Password recovery |
| POST | `/auth/oauth/exchange` | Google OAuth code exchange |

Credential, token and recovery endpoints are rate limited (`auth:credentialLimiter`, `auth:tokenLimiter`,
`auth:recoveryLimiter` in `auth.routes.ts`). Admin accounts cannot be self-registered; the demo seed
(`pnpm --filter backend db:seed`) creates one (see `DEPLOY_WITH_DOCKER.md`).

## 4. Papers

`GET /papers` (optional auth) lists and searches papers. Query parameters are defined by `PaperListQuerySchema`
(`apps/backend/src/modules/papers/dto/paper.schema.ts`): `q`, `page` (default 1), `pageSize` (default 20, max 50), plus the
shared filters in `paper-filters.schema.ts` (also used by `GET /search`). `GET /papers/:id` returns one paper; 404 if absent.
Other paper routes (upload, PDF review, compare, translation, knowledge indexing, references) are listed in
`paper.routes.ts` and in `/api-docs`.

The response type is `Paper` from `@trend/shared-types` (`packages/shared-types/src/paper.ts`); do not copy it into an app.
Web hooks live in `apps/web/src/features/papers/hooks/use-papers.ts`.

## 5. Admin sync (OpenAlex)

All routes below require the `admin` role and are mounted at `/api/v1/admin` (`modules/api-sync/sync.routes.ts`).

- `POST /admin/sync` queues one sync job and returns immediately (the worker `worker:sync` does the work). Body
  (`TriggerSyncSchema`): `searchText` (required), `yearFrom` (1900-2100, default 2022), `maxPages` (1-50, default 1).
- `GET /admin/sync/runs` lists recent sync runs.
- `/admin/openalex-ingest/...` (preflight, campaign plan/list/get/start/pause/cancel, corpus validation) controls bulk
  ingest; see `OPENALEX_MILLION_INGEST_RUNBOOK.md`.

`SYNC_ADMIN_BYPASS=true` removes the auth gate from these routes for demos; the backend logs a warning. Never enable it on
a shared or production server.

## 6. Checklist

- Backend is up: `GET /health` returns `success: true`.
- Check `success` before reading `data`; show `error.message` to the user.
- Use the shared `api` client (web) instead of a fresh axios instance so token refresh works.
- Types come from `@trend/shared-types`.
