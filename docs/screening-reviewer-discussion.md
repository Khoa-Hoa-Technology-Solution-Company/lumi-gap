# Reviewer disagreement discussion, workflow 13

Implemented 2026-11-08. This supersedes the separate, immutable final-confirmation flow described in `screening-two-reviewer-consensus.md` (workflow 12).

## Behavior and state mapping

Two assigned reviewers submit independent binary evaluations with a justification. Their evaluations remain private until both have submitted valid reviews. Two Suitable votes immediately produce INCLUDED; two Not Suitable votes produce EXCLUDED. The existing accepted-paper/evidence workflow receives the result.

A disagreeing pair enters direct discussion. The logical DISPUTED state reuses CONSENSUS_REQUIRED (Cần thảo luận) and CONSENSUS_IN_PROGRESS (Đang thảo luận); no redundant status enum or second workflow table is introduced. INCLUDED / EXCLUDED retain their established storage/API meaning. The UI presents them as Đã chấp nhận / Đã loại.

Only the two assigned reviewers may comment or update an evaluation. Each update appends a new ScreeningReview revision to the authenticated actor's assignment. It never edits the peer's evaluation or overwrites an older revision. A justification and the current own revision are required. The backend compares the latest valid revision from each assignment under the existing project lock. A single update that makes the pair agree resolves the round immediately. No extra confirmation, owner approval or arbitrator action is required. While the pair still differs, both reviewers may continue discussing and updating their own evaluations.

The discussion deadline starts at the first disagreement. It defaults to 48 hours and uses the existing configurable consensusWindowHours (1–336 hours), frozen in the round. Comments, revisions and later settings changes do not reset it. The notification worker and authorized reads enforce expiry; a browser timer is only a display/refresh mechanism. A matching pair submitted before the deadline is preserved even if maintenance runs after the deadline. Otherwise the round becomes EXCLUDED with resolutionType CONSENSUS_NOT_REACHED. This records lack of agreement in the project, not a claim that the paper is academically invalid.

The expiry copy is:

> Không đạt đồng thuận
>
> Hai Reviewer không thống nhất được kết quả trong thời gian quy định. Bài báo đã được kết luận Không phù hợp và đóng quy trình đánh giá.

Finalized rounds reject further evaluation changes and comments. All revisions and discussion remain available. Archived/completed projects stay read-only. Existing SIMPLE and COLLABORATIVE compatibility behavior outside this independent two-reviewer flow is preserved.

## Frontend

The current Paper Detail discussion uses the title **Hai Reviewer chưa thống nhất** and the requested Vietnamese description. Two reviewer cards show name/initial avatar, current decision, justification, revision and update timestamp. Green/red decision badges include text; the disagreement status uses the same amber/orange tone throughout cards, tasks and detail.

Long justifications have a bounded preview and expandable full text. Previous revisions are available in a shared ReviewVersionHistory disclosure both during discussion and after finalization. The existing professional chat thread supplies chronological messages, author/initial avatar, timestamps, loading/error/empty states, polling and SSE updates. Its action is Gửi bình luận.

Below the discussion are the remaining time, binary evaluation choices, mandatory reason and Cập nhật đánh giá. Quay lại uses the real modal-close action, with the existing unsaved-work guard. No manual approve/reject action is exposed. Stale own revisions disable saving and preserve the local draft until the user reviews the current evaluation. Peer changes refresh the cards without clearing the user's reason. Errors retain the draft. Consensus replaces the discussion editor with a completed result and read-only conversation.

Desktop 1280×900 and mobile 390×844 were inspected using synthetic accounts against the real local API and PostgreSQL. A reviewer posted a comment, changed Not Suitable to Suitable, and the UI immediately showed Đã chấp nhận, revision 2, the retained earlier revision and the closed conversation. Mobile document client/scroll widths both measured 375 pixels.

The discussion screen now separates **Trao đổi** (default) and **Hai phiếu đánh giá** into two accessible tabs using the existing resolution-tab styles. The second tab contains both reviewer cards, their history and the personal evaluation editor. The shared deadline stays above the tabs. A `section=review` action opens the evaluation tab directly; `section=discussion` opens chat. Both panels stay mounted to preserve comment/reason drafts and the selected decision, while hidden chat pauses polling, SSE and read acknowledgements. Arrow keys, Home and End move tab focus and selection. The previously removed criteria disclosure remains absent.

This tab refinement passed 38 focused UI tests, web TypeScript checking, scoped ESLint and a production build. Live QA against the isolated database verified the default tab, both retained drafts and mobile width (375 client/scroll pixels). The compact desktop chat layout reuses the existing reading-workspace rules so its composer remains accessible.

