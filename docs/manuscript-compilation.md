# Manuscript PDF compilation

Compilation uses the existing immutable ManuscriptSnapshot and ManuscriptCompilation tables. No schema migration or external paid service is required. Source persistence, collaboration sync and PDF compilation are separate states.

## Start locally

From the repository root:

```powershell
docker compose -f docker-compose.yml -f apps/backend/compiler/compose.yml up -d --build
```

Keep both Compose files when recreating these services. The optional overlay enables `MANUSCRIPT_COMPILER_URL` on the API and worker and starts the isolated compiler. A normal Compose run without the overlay does not enable a compiler on a fresh installation.

For a native backend, set `MANUSCRIPT_COMPILER_URL` to a privately reachable compiler and run `pnpm --filter backend worker:manuscript-compile` alongside the API. The compiler and worker must use the same `INTERNAL_SERVICE_KEY`. Do not expose the compiler port to the public internet.

## Workflow

1. The editor waits for durable source sync, reuses an identical saved snapshot or seals a new immutable snapshot, and enqueues its ID. Manual version creation remains explicit and separate.
2. BullMQ runs the compile in a separate worker with retry and exponential backoff. Repeated requests for the same snapshot/engine reuse a queued, running or successful compilation. Each manuscript has at most one active job; each requester has at most three.
3. The worker rechecks project write access, reads only that snapshot and sends its files to the compiler.
4. The compiler runs pdfLaTeX or XeLaTeX, BibTeX when requested by the auxiliary file, and two additional passes for citations/references. It retains no source between jobs.
5. The worker rechecks permission and persists PDF bytes, checksum, bounded diagnostics, engine/toolchain and snapshot association in PostgreSQL.
6. The editor polls status, renders PDF pages with the existing private PDF renderer, and supports zoom, page navigation, download and source-error links. Previous successful output is preserved after failures. Source changes are explicitly marked as requiring recompilation.

`GET .../compilations` returns metadata only; `GET .../compilations/:compilationId/pdf` checks access to the exact snapshot. Revoked members and ended mentors lose access. Mentors/reviewers can only retrieve PDFs for snapshots already shared with them under existing manuscript rules; they cannot compile drafts.

## Isolation and limits

The non-root compiler has no database, Redis, host volume or Docker socket. Its network is internal. TeX subprocesses receive an empty credential environment, no inherited service descriptors, no shell escape, no startup RC files, and strict `openin_any`/`openout_any` policies. A native Landlock sandbox permits reading installed TeX/fonts and the current job only, and writing only that job. Seccomp blocks networking, process inspection, signals to other processes, path-based truncation and namespace/mount changes. The sandbox requires Landlock (Linux 5.13+), supports the older ABI on WSL, and fails closed when unavailable. Read-only container filesystems and one active temporary job also apply on older kernels.

Limits: 200 input files, 20 MB source, 20 MB PDF, 64 KB returned log, 60 seconds wall time, 30 seconds CPU per subprocess, 512 MB subprocess address space, 768 MB container memory, 64 container processes and 128 MB temporary storage. No arbitrary user shell commands, internet package installation, minted shell escape or Biber. The installed `texlive-publishers` and `texlive-science` packages support IEEEtran conference templates and algorithmic environments in addition to the LumiGap templates; missing packages appear in the compiler log. XeLaTeX supports Unicode and system fonts (including Vietnamese).

Infrastructure failures retry up to five times. LaTeX errors finish as FAILED immediately. A queued job survives API restarts and is enqueued again on status reads if necessary. Jobs left unfinished longer than 15 minutes are marked failed so users can retry. Queue retention follows existing BullMQ policies; PDF/source retention follows existing project records.

## Verify

`apps/backend/compiler/test_compiler.py` exercises the real image, multi-file source, bibliography, Unicode, images, invalid LaTeX, path rejection and sandbox filesystem/network/shell restrictions. Backend persistence tests cover API-to-worker-to-PDF and authorization. Frontend tests cover compile states and diagnostics.

## Local demonstration manuscripts

`apps/backend/prisma/seed-manuscripts.ts` adds three clearly labeled `[Demo]`
manuscripts to an existing local project through the manuscript service. It requires
development mode, loopback PostgreSQL/Redis, an enabled compiler and the running
compile worker. It preserves existing manuscripts and skips previously seeded demos
on rerun, including any edits made to those demos.

With the compiler Compose overlay already running, a native PowerShell invocation is:

```powershell
$env:MANUSCRIPT_COMPILER_URL = 'http://manuscript-compiler:8020'
pnpm --filter backend exec tsx prisma/seed-manuscripts.ts --project <project-id>
```

The native seed only enqueues compilations; the Docker worker contacts that internal
compiler address. The native database and Redis configuration must point to the same
local services used by the running backend. The seed never calls an LLM.

| Demo | What to try |
| --- | --- |
| AI feedback | Open sections, follow the outline, edit text, inspect the synthetic chart/table/equation, BibTeX citations, comments and saved version; compile again |
| Vietnamese | Keep XeLaTeX selected; edit Vietnamese text, compile, navigate pages and download the PDF |
| Error recovery | Open `sections/demo-error.tex`, replace `\LumiGapDemoUndefinedCommand` on line 3 with ordinary text, compile; inspect how the previous successful PDF is retained during errors |

All measurements and bibliography entries are explicitly fictional. Existing team
members can open the same demo to exercise collaboration; the seed does not create
accounts or change membership. Successful PDFs and valid source ZIPs are also written
under `docs/assets/manuscript-demo/`. The error-recovery ZIP contains the successful
baseline; the deliberate broken version exists in the app and its version history.
