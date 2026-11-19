# LumiGap: lightweight Windows development

Use the working copy at `D:\lumi-gap`. Backend, Vite web,
and only the selected workers run on Windows. Docker runs PostgreSQL 16 with
pgvector and Redis using the existing volumes. No migration, seed, reset, image
build, installation, or credential rotation happens when using this launcher.

## Start, stop, and inspect

Run in PowerShell from the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\apps\backend\scripts\local-light.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\apps\backend\scripts\local-light.ps1 -Action Status
powershell -NoProfile -ExecutionPolicy Bypass -File .\apps\backend\scripts\local-light.ps1 -Action Stop
```

Open **http://localhost:8080**. API: **http://localhost:4000/health** and
**http://localhost:4000/ready**. Keeping port 8080 preserves existing browser
links and OAuth frontend return URLs. Vite proxies `/api`, including WebSockets,
to port 4000. The default worker is `notifications`; it also handles existing
scheduled collaboration maintenance. Other background queues wait until their
workers are started.

Stop leaves database/Redis running. To stop those containers too, add
`-StopInfra` to the stop command. Docker Desktop itself stays open. The launcher
only stops its recorded Node process trees, checks process identity before
stopping, and refuses to replace an unrelated process using ports 4000/8080.
Run Stop before changing options or after an incomplete startup.

Logs and process metadata are in `.cache/local-light/` (ignored by Git).
Logs may contain private application data: do not commit or share them unredacted.
Start the launcher again after a Windows restart; no login-startup task is installed.
On this machine, desktop shortcuts **LumiGap - Bat local nhe** and
**LumiGap - Dung local** run the start and stop commands for `D:\lumi-gap`.

## Enable only the features you need

Stop the local processes first, then start with an appropriate option:

```powershell
# AI Reviewer container plus the native AI jobs worker
powershell -NoProfile -ExecutionPolicy Bypass -File .\apps\backend\scripts\local-light.ps1 -AiReview

# Isolated Docker TeX Live compilers plus native compilation worker
powershell -NoProfile -ExecutionPolicy Bypass -File .\apps\backend\scripts\local-light.ps1 -Compiler

# For report/gap/embedding work, select native workers individually
.\apps\backend\scripts\local-light.ps1 -Workers notifications,report,gaps

# Only when editing packages/shared-types; saves a TypeScript watcher otherwise
.\apps\backend\scripts\local-light.ps1 -WatchSharedTypes
```

`-AiReview` and `-Compiler` can be combined, but use more RAM. The compiler
continues running inside its existing security sandbox; Windows MiKTeX is not
used to compile uploaded manuscripts. Its HTTP ports are bound to loopback only.
The local Compose overlay uses a small HTTP relay on ports 8020/8025 because
Docker does not publish ports from an internal-only network. The two TeX services
remain exclusively on `manuscript-isolated`; only the relay joins both networks.
It forwards only fixed compiler paths and preserves the internal authentication
header. The launcher checks both compiler health endpoints before starting the API.
Optional services require existing local images; the launcher never builds them.
`worker:sync`, bulk ingestion, and the full worker suite do not start by default.
Backend and web watch their source automatically. Shared types use the existing
compiled package by default; rebuild it with the command below after changing
shared source, or start with `-WatchSharedTypes` while working on that package.

Avoid `pnpm dev`, `pnpm dev:local`, or full `docker compose up` while this mode
is running: those commands can start the full stack or duplicate workers.

If PDF preview says the server cannot compile, the default lightweight mode was
started without `-Compiler`. Stop local mode, then start with `-Compiler` using
the command above. On this machine, **LumiGap - Bat local va PDF** on the Desktop
starts this configuration. **LumiGap - Bat local nhe** keeps the minimal mode.
After switching modes, reload an already-open manuscript page so it retrieves
the updated compiler availability. Saving source alone does not create a PDF;
use the editor's compile action. No AI reviewer or ingestion worker is needed.

## Dependencies and existing data

Dependencies, generated Prisma client, built shared types, root `.env`, and valid
JWT keys must already exist. For a fresh checkout, follow the repository setup
instructions first. Generate the Prisma client without applying migrations:

```powershell
pnpm --filter backend db:generate
node .\node_modules\typescript\bin\tsc -p .\packages\shared-types\tsconfig.json
```

The native database URL must point at the existing loopback PostgreSQL container
on port 5433, and Redis at loopback port 6379, using its existing credentials.
Windows PostgreSQL on 5432 and SQL Server are not used. No secrets belong in
this document or launcher. Child processes use `NODE_ENV=development`; root
`.env`, SMTP/provider credentials, and production security checks stay unchanged.

When moving an existing Docker installation, preserve and reconcile its uploads
with `apps/backend/uploads/` before using native file access. Keep the Docker
volume as a backup. If the prior Docker JWT pair is copied into the ignored
`apps/backend/.keys/local-light/` directory, the launcher uses that pair to keep
existing access tokens valid. Otherwise the existing native JWT pair is used.
Never print or commit the private key.

Database migration histories in this working copy and the existing database
were previously found to differ. This launcher deliberately does not resolve
or apply them. Review them separately; never reset the existing database to
make migration status pass.

## Local verification (2026-11-14)

- Shared types compile and Prisma client generation succeeded.
- PowerShell launcher parsed successfully and was exercised on Windows PowerShell 5.1.
- Start, repeat Start (no duplicate processes), Stop, and Start again succeeded.
- Only `lumi-gap-postgres-1` and `lumi-gap-redis-1` run by default; both healthy.
- Native backend readiness and web return HTTP 200. Unauthenticated `/api/v1/auth/me`
  through the Vite proxy returns the expected HTTP 401.
- The browser rendered the home page with existing library data.
- Backend and notification worker logs had no error markers at verification.
- Existing database/Redis/upload volumes, root environment file, and existing
  native uploads were retained; no migrations or seeds were applied.
- Optional AI/TeX startup configurations were validated with Compose, but their
  workloads were not run in the default lightweight mode.
