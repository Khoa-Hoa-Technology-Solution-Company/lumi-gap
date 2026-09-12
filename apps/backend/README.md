# Backend — Publication Trend System

Node.js + Express 5 + TypeScript + MongoDB + BullMQ + Gemini.

## Quick start

```bash
# from repo root
pnpm install
cp apps/backend/.env.example apps/backend/.env
# fill in GEMINI_API_KEY and rotate the JWT secrets
pnpm docker:up                # starts Mongo + Redis locally
pnpm dev:backend              # http://localhost:4000
```

Health check: `GET http://localhost:4000/health`.

## Layout (feature-modular)

```
src/
├── server.ts                       entry — connect deps then listen
├── app.ts                          Express composition (middleware order matters)
├── config/
│   └── env.ts                      Zod-validated process.env
├── common/                         cross-cutting concerns
│   ├── exceptions/
│   │   └── app-error.ts            AppError class + factory methods
│   └── middleware/
│       ├── auth.ts                 requireAuth, requireRole (JWT)
│       ├── validate.ts             Zod request validation
│       └── error-handler.ts        global error + 404 handlers
├── infrastructure/                 external system clients
│   ├── db.ts                       Mongoose connect/disconnect
│   ├── redis.ts                    ioredis client + lifecycle
│   ├── cache.ts                    JSON cache wrapper + hashKey()
│   ├── logger.ts                   Pino logger (pretty in dev)
│   └── queue.ts                    BullMQ queues (apiSync, embedding, report)
├── modules/                        feature modules — each self-contained
│   ├── auth/
│   │   ├── dto/auth.schema.ts      Zod schemas (RegisterSchema, LoginSchema)
│   │   ├── models/user.model.ts    Mongoose User + RefreshToken models
│   │   ├── auth.controller.ts      thin HTTP handlers
│   │   ├── auth.service.ts         business logic (hashing, JWT issuance)
│   │   └── auth.routes.ts          route table → controller
│   ├── papers/
│   │   ├── models/paper.model.ts   Paper schema + indexes (text + compound)
│   │   └── paper.routes.ts         keyword search + detail endpoints
│   ├── embeddings/
│   │   ├── embedding.provider.ts   provider interface
│   │   ├── gemini-embedding.provider.ts
│   │   └── embedding.factory.ts    singleton selector (Gemini → local later)
│   └── llm/
│       └── gemini.client.ts        generateText / generateJSON wrappers
├── workers/                        standalone worker processes (separate pnpm scripts)
└── routes/
    └── index.ts                    mounts module routers under /api/v1
```

## Conventions

- **Response envelope:** every response uses `{ success: true, data, meta? }` or `{ success: false, error }`.
- **Thin controllers:** controllers only orchestrate HTTP I/O — business logic lives in `*.service.ts`.
- **Throw `AppError.*`** from services for structured HTTP errors; the global handler formats them.
- **Use `validate(schema, "body" | "query" | "params")`** instead of inline Zod parsing.
- **No long-running work in request handlers** — API sync, embedding generation, and report generation MUST go through a BullMQ queue.
- **Embeddings via `getEmbeddingProvider()`** — don't import the concrete class directly outside the factory. That's how we swap to a local provider later.

## Add a new module (recipe)

1. `src/modules/<name>/`
2. `models/<name>.model.ts` — Mongoose schema
3. `dto/<name>.schema.ts` — Zod input schemas (if it takes input)
4. `<name>.service.ts` — business logic
5. `<name>.controller.ts` — thin HTTP handlers
6. `<name>.routes.ts` — Express Router
7. Mount in `routes/index.ts`

## Env vars

See [.env.example](.env.example) — `config/env.ts` will refuse to boot if anything required is missing.

## PDF storage

Development uses local disk by default:

```bash
STORAGE_PROVIDER=local
```

Production can store uploaded PDFs in Cloudflare R2:

```bash
STORAGE_PROVIDER=r2
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=...
R2_SIGNED_URL_TTL_SECONDS=300
```

The backend keeps the paper `pdfPath` as a storage URI. Local uploads stay as `/uploads/<file>.pdf`; R2 uploads become `r2://<bucket>/papers/<object>.pdf`. Download endpoints keep the same API contract: local files are served by the backend, while R2 files return a short-lived signed URL after auth and credit checks pass.