The updated web image was deployed to localhost:8080. Its live entry matched the built HTML, and its project-detail bundle (`project-detail-BtsAcsBk.js`) contained the new tab labels and no removed criteria disclosure. This UI-only follow-up required no database migration or backend restart.

On 2026-11-09, the discussion layout was compacted further: heading and countdown share a row, the instruction is one short sentence, and the duplicate conversation heading becomes a message count. The exact deadline remains available on the countdown and to screen readers. The return action is a small secondary control. Only disagreement workspaces use the wider desktop split (40% source / 60% discussion); other reading screens retain their layout. Live isolated-account QA measured a 680px-wide chat at the normal desktop viewport, with a visible composer; mobile client and scroll widths both measured 375px. Both existing tabs and draft behavior remain. The same 38 focused UI cases, TypeScript check and production build passed for this refinement.

## Backend/API

Reused authenticated endpoint:

```text
POST /api/v1/projects/:projectId/research/screening-v2/rounds/:roundId/reassess
```

Example body:

```json
{
  "decision": "INCLUDE",
  "reason": "Căn cứ mới sau khi đối chiếu tiêu chí",
  "expectedRevision": 1,
  "exclusionReason": "",
  "clientKey": "client-generated UUID"
}
```

The existing strict DTO rejects reviewerId/assignmentId overrides. Independent discussion permits INCLUDE/EXCLUDE only, requires a justification of at least five characters and checks expectedRevision against the actor's own assignment. Existing authentication, active membership, write permissions, rate limits and project-state guards remain. Existing scope, source reference and research-question context are carried to the new immutable revision.

Updates, audit events, notifications, task reconciliation and finalization commit atomically through withWorkspace / screeningCommand. Idempotent retries reuse clientKey and create no extra revision, notification or final decision. Concurrent own edits cannot overwrite each other. Competing peer updates serialize; after the first matching pair finalizes, the other update is refused. Late revisions are not stored; the canonical expired result is returned for UI refresh.

The temporary workflow-12 `/consensus/confirm` mutation is retired with a Vietnamese conflict response. Historical confirmation events remain readable but no longer participate in current consensus calculations. Current pending work is a DISCUSSION obligation for each reviewer, rather than a separate confirmation task. Finalization closes both obligations and excludes rejected papers from accepted collections.

## Notifications and retired arbitration

The existing notification service notifies both reviewers at disagreement, the peer on each new comment/evaluation revision, and both reviewers plus the owner at finalization/expiry. Approaching-deadline reminders are supported by the existing notification worker, with one stable event key per discussion/reviewer. The reminder window is the smaller of six hours and one quarter of the configured discussion duration. Repeated maintenance and reads do not create repeated reminders.

New disagreements do not create an adjudication case, invitation, assignment or arbitration reminder. Request/action endpoints remain deprecated and reject writes; historical authorized GET/source endpoints are read-only. The old random candidate selection module/test and assignment/ranking/coordinator-notification/packet-refresh helpers were removed. Arbitration-specific revision notifications were removed from reassess. Historical packets, statements, invitations, decisions and permissions needed to read history were retained. No historical records were deleted.

## Database/migration

No new profile/review tables or review-result enums are needed. This builds on the existing additive migration `20261108090000_two_reviewer_consensus` (deadline columns, settings and resolution provenance).

New forward migration:

```text
apps/backend/prisma/migrations/20261108110000_screening_evaluation_consensus/migration.sql
```

It snapshots the previous settings in EVALUATION_CONSENSUS_ADOPTED audit events and upgrades unfinished, eligible independent rounds to workflowVersion 13. It **does not change the stored deadline**, delete confirmation events, rewrite finalized results or modify archived/completed projects. The historical confirmation unique index can remain because no new confirmation events are emitted.

All 145 migrations were applied to local isolated database `lumigap_screening_discussion_test` for verification. The subsequent local rollout described below updated the application database and localhost:8080 backend, web and notification-worker together. No production deployment was performed. No new environment variables, credentials or dependencies are required for this workflow.

### Local rollout, 2026-11-08

At the user's request to replace the old arbitration UI still served on localhost:8080, the existing compiled artifacts were packaged into local images without rerunning the memory-intensive dependency/build stages. Previous images are retained as `lumigap-backend:before-reviewer-discussion-20261108` and `lumigap-web:before-reviewer-discussion-20261108`. A consistent PostgreSQL dump was saved inside the existing PostgreSQL container at `/tmp/lumigap-before-reviewer-discussion-20261108.dump` before migration.

