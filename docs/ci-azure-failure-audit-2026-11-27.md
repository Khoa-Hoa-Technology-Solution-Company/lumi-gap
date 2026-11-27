# CI and Azure failure follow-up — 27 November 2026

Investigated main commit `469b337e` and the following failed runs:

- CI: https://github.com/Khoa-Hoa-Technology-Solution-Company/lumi-gap/actions/runs/45926804009
- Azure: https://github.com/Khoa-Hoa-Technology-Solution-Company/lumi-gap/actions/runs/45926803979

## CI

Typecheck passed. The web suite reported five failures in three files:

- Literature navigation tests still expected the matrix and limitations links to display topic clusters. They now assert the actual subview and its selected tab.
- The modern independent-screening test used historical workflow version 3. It now covers current, future and omitted workflow versions; historical permission tests remain in place.
- The mentoring preferences failure assertion ran before React Query delivered its mutation-error notification. It now waits for the alert and still asserts that the saved preference is unchanged.

The focused recheck passed 89 tests. A full web run also exposed two timing-sensitive assertions in the task board's lazy loading and the mentor composer's pending state. Both now await the observable UI state; their two suites passed all 55 tests on recheck. Changed-file ESLint passed.

## Azure

The deployment typecheck and image builds passed. Docker Compose then reported the backend as unhealthy and skipped dependent services. The job did not capture backend logs or the failed health probes, so the startup cause is not established by that output. The previous Azure run for `5242ea7f` succeeded. Public API health and readiness returned HTTP 502 during this investigation.

The deployment script now prints backend logs, container exit/OOM state and health-probe output after a failed `compose up`. It preserves the original failure exit code and does not print container environment configuration. Bash syntax validation and an isolated mocked deployment verified that diagnostics are emitted and exit code 42 is preserved.

Production recovery is not confirmed. Backend logs from the VM are required to identify the actual runtime failure:

```bash
docker compose -f docker-compose.yml -f deploy/vps/docker-compose.vps.yml logs --tail=100 backend
docker inspect --format 'status={{.State.Status}} exit={{.State.ExitCode}} oom_killed={{.State.OOMKilled}} health={{json .State.Health}}' lumi-gap-backend-1
```

Do not remove the healthcheck or increase its timeout without evidence from those diagnostics.
