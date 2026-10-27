# Submissions in the project workspace

Submissions already require a project. The primary entry point is now the
**Submissions** section of each project's research workspace, after Artifacts.
The separate header menu entry has been removed.

## Navigation

- List: `/projects/:id?tab=submissions`
- Create: `/projects/:id?tab=submissions&submission=new`
- Detail: `/projects/:id?tab=submissions&submission=:submissionId`

Creation fixes the project and opens the resulting manuscript in the same
workspace. Back and Cancel return to that project's list. Switching project
sections clears the selected manuscript. Existing standalone submission URLs
remain available for saved links and reviewer access.

## Access and data

The API accepts an optional validated `projectId` on submission list and detail.
It resolves both UUID and legacy project IDs, then verifies ownership, active
membership or existing review-management permission. A scoped list includes the
project's submissions regardless of which member created them, with the existing
100-record limit. Without a project scope, the personal author filter is retained.
A scoped detail rejects manuscripts from other projects. Revision/history queries
start after the scoped detail is loaded.

Public project summaries do not render the section. Embedded workflows retain
email verification. Archived projects have no creation or revision actions, and
the creation API rejects them before persisting a file. Existing manuscript
revision, review-request, AI pre-review and history permissions remain in effect.

## Review progress and action permissions

Detail now shows review requests, reviewer names, their pinned revision, due date
and status. Full project members see the team's requests; blind reviewers see
only their own. Request detail links appear only for the requester or assigned
reviewer, matching the existing request API. Expired pending requests are shown
as expired even before the next lifecycle operation persists that status.

Saving a PDF does not send an invitation. The project owner sends formal review
requests. Uploading a new revision also does not resubmit an existing request;
the requester opens the request and resubmits after revision is requested.
The progress section explains this distinction and can refresh both requests and
the submission status. Request mutations invalidate submission caches as well.

The history API returns separate `canManage`, `canRequestReview` and
`canRunAiPreReview` flags. The UI fails closed until these flags load. Formal
invitations require an active, verified project owner; AI requires an author or
review manager. Completed submissions cannot run AI. Archived projects reject
new AI jobs and cancel queued jobs before calling the reviewer service. Reopening
a terminal submission for review is also rejected by the API.

New AI requests record `sourceRevisionId` and `sourceRevisionNumber` in the
existing structured-output JSON, preserved with the completed analysis. Workers
read that immutable revision even if a newer version arrives while queued. The
UI labels the analyzed version, identifies stale results and explains when an
older result has no recorded version. This addition needs no schema migration.

PDF uploads reject duplicate clicks while pending and keep failed inputs for
retry. Detail, version history and AI query errors expose independent retries.
Project 403/404 responses show the unavailable/access message instead of a
transient failure retry loop.

## Verification

Targeted frontend and backend tests cover project scoping, legacy IDs, outsider
access, archived creation, fixed creation payload, navigation and verification.
Browser checks use read-only navigation and form opening; no real manuscript is
created, uploaded or submitted for review.

### Follow-up audit: 2026-10-22

- The supplied project URL returned HTTP 404 in the current signed-in session.
  Its actual submissions could therefore not be inspected in the live UI.
  After the local update, the browser showed the intended unavailable/access
  message with no transient retry loop. See the
  [live URL check](audits/2026-10-22-submissions-live-unavailable.jpg).
- PostgreSQL integration checks use a separate disposable database and Redis,
  mocked delivery queues and a mocked AI provider. They include request access,
  version pinning through resubmission, archives and immutable feedback.
- The browser preview uses synthetic data with API methods stubbed in the preview
  entry. It verifies request progress, explicit refresh, Vietnamese copy and the
  outdated AI warning; no invitation, upload or paid AI analysis is performed.
- Screenshot: [synthetic-data preview](audits/2026-10-22-submissions-desktop.jpg).
- Final targeted checks: 52 web tests, 34 backend tests and the 4 PostgreSQL
  runtime checks passed. Backend build, web build/typecheck and changed-file
  lint were checked separately. Disposable test services and preview files are
  removed after verification.
- Local web, API and AI worker were refreshed after verification. Because the
  full image rebuild stalled downloading npm packages, the checked builds were
  layered onto the existing local images after confirming identical lockfiles
  and backend dependency declarations. Both Compose files, including
  `apps/backend/compiler/compose.yml`, are retained for runtime configuration.
  API and web returned HTTP 200 and the backend was healthy afterward.
  Nginx was reloaded after the API recreation to refresh its upstream address;
  an unauthenticated proxied auth request returned the expected HTTP 401.
- The existing 100-record list limit is unchanged. This check does not establish
  live access to the supplied project or verify real email/AI provider delivery.
