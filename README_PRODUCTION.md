# PaperLens Production Deployment Runbook

This is the source of truth for deploying and operating the PaperLens web
platform at `paperlens.uk`. It contains no real credentials.

## 1. Production Topology

```text
Browser
  |
  +-- https://paperlens.uk
  |      DNS + TLS + Nginx Proxy Manager -> paperlens-web:80
  |
  +-- https://api.paperlens.uk
         DNS + TLS + Nginx Proxy Manager -> paperlens-backend:4000
                                                       |
                  +------------------------------------+------------------+
                  |                    |               |                  |
               MongoDB          Self-hosted Redis   LibreTranslate       BullMQ workers
             metadata/data       cache + queues     paper translation   async processing
```

Jenkins checks out `main`, builds immutable Docker images tagged with the Git
commit, validates the protected production environment, tests a backend
candidate, and deploys web, API, LibreTranslate, and the six steady workers.

Public endpoints:

| Purpose | URL |
|---|---|
| Web application | `https://paperlens.uk` |
| API base | `https://api.paperlens.uk/api/v1` |
| Process liveness | `https://api.paperlens.uk/health` |
| MongoDB/Redis readiness | `https://api.paperlens.uk/ready` |
| API documentation | `https://api.paperlens.uk/api-docs` |
| Google OAuth callback | `https://api.paperlens.uk/api/v1/auth/google/callback` |

## 2. Version-Controlled Deployment Files

| File | Purpose |
|---|---|
| `Jenkinsfile` | Canonical production pipeline |
| `Dockerfile.backend` | API and worker image |
| `Dockerfile.web` | Vite build and Nginx runtime image |
| `deploy/openresty/paperlens.conf.example` | Reverse proxy and TLS template |
| `apps/backend/.env.production.example` | Complete public environment template |
| `apps/backend/scripts/validate-production-env.ts` | Pre-deploy environment guard |
| `README_PRODUCTION.md` | This runbook |

Do not maintain a second Jenkins script manually after switching the job to
**Pipeline script from SCM**. Otherwise the Jenkins UI and Git can silently
diverge.

## 3. Secret Boundary

| File or secret | Commit to Git? |
|---|---|
| `apps/backend/.env.production.example` | Yes |
| `apps/backend/.env.production` | **No** |
| `apps/backend/.env` | **No** |
| `.env.compose` | **No**; local Docker Compose only |
| Jenkins Secret Text `liemresearch-backend-env-b64` | **No** |
| Jenkins temporary `.env.runtime` | **No**; deleted after every build |

Base64 is transport encoding, not encryption. Never paste the private
environment into GitHub, a pull request, an issue, a screenshot, or build logs.

## 4. One-Time Infrastructure Setup

### DNS and firewall

- `paperlens.uk` A record points to the deployment server.
- `api.paperlens.uk` A record points to the same deployment server.
- Public firewall permits only required services such as `80` and `443`.
- MongoDB, Redis, ports `9000`, and `9001` are not exposed to the public
  Internet. Nginx Proxy Manager is the public entry point.

### TLS and reverse proxy

The production server runs Nginx Proxy Manager in Docker on the external
`nginx-network`. Jenkins attaches the PaperLens containers to that network with
stable aliases:

| Public host | Forward hostname | Forward port |
|---|---|---:|
| `paperlens.uk` | `paperlens-web` | `80` |
| `api.paperlens.uk` | `paperlens-backend` | `4000` |

Do not forward either host to `127.0.0.1` or the server's public IP. From inside
the reverse-proxy container, `127.0.0.1` refers to that container itself, while
the host ports are intentionally bound only to the host loopback interface.

For a non-containerized OpenResty installation, the version-controlled example
below remains available.

For the first certificate, briefly stop OpenResty and use Certbot standalone so
the command does not depend on an already-valid HTTPS configuration:

```bash
sudo systemctl stop openresty
sudo certbot certonly --standalone \
  -d paperlens.uk \
  -d api.paperlens.uk
sudo systemctl start openresty
```

Install `deploy/openresty/paperlens.conf.example` in the server's OpenResty
`conf.d` directory, verify certificate paths, then run:

```bash
sudo openresty -t
sudo systemctl reload openresty
```

### Google OAuth

Configure the production OAuth client in Google Cloud:

**Authorized JavaScript origin**

```text
https://paperlens.uk
```

**Authorized redirect URI**

```text
https://api.paperlens.uk/api/v1/auth/google/callback
```

The redirect URI must match `GOOGLE_CALLBACK_URL` exactly.

### Jenkins job

Configure the job as:

```text
Definition: Pipeline script from SCM
SCM: Git
Repository: https://github.com/longdevlife/LiemResearch.git
Branch: */main
Script Path: Jenkinsfile
```

