# Backend module boundaries and migration plan

Date: 2026-09-22

## Scope and ownership

| Module | Owns | May depend on |
| --- | --- | --- |
| `common/authorization` | Role-to-permission mapping and route guards | Shared user-role types |
| `communities` | Communities, membership, moderation, community audit events | Auth users, audit |
| `forum` | Posts, comments, votes, research-gap and paper references | Communities, gaps/papers by ID, audit |
| `recruitment` | Openings and applications | Projects, auth users, audit |
| `submissions` | Submissions, immutable manuscript revisions, reviewer assignments | Projects, auth users, PDF storage, audit |
| `workspaces` | Draft workspaces, sections, immutable section revisions, comments | Projects, auth users, audit |
| `ai-jobs` | AI run state machine and queue lifecycle | Projects, workspaces, BullMQ, audit |

Modules must call another module's exported service or shared scope helper instead of updating another module's collection directly. The only current exception is recruitment accepting an application, which atomically adds the accepted user to the linked project.

## Collections and critical indexes

The deployment creates these collections lazily through Mongoose. Production should build the listed unique indexes before exposing write routes.

- `communities`: unique `slug`; text index on `name` and `description`.
- `community_memberships`: unique `(communityId, userId)`; lookup `(communityId, status, role)`.
- `forum_posts`: timelines by community and research gap.
- `forum_comments`: timeline `(postId, status, createdAt)`.
- `forum_votes`: unique `(subjectKind, subjectId, userId)` for idempotent voting.
- `recruitment_openings`: `(projectId, status, createdAt)`.
- `recruitment_applications`: unique `(openingId, applicantId)` and status listing index.
- `submissions`: project timeline and author/status lookup indexes.
- `submission_revisions`: unique `(submissionId, revisionNumber)`; revision documents are never updated.
- `reviewer_assignments`: unique `(submissionId, reviewerId)` and reviewer worklist index.
- `draft_workspaces`: unique `projectId`.
- `workspace_sections`: `(workspaceId, order, createdAt)`.
- `section_revisions`: unique `(sectionId, version)`; snapshots are never updated.
- `workspace_comments`: `(workspaceId, sectionId, createdAt)`.
- `ai_runs`: owner timeline and project/status lookup indexes.

## Role migration

Existing `student`, `lecturer`, `researcher`, and `admin` values remain valid. The migration only expands the enum with `reviewer` and `moderator`; no existing account is promoted automatically.

1. Deploy shared types and backend schema support first.
2. Verify all existing user role values are in the six-value allowlist.
3. Assign `reviewer` and `moderator` only through the admin role endpoint.
4. Public registration remains restricted to `student`, `lecturer`, and `researcher`.

## Deployment order

1. Back up MongoDB and verify Redis connectivity.
2. Deploy shared role types and backend code with the new routes disabled at the gateway if a staged rollout is required.
3. Build unique indexes and resolve any duplicate memberships, votes, applications, workspaces, revision numbers, or reviewer assignments before index creation.
4. Start the AI consumer with `pnpm --filter backend worker:ai-jobs` before enabling AI-run creation. Until the consumer is running, queued jobs remain durable in Redis but do not execute.
5. Enable routes in this order: communities/forum, recruitment, submissions/review, workspaces, AI runs.
6. Run smoke tests for unauthorized, owner, project member, reviewer, moderator, and admin access.
7. Monitor duplicate-key conflicts, queue failures, PDF storage failures, and audit-log warnings.

## Backward compatibility

- Existing endpoints and collections are not renamed or removed.
- New roles only broaden the existing role union; old JWTs are safe because the auth middleware refreshes the current role from MongoDB on every authenticated request.
- New APIs are additive under `/api/v1`.
- Existing paper PDF storage is reused. Local and R2 storage providers therefore behave consistently for submission revisions.
- AI queue payloads contain only the run ID and allowlisted job type. Workers load authoritative inputs from MongoDB.

## Rollback

1. Disable the new routes and stop the `ai-jobs` worker.
2. Drain or retain the `ai-jobs` queue; do not delete queued jobs until rollback is confirmed.
3. Roll back the application binary. Existing collections can remain because older code does not reference them.
4. Revert users with `reviewer` or `moderator` to an older supported role before deploying a binary whose schema does not accept the new roles.
5. Do not drop new collections during the initial rollback. Restore the database backup only if new data must be fully removed.

## Security and data-integrity invariants

- Every write API uses a Zod allowlist and validates MongoDB ObjectIds.
- Resource-level ownership/project membership is checked in services, not only by global role.
- PDF MIME type is supplemented by `%PDF` magic-byte validation; SHA-256 records file integrity.
- Revision and section snapshot collections are append-only.
- Reviewer assignment rejects author/self, declared-user, and optionally same-institution conflicts.
- Reviewer views omit author identity and original upload filenames.
- Workspace updates require `expectedVersion`; stale writers receive HTTP 409.
- AI job types and inputs are allowlisted, and cancellation is persisted even if an active BullMQ job cannot be removed immediately.
