# Production Environment Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a safe production deployment runbook, a complete committed environment template, and a private production environment file that can be sent directly to the project supervisor.

**Architecture:** Git stores only documentation and placeholders. The real production values are copied mechanically from the existing private backend environment, updated with PaperLens public URLs, ignored by Git, and transferred privately. Jenkins remains the runtime secret store through `liemresearch-backend-env-b64`.

**Tech Stack:** Markdown, dotenv, Jenkins Pipeline, Docker, Google OAuth, PaperLens DNS/OpenResty.

## Global Constraints

- Never print or commit real MongoDB, Redis, Gemini, R2, Google OAuth, JWT, or provider secrets.
- Treat `apps/backend/src/config/env.ts` as the complete environment-variable source of truth.
- Use `https://paperlens.uk` for the web origin.
- Use `https://api.paperlens.uk/api/v1` for the API base.
- Use `https://api.paperlens.uk/api/v1/auth/google/callback` for Google OAuth.
- Keep the private production file ignored by Git.

---

### Task 1: Protect the private production environment

**Files:**
- Modify: `.gitignore`
- Create locally only: `apps/backend/.env.production`

**Interfaces:**
- Consumes: `apps/backend/.env`
- Produces: a private dotenv file suitable for direct secure transfer

- [ ] **Step 1: Add `.env.production` to Git ignore rules**

Add an explicit rule:

```gitignore
.env.production
```

- [ ] **Step 2: Create the private production file without printing secrets**

Copy `apps/backend/.env` to `apps/backend/.env.production`, then replace only
the public deployment values:

```env
NODE_ENV=production
PORT=4000
LOG_LEVEL=info
CORS_ORIGIN=https://paperlens.uk
GOOGLE_CALLBACK_URL=https://api.paperlens.uk/api/v1/auth/google/callback
TRANSLATION_PROVIDER=libretranslate
LIBRETRANSLATE_URL=http://libretranslate:5000
SYNC_ADMIN_BYPASS=false
```

- [ ] **Step 3: Verify the private file is ignored**

Run:

```bash
git check-ignore apps/backend/.env.production
git status --short
```

Expected: Git reports the production file as ignored and does not stage it.

### Task 2: Add the safe production template

**Files:**
- Create: `apps/backend/.env.production.example`

**Interfaces:**
- Consumes: all keys in `apps/backend/src/config/env.ts`
- Produces: a commit-safe environment template with placeholders

- [ ] **Step 1: Create grouped production variables**

Include core runtime, database, Redis, auth, OAuth, storage, AI, translation,
academic providers, workers, report/gap/search controls, and admin safety
variables. Use production public URLs and placeholders such as:

```env
MONGODB_URI=<required-secret>
REDIS_URL=<required-secret>
JWT_ACCESS_SECRET=<required-secret-minimum-32-characters>
GEMINI_API_KEY=<required-secret>
```

- [ ] **Step 2: Compare template keys against the Zod schema**

Extract uppercase keys from both files and verify every schema key is present
in the template. Defaults may still be shown explicitly for operational
clarity.

### Task 3: Add the PaperLens production runbook

**Files:**
- Create: `README_PRODUCTION.md`

**Interfaces:**
- Consumes: Jenkins pipeline behavior and production template
- Produces: an operator-facing deployment and verification guide

- [ ] **Step 1: Document architecture and public endpoints**

Explain:

```text
paperlens.uk -> OpenResty -> frontend :9001
api.paperlens.uk -> OpenResty -> backend :9000
Jenkins -> Docker images and containers
Jenkins credential -> temporary .env.runtime
```

- [ ] **Step 2: Document private environment preparation**

Include PowerShell and POSIX commands to encode the private file as single-line
Base64 without placing its contents in Git.

- [ ] **Step 3: Document Jenkins and Google OAuth**

Show the exact build argument and runtime overrides:

```bash
--build-arg VITE_API_BASE=https://api.paperlens.uk/api/v1
-e CORS_ORIGIN=https://paperlens.uk
-e GOOGLE_CALLBACK_URL=https://api.paperlens.uk/api/v1/auth/google/callback
```

Document Google Authorized JavaScript origin and redirect URI.

- [ ] **Step 4: Document deployment verification**

Include checks for:

```text
https://paperlens.uk
https://api.paperlens.uk/health
Access-Control-Allow-Origin: https://paperlens.uk
Google callback domain
```

### Task 4: Verify and commit public artifacts

**Files:**
- Verify: `.gitignore`
- Verify: `apps/backend/.env.production.example`
- Verify: `README_PRODUCTION.md`

**Interfaces:**
- Consumes: Tasks 1-3 outputs
- Produces: reviewed public Git changes with no leaked credentials

- [ ] **Step 1: Scan staged files for known secret-bearing values**

Ensure no URI, token, key, password, or private credential from
`apps/backend/.env` appears in staged files.

- [ ] **Step 2: Confirm the private environment remains untracked**

Run:

```bash
git status --short --ignored apps/backend/.env.production
```

Expected: only an ignored entry, never a staged entry.

- [ ] **Step 3: Commit public documentation**

```bash
git add .gitignore apps/backend/.env.production.example
git add -f README_PRODUCTION.md
git commit -m "docs(deploy): add production environment runbook"
```