The Jenkins agent requires Docker access and enough disk for at least the
current and previous backend/web image tags.

## 5. Prepare and Validate Production Environment

Create the private file:

```powershell
Copy-Item apps/backend/.env.production.example apps/backend/.env.production
```

Replace **every value enclosed in angle brackets**, including:

- `<required-...>`
- `<operator-email-address>`

Required runtime secrets include MongoDB, the self-hosted Redis password, two different JWT secrets,
Gemini, Google OAuth, and R2 when `STORAGE_PROVIDER=r2`.

The Jenkins browser gate also requires a dedicated low-privilege E2E account
with enough test credits to run one AI rerank, and one stable paper fixture.
The fixture must be active, embedded, discoverable by `E2E_SEARCH_QUERY`,
contain an abstract, and expose a readable PDF:

```dotenv
E2E_USER_EMAIL=<dedicated-test-account>
E2E_USER_PASSWORD=<dedicated-test-password>
E2E_PAPER_ID=<stable-paper-object-id>
E2E_SEARCH_QUERY=<query-that-returns-that-paper>
E2E_TRANSLATION_LANGUAGE=vi
```

Do not use an administrator account. These values stay in the protected Jenkins
credential and are never baked into the web image.

Redis runs inside the private Docker network with AOF persistence. Production
must use:

```dotenv
REDIS_DEPLOYMENT=self_hosted
REDIS_PASSWORD=<raw-password-at-least-32-characters>
REDIS_URL=redis://default:<URL-encoded-password>@redis:6379
```

The decoded password in `REDIS_URL` must equal `REDIS_PASSWORD`. Jenkins rejects
external Redis hosts and does not publish port `6379`.

Keep these public values:

```env
NODE_ENV=production
PORT=4000
CORS_ORIGIN=https://paperlens.uk
GOOGLE_CALLBACK_URL=https://api.paperlens.uk/api/v1/auth/google/callback
TRANSLATION_PROVIDER=libretranslate
LIBRETRANSLATE_URL=http://libretranslate:5000
SYNC_ADMIN_BYPASS=false
```

Validate before sending it anywhere:

```powershell
pnpm --filter backend env:validate:production
git check-ignore apps/backend/.env.production
```

The validator rejects placeholders, duplicate keys, invalid production URLs,
weak/equal JWT secrets, incomplete R2/Google configuration, and invalid operator
emails. It never prints secret values. `git check-ignore` must print the private
file path.

## 6. Store Environment in Jenkins

Create or update a Jenkins **Secret Text** credential:

```text
ID: liemresearch-backend-env-b64
```

Encode the private file on Windows without printing it:

```powershell
$path = Resolve-Path "apps/backend/.env.production"
$encoded = [Convert]::ToBase64String([IO.File]::ReadAllBytes($path))
Set-Clipboard -Value $encoded
Remove-Variable encoded
```

Paste the clipboard into the Jenkins Secret field. The pipeline decodes it to a
permission-restricted `.env.runtime`, validates it inside the newly built
backend image, and deletes it in `post { always { ... } }`.

## 7. What the Pipeline Deploys

The committed `Jenkinsfile` deploys:

| Container | Responsibility |
|---|---|
| `user1-liemresearch-backend` | Express API on host port `9000` |
| `user1-liemresearch-web` | React/Nginx web on host port `9001` |
| `user1-liemresearch-libretranslate` | On-demand paper translation |
| `user1-liemresearch-redis` | BullMQ queues, cache, rate limits, and worker heartbeats |
| `worker-report` | RAG report jobs |
| `worker-gaps` | Research-gap jobs |
| `worker-notifications` | Notification delivery |
| `worker-embedding` | Gemini embedding jobs |
| `worker-paper-analysis` | Structured paper knowledge extraction |
| `worker-corpus-validation` | Corpus validation jobs |

The regular deployment intentionally does **not** start:

- `worker:sync`
- `worker:openalex-ingest`

Those workers change the corpus and must be started only for an approved sync or
ingestion campaign. This prevents every web deployment from silently importing
more papers.

The web image is built with:

```text
VITE_API_BASE=https://api.paperlens.uk/api/v1
```

The backend candidate must pass `/ready` before the live API container is
replaced. Worker containers must remain running and all six required Redis
heartbeats must be fresh before the image is tagged `latest`. Jenkins also
creates and validates `paper_vector_index_v2` before cutover. This index
pre-filters year, status, paper type, access status, provider, source, language,
citation range, and OpenAlex taxonomy fields so narrow semantic searches do not
lose relevant papers inside a fixed candidate window.

After the public smoke check, the Playwright browser gate exercises the real
production workflow:

```text
Login -> Keyword Search -> Semantic Search -> AI Rerank
      -> Paper Detail -> Read PDF -> Translate Abstract
```

The gate runs in an immutable Playwright Docker image and retains traces,
screenshots, and video when it fails.