The first normal deployment encountered a pre-existing, unrelated pending migration, `20261102090000_papers_openalex_id_unique`. The application database contains six duplicate OpenAlex identifier groups, so its transactional duplicate guard prevented application. Its failed attempt was marked **rolled back**, never applied. The local migration run used a temporary migration directory excluding only that migration, then successfully applied the remaining pending migrations, including both Screening migrations. No OpenAlex records were merged or removed. The repository's migration SQL was not edited. A future full `migrate deploy` still requires resolving those duplicate identifiers; the temporary rollout does not claim to solve that separate corpus-data problem.

Backend, web and notification-worker containers were recreated from the updated local images. `/ready` returned ready with healthy PostgreSQL/Redis, and localhost:8080 returned HTTP 200. The served entry bundle matched `index--zt9z-UW.js`; the served project-detail bundle contained `Hai Reviewer chưa thống nhất` and did not contain `Chuyển bất đồng sang phân xử`. Six eligible active disagreements were migrated to `CONSENSUS_REQUIRED` with workflow 13. Historical/unsupported rounds and finalized decisions retain their existing policy/history.

The browser session available for the live localhost check was signed in as a mentor, so its project page correctly exposed only mentor access. The protected reviewer discussion itself had already been tested with synthetic reviewer accounts against the isolated database; the deployment check does not claim a new reviewer action against real application data. Existing open reviewer tabs need a reload to pick up the new JavaScript.

## Changed files

Backend:

- `screening-consensus.ts`: latest-review consensus, authorized revision append, deadline enforcement, notifications/reminders; old confirmation writes removed.
- `screening.service.ts`: reassess integration, retired confirmation endpoint, task-summary permissions and removed arbitration-specific revision side effects.
- `screening-context.ts`: workflow 13, current update capability and canonical expired-result contract.
- `screening-obligations.ts`, `screening-case-maintenance.ts`: discussion work and scheduled reminders/expiry.
- `screening-case-context.ts`: read-only case history, obsolete arbitration assignment/notification helpers removed.
- `screening-case-selection.ts`: deleted, with its obsolete selector test.
- `dto/screening.schema.ts`, controller/routes and the initial deadline migration remain the integrated infrastructure from the previous implementation.

Frontend/shared contracts:

- `screening-consensus-discussion.tsx`, re-exported by `screening-conflict-resolution.tsx`: new discussion/update UI.
- `screening-round.tsx`, `reading-paper-modal.tsx`, `screening-round-history.tsx`: close action, completed-state history and reusable prior revisions.
- `screening-discussion.tsx`, `project-chat-primitives.tsx`: comment label and optional own avatar, preserving default behavior for other chats.
- `screening-management.tsx`, `screening-paper-card.tsx`, `my-work-model.ts`, `screening-status.ts`: policy copy, action/deadline labels and consistent colors.
- `packages/shared-types/src/project-screening.ts`: canUpdate; historical confirmation fields retained for compatibility.

Verification/documentation:

- Updated PostgreSQL consensus suite and isolated runner, conflict-resolution/workspace/status component tests and historical classification unit tests.
- This document; superseded-policy notices in the two older workflow documents.

## Executed verification

The isolated runner is:

```powershell
node apps/backend/scripts/test-screening-consensus.mjs --env-file D:\lumi-gap\.env
```

It covers both matching initial decisions, automatic consensus after one revision in either direction, continuing disagreement, comment/peer-update notifications, unauthorized actions, stale versions, simultaneous changes, boundary-time agreement, deadline rejection, repeated maintenance, immutable history, retired confirmations, two-person teams and approaching-deadline reminder deduplication.

Executed checks:

- 57/57 cases completed through the isolated runner: 22 real PostgreSQL discussion cases, 31 calculator cases and 4 event cases.
- 58/58 additional backend unit/regression cases, including the PostgreSQL-only runtime boundary.
- 143/143 screening UI cases in six files, including revision ownership, stale-draft preservation, responsive components, comments, real navigation and shared status colors.
- Shared-type compilation, backend production TypeScript build and web TypeScript/Vite builds succeeded. Scoped ESLint and whitespace checks succeeded. Vite retains existing large-chunk warnings.
- Live browser QA submitted a real comment and evaluation update against the isolated API and observed immediate acceptance, revision history and read-only discussion; no backend responses were mocked for browser QA.

The final confirmation run passed all 57 cases on 2026-11-08 at 19:12 local time (24.45 seconds), after Docker recovered from its temporary-socket startup failure. All 145 migrations were already applied to the isolated test database; no pending migrations remained there. Nine nonessential workers were temporarily stopped with the user's prior authorization to reduce memory pressure. The later application rollout is recorded separately above.

These are focused suites, not a claim that every historical arbitration persistence fixture remains a specification for workflow 13 or that the entire repository test suite was executed.
