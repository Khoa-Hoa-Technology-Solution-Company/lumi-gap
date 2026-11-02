# Focused adjudication dossier

## Changes

- Default view contains the adjudicator's identity and invitation state, followed by the two reviewer opinions. A reviewer writes directly in their own A/B panel. Sending an existing ballot remains a secondary action.
- Saved opinions can be revised without discarding prior versions. Drafts survive failed requests, retry keys remain idempotent, and a changed packet/revision requires explicit rechecking.
- Paper text, research criteria, original ballots and discussion are behind the closed “Đọc bài báo và xem căn cứ” disclosure. Invitation/statement histories and conflict reporting are secondary disclosures.
- The adjudicator retains the existing accept/decline and separate conclusion flow. Only an authorized, accepted adjudicator can decide after the opinions are ready under the existing common deadline policy.
- Backend returns the current viewer's canonical `myReviewerId` so migrated public account IDs cannot hide their statement editor or attach it to the other reviewer. Backend statement permissions remain authoritative. No schema migration or history deletion.

## Verification

- 40 frontend tests passed across case controls, adjudication and conflict resolution. The eight case tests passed again after the final waiting-state copy change.
- Five targeted PostgreSQL tests passed, eighteen other tests skipped by name filter. Coverage includes both reviewers' canonical identities, simultaneous independent statements, sealed text, separate decisions and packet revision handling.
- Visual inspection of the real components with isolated fixture data at desktop and 412px width. Fixture `/api/` calls are denied; no live opinions, invitations or conclusions were submitted.
- Screenshots: `2026-11-02-adjudication-simple-reviewer.jpg`, `2026-11-02-adjudication-simple-mobile.jpg`.
- Shared types and backend production builds passed. The initial web build failed on Windows `EPERM` while another build touched the shared `dist` output. An isolated production Vite build then passed, along with the unchanged bundle-budget check (88 KiB entry, 567.4 KiB initial graph).

## Local runtime

The built web and backend were packaged into the existing lightweight local runtimes without source Dockerfile changes. Docker Desktop returned an engine HTTP 500 during container replacement. Recovery restarted only the observed Docker Desktop/backend/build processes and the `docker-desktop` WSL distribution. No volumes or application data were removed.

Recovery completed at 15:28 (UTC+7): backend `/ready` reports PostgreSQL and Redis healthy. Port 8080 serves the exact isolated production `index.html`. Deployed `screening-case-context.js` SHA-256 matches the host build (`2e9ba53f3d19f9684b055db2a28d59c2e4ce166cc59d6c97a3ede5a45d0f0357`). The fixture server is stopped and its tab closed.

Read-only verification of the deployed dossier confirms the invited independent member, A waiting for input, B correctly labeled “Bạn” with the direct text field, and collapsed source/history/report sections. No live statement was submitted. Final screenshot: `2026-11-02-adjudication-simple-live.jpg`.

Existing histories and access restrictions remain available. Private opinions stay sealed under the existing readiness policy.