## 8. Deploy

1. Merge the reviewed PR into `main`.
2. Open the Jenkins PaperLens job.
3. Select **Build Now**.
4. Confirm **Validate production environment** passes.
5. Confirm the candidate backend passes `/ready`.
6. Confirm all six worker containers are running and Jenkins reports
   `Verified 6 fresh worker heartbeats.`
7. Confirm **Ensure filtered vector index** and **Browser E2E smoke** pass.
8. Confirm **Promote verified images** runs only after browser E2E passes.
9. Confirm the build ends with `Finished: SUCCESS`.

Do not treat a green web page alone as a successful deployment. Reports and
gaps require their workers, while most AI features require Redis queues.

## 9. Production Verification

### Public liveness and readiness

```powershell
(Invoke-WebRequest https://paperlens.uk -UseBasicParsing).StatusCode
(Invoke-WebRequest https://api.paperlens.uk/health -UseBasicParsing).StatusCode
(Invoke-WebRequest https://api.paperlens.uk/ready -UseBasicParsing).StatusCode
```

All must return `200`. `/health` means the Express process is alive. `/ready`
also pings MongoDB and Redis and returns `503` when either dependency is down.

### CORS

```powershell
$headers = @{
  Origin = "https://paperlens.uk"
  "Access-Control-Request-Method" = "GET"
  "Access-Control-Request-Headers" = "authorization,content-type"
}

$response = Invoke-WebRequest `
  -Uri "https://api.paperlens.uk/api/v1/papers/translation/capabilities" `
  -Method Options `
  -Headers $headers `
  -UseBasicParsing

$response.StatusCode
$response.Headers["Access-Control-Allow-Origin"]
```

Expected: status `204` and origin `https://paperlens.uk`.

### Translation

```powershell
Invoke-RestMethod "https://api.paperlens.uk/api/v1/papers/translation/capabilities"
```

Then sign in, open one paper containing an abstract, translate it, reload the
page, and confirm the cached translation still appears.

### OAuth

Test both:

1. Successful Google sign-in returns to
   `https://paperlens.uk/auth/oauth-callback?code=...`, exchanges the short-lived
   code once, and then removes it from the browser URL.
2. Cancelled/failed Google sign-in returns to
   `https://paperlens.uk/login?error=GoogleLoginFailed`.

Neither path may redirect to `localhost` or `api.paperlens.uk/login`. Access and
refresh tokens must never appear in the callback URL.

### Workers

On the deployment server:

```bash
docker ps --format '{{.Names}}\t{{.Status}}' | grep user1-liemresearch
```

Then use Admin Pipeline Health to verify fresh heartbeats for report, gaps,
notifications, embedding, paper analysis, and corpus validation. Finally create
one small report and confirm it moves from `queued` to a terminal status.

## 10. Rollback

Images are tagged with the 12-character Git commit. Do not delete the previous
known-good tag during routine deployment.

Preferred rollback:

1. Revert the faulty PR on `main`.
2. Run Jenkins again.
3. Verify `/ready`, workers, OAuth, and one queued report.

Emergency rollback:

1. Identify the previous known-good image tag with `docker images`.
2. Re-run the backend, web, and worker containers with that same tag and the
   protected `.env.runtime`.
3. Verify `/ready` before reopening traffic.
4. Follow with a Git revert so the server and repository return to the same
   version.

Never roll back MongoDB data blindly. Application rollback and data restore are
separate decisions.

## 11. Backup, Recovery, and Secret Rotation

- MongoDB backup/replication is owned by the database operator. Record retention
  and test a restore before a large migration or million-paper campaign.
- R2 object versioning/retention is owned by the storage operator.
- Redis is not the source of truth for papers, users, reports, or credits. Queue
  loss still affects pending jobs, so monitor failed/dead-letter jobs.
- Rotate credentials immediately after any public disclosure.
- After rotation, update Jenkins credential
  `liemresearch-backend-env-b64` and deploy again.
- Remove the private environment from chat/file-transfer history after the
  authorized operator stores it securely.

## 12. Acceptance Checklist

A production deployment is accepted only when:

- [ ] Jenkins checked out the intended `main` commit.
- [ ] Production environment validation passed with no placeholder.
- [ ] Web, API, and `/ready` return `200`.
- [ ] CORS allows `https://paperlens.uk` and rejects unapproved origins.
- [ ] Google success and failure paths return to the web domain.
- [ ] LibreTranslate reports supported languages and translates one paper.
- [ ] Six steady worker containers are running with fresh heartbeats.
- [ ] A report job leaves `queued`.
- [ ] No secret appears in Git diff or Jenkins logs.
- [ ] Previous known-good image tags remain available for rollback.
- [ ] MongoDB backup/restore ownership is documented before data migration.
