# Research workspace API contracts

Date: **2026-10-14**. Companion to the [repository audit](research-workspace-architecture-audit.md). **Sections 2 onward are proposed contracts, not implemented endpoints.** No OpenAPI/schema generation or runtime change is included in this audit.

## 1. Existing route inventory to preserve

All paths below have the `/api/v1` prefix. This is the relevant inventory, not a claim that every route already meets the proposed authorization policy. The audit findings apply to these implementations.

| Domain | Existing contracts | Source |
| --- | --- | --- |
| Project | GET/POST `/projects`; GET/PUT/DELETE `/projects/:id`; POST `/:id/archive`, `/:id/leave`, `/:id/transfer-ownership`; GET `/:id/activity` | [Project routes](../apps/backend/src/modules/projects/project.routes.ts), [DTOs/controller](../apps/backend/src/modules/projects/project.controller.ts). Current update is **PUT**, not PATCH. |
| Invitations | GET `/projects/invitations/mine`; GET `/projects/invitation-tokens/:token`; POST token `/accept` or `/decline`; POST `/:id/invitations`; POST `/:id/invitations/:invitationId/{accept,decline,cancel}` | Same routes. POST `/:id/members` is a legacy invitation adapter, not immediate membership creation. DELETE `/:id/members/:memberId` removes membership. |
| Project papers | POST `/projects/:id/papers`; PATCH/DELETE `/projects/:id/papers/:paperId` | Same routes. Current project detail embeds papers; the paginated research-list route proposed below is new. |
| Mentorship | GET/POST `/projects/:id/mentorships`; POST `/:id/mentorships/:relationshipId/{accept,decline,cancel,end}`; GET `/:id/available-mentors`; GET/PUT `/:id/mentorship-discovery`; POST `/:id/mentorship-offers` | [Routes](../apps/backend/src/modules/projects/project.routes.ts). Some legacy `relationshipId` actions resolve a request ID; retain the adapter rather than guessing entity type. |
| Academic support | GET `/projects/:id/academic-support`; POST `/:id/academic-support/guidance`; GET/PATCH `/projects/academic-support/preferences`; GET `/projects/academic-support/{mine,opportunities}` | Same routes; current guidance is an activity note, not version-pinned mentor feedback. |
| Contributions | GET `/projects/:id/contributions`; POST `/:id/contributions/proposals`; POST `/:id/contributions/:proposalId/{confirm,reject}` | Same routes and [service](../apps/backend/src/modules/projects/project-contribution.service.ts). |
| Chat | Mounted `/projects/:id/team-chat` and `/:id/chat`; history/send and GET `/events` SSE | [Team routes](../apps/backend/src/modules/projects/team-chat.routes.ts), [AI routes](../apps/backend/src/modules/projects/chat.routes.ts). No manuscript WebSocket endpoint. |
| Literature collections | GET/POST `/literature/corpora`; GET `/literature/corpora/:id`; POST `/corpora/:id/papers`; DELETE `/corpora/:id/papers/:paperId`; evidence-map route | [Routes](../apps/backend/src/modules/literature/literature.routes.ts). No general extraction-item editor or corpus-update route was found. |
| Gap analysis/validation | POST `/gaps/analyze`; GET `/gaps/analyze/{active,:id}`; POST `/gaps/analyze/:id/retry`; GET `/gaps` and `/validation-queue`; POST `/candidates`; PATCH `/:id`; POST `/:id/request-validation`; GET/POST `/:id/{evidence,validations}`; evidence-preview and direction routes | [Gap routes](../apps/backend/src/modules/gaps/gaps.routes.ts). Currently validation is not pinned to an immutable round packet. |
| Reports | POST `/reports` and `/reports/evidence-preview`; GET list/detail; PATCH `/:id/artifact-status`; DELETE single/batch | [Routes](../apps/backend/src/modules/reports/report.routes.ts). Keep job status distinct from artifact workflow. |
| Structured drafts | POST `/workspaces`; GET `/:id`; POST `/:id/sections`; PATCH `/:id/sections/:sectionId`; GET section `/revisions`; POST section `/comments`; PATCH `/:id/comments/:commentId` | [Routes](../apps/backend/src/modules/workspaces/workspace.routes.ts). Existing expectedVersion is section-level optimistic editing. |
| Outputs | GET/POST `/submissions`; GET `/:id`, `/:id/history`, `/:id/revisions`; POST `/:id/versions` (JSON Markdown/restore, expectedRevisionNumber); POST `/:id/revisions` (PDF multipart); GET `/:id/revisions/:revisionId/download`; GET `/:id/ai-pre-reviews`; POST `/:id/ai-pre-review` (202); PATCH `/:id/open-review` | [Submission routes](../apps/backend/src/modules/submissions/submission.routes.ts). Preserve uploaded PDF and report-to-submission paths. Deprecated direct assignment paths must not become a second review authority. |
| Formal review | GET/POST `/review-requests`, detail/reviewer candidates/external invitations; POST `/:requestId/{accept,decline,cancel,resubmit}`; GET `/reviews`, GET/PUT `/:assignmentId`, POST `/:assignmentId/submit`; template/version/publish/archive routes | [Review routes](../apps/backend/src/modules/reviews/review.routes.ts). GET/PUT `/review-availability/me` and opportunity/conflict routes remain useful. |

New project-scoped facades below delegate to these domain services. They do not duplicate membership, screening, version creation or review logic. Preserve existing 204 responses while adapters migrate; do not wrap an empty 204 in JSON.

## 2. Common proposed contract rules

### 2.1 Transport, identity and errors

- Prefix `/api/v1`; HTTPS in deployment; existing envelope `{success:true,data,meta?}` and `{success:false,error:{code,message,details?}}`.
- Canonical IDs are UUIDs; resolve accepted legacy Mongo IDs at the boundary. Cursor responses use canonical IDs. Nested IDs must be checked against their parent/project in the database.
- Use `requireAuth`, current session/account validation and academic onboarding for research work. No institution or verified-lecturer requirement for ordinary projects. Contextual mentor/reviewer operations add live eligibility and scope checks.
- Resource capabilities are **server-derived presentation hints**. Every operation reauthorizes. Client claims such as `isOwner`, `role`, `projectId` in a body, or `capabilities` grant nothing.
- Private responses: `Cache-Control: private, no-store`; avoid browser/CDN caching of content, grants and file responses. Public summaries have a separate allowlisted DTO.
- Validate bounded strict DTOs with existing Zod middleware. Services throw `AppError`; do not expose SQL, storage paths, private resource existence or TeX source in error details.

| HTTP | Proposed semantic code | Meaning |
| --- | --- | --- |
| 400 | BAD_REQUEST | Malformed input or unsupported enum/field; field details contain no private text. |
| 401 | UNAUTHORIZED | Invalid/expired/revoked session; web attempts normal refresh once. |
| 403 | FORBIDDEN | Known authorized resource, prohibited action or insufficient disclosure scope. |
| 404 | NOT_FOUND | Missing or inaccessible private resource; same response shape. |
| 409 | CONFLICT | Stale version, archived project, changed packet, duplicate command with different body, invalid transition. `details.reason` distinguishes these after access is established. |
| 413 / 415 | PAYLOAD_TOO_LARGE / UNSUPPORTED_MEDIA_TYPE | Upload/frame/document or format bounds exceeded. |
| 429 | TOO_MANY_REQUESTS | Rate/concurrency/storage budget; include Retry-After when meaningful. |
| 503 | SERVICE_UNAVAILABLE | Authority/durability/required dependency unavailable; do not report a saved edit. |

These codes are the proposed shared contract. Existing endpoint codes are adapted deliberately, not silently changed in the first slice.

### 2.2 Concurrency, idempotency and jobs

Mutable REST aggregates require a positive `expectedVersion`; successful mutation increments version. Existing submission commands keep `expectedRevisionNumber`; review commands pin expectedRevisionId and expectedRoundNumber. CRDT updates use the separate durable journal protocol in §8.

For nontrivial POST commands, require `Idempotency-Key` (opaque bounded identifier). Persist `(actorId, action, resourceId, key, requestHash, resultReference)` atomically with the domain effect/outbox. A repeated same request returns the prior effect after **fresh authorization**; a different body returns 409. Never replay cached private bytes to a removed member. Keep receipts for at least the documented retry window (initial proposal: 24 hours; immutable revision/run uniqueness persists longer).

Long work returns 202 with a persisted operation reference:

```json
{
  "success": true,
  "data": {
    "operationId": "60000000-0000-4000-8000-000000000001",
    "kind": "MANUSCRIPT_COMPILE",
    "status": "QUEUED",
    "statusUrl": "/api/v1/projects/10000000-0000-4000-8000-000000000001/operations/60000000-0000-4000-8000-000000000001"
  }
}
```

GET `/projects/:id/operations/:operationId` returns QUEUED/RUNNING/SUCCEEDED/FAILED/CANCELLED, timestamps, safe failure code, result reference and cancellation capability. This is a read facade over a persisted **domain operation** (AI job, CompileRun, export or snapshot request), not a new independently writable job-status table for every queue. POST `.../:operationId/cancel` requests cancellation; workers recheck before publishing. Queue completion alone is not domain success. Existing job APIs can remain adapters.

### 2.3 Authorization sequence

1. Resolve resource → canonical project and, if relevant, exact version/contextual grant.
2. Validate current account/session. Select project membership or a specific mentor/reviewer/admin packet grant; creator fallback applies only to personal resources without a project.
3. For writes, acquire locks in the [audit's order](research-workspace-architecture-audit.md#56-invariants-and-transaction-boundaries), recheck authority/lifecycle and compare versions inside the transaction.
4. Commit domain change, activity/audit metadata and outbox/operation intent together. Make no external storage/LLM/email call while holding those locks.
5. Deliver async results only after renewed authority and input-version checks. Mutations made before revocation remain attributed; revocation does not rewrite history.

## 3. Projects, navigation and membership

### 3.1 Workspace bootstrap

**NEW** GET `/projects/:id/workspace` is team-only bootstrap metadata, capabilities, counts and allowed destinations. It does not fetch every paper/manuscript or private AI conversation.

```ts
interface ProjectWorkspaceDto {
  project: {
    id: string; title: string; description: string;
    createdById: string | null; creatorProvenance: "RECORDED" | "ACTIVITY" | "UNKNOWN";
    ownerId: string; version: number;
    researchAreas: Array<{ id: string | null; label: string }>;
    status: "PLANNING" | "ACTIVE" | "ON_HOLD" | "COMPLETED" | "ARCHIVED";
    researchStage: "DISCOVERY" | "SCREENING" | "EXTRACTION" | "GAP_VALIDATION" |
      "DESIGN" | "WRITING" | "REVIEW" | null;
    visibility: "PRIVATE" | "PUBLIC";
    mentorshipDiscovery: "CLOSED" | "SEEKING_MENTOR";
  };
  membership: { role: "OWNER" | "MEMBER" };
  capabilities: Record<string, boolean>;
  sections: Array<{ key: string; href: string; count?: number }>;
}
```

Capability keys are an explicit shared allowlist, e.g. `project.manage`, `research.edit`, `manuscript.edit`, `output.publish`, `feedback.request`, `review.request`, `members.manage`, `project.export`. Do not return a pretend global project role to mentors/reviewers; their academic-support/assignment bootstrap contains only their scope. User-specific last-section preferences stay in local UI state or existing preferences and never affect authorization.

### 3.2 Commands and compatibility

| Path | DTO / result | Rule |
| --- | --- | --- |
| POST `/projects` (extend) | `{title,description?,researchAreas?,researchStage?}` → 201 workspace summary | Active, verified-email, onboarded USER/ADMIN acting as ordinary academic user; all academic personas; quotas. Owner and creator from actor. Default PLANNING/PRIVATE/CLOSED/DISCOVERY. |
| PUT `/projects/:id` (extend) | `{expectedVersion,title?,description?,researchAreas?,researchStage?,status?,visibility?}` → updated summary | Owner only. Lifecycle transitions explicit. PUBLIC requires a previously approved public-summary revision; no live-source disclosure. |
| POST `/:id/archive`, NEW `/:id/restore` | `{expectedVersion,reason?}` → updated summary | Owner; archive bumps access epoch and cancels pending work. Restore → PLANNING. |
| POST `/:id/transfer-ownership` (extend) | `{expectedVersion,userId}` | Owner; target current active member. One transaction; no orphan-owner interval. |
| POST `/:id/invitations` (reuse) | Exactly one `{userId}` or `{email}`, optional message | Owner; identity/email checks, hashed token and one live invite policy. Acceptance creates MEMBER only. |
| DELETE `/:id/members/:memberId` and POST `/:id/leave` (harden) | Expected version header or adapter command token | Current owner removes another member; member may leave archived project. Owner must transfer first. Revoke grants/streams/jobs in same policy transition. |
| NEW PUT `/:id/public-summary` | `{expectedVersion,title,summary,researchAreaLabels}` | Owner allowlisted publication; limit title 100, summary 2000, up to 10 labels of 120 characters. No member list, papers, source, evidence or file URIs. |
| GET `/projects/:id` (retain) | Team detail or public-summary DTO, depending on actor | Optional auth. PUBLIC means summary only. Unauthorized private read → 404; no mentor/reviewer shortcut to team detail. |

Retain current title/description bounds (100/5000) and legacy status/visibility inputs in compatibility adapters. `INVITE_ONLY→PRIVATE`, `PUBLIC_SUMMARY→PUBLIC`; old `researchField` maps to one area label. Reject conflicting simultaneous old/new fields. Return canonical fields from the new workspace endpoint; preserve legacy response shape until its clients migrate. Missing expectedVersion is allowed only for explicitly tracked old clients during a bounded migration window, using serialized writes and telemetry; require it for new clients immediately. Security gates are never optional for compatibility.

## 4. Research planning, literature and screening

### 4.1 Plan and questions

| NEW path | Contract |
| --- | --- |
| GET `/projects/:id/plan` | Current PlanRevision + plan version + question references, not arbitrary historical private content. |
| PUT `/projects/:id/plan` | `{expectedVersion,goal,approach,methodology,scope,protocol,changeSummary}` → 201 immutable PlanRevision/current projection. Owner/member. `approach` initially GENERAL, LITERATURE_REVIEW, SYSTEMATIC_REVIEW, EMPIRICAL or SOFTWARE_RESEARCH; labels are proposals. |
| GET `/projects/:id/plan/revisions` | Bounded paginated revision summaries; detail scoped to same project. |
| POST `/projects/:id/questions` | `{text,planRevisionId,sourceGapRevisionId?}`; owner/member human adoption. No automatic question creation from AI. |
| PATCH `/projects/:id/questions/:questionId` | `{expectedVersion,status,reason?}`, status DRAFT/ADOPTED/RETIRED; substantive text amendment creates a new linked question revision/provenance. |

Plan limits: goal 5000, methodology 20000, scope 5000 characters; approach-discriminated protocol with at most 20 inclusion/exclusion criteria of 240 characters and bounded PICOC/search fields. Store schemaVersion, not arbitrary executable JSON. Save adds a revision; draft edits do not retroactively change decisions that cite an earlier revision. `Project.inclusionCriteria/exclusionCriteria` become read/write adapters into this command while legacy clients migrate.

### 4.2 Corpus/screening commands

**NEW** GET `/projects/:id/papers?q=&screening=ALL|UNDECIDED|INCLUDED|EXCLUDED&sort=added_desc|year_desc|title_asc&cursor=&limit=30` returns paper rows, ProjectPaper ID/version, current screening, source availability and counts. Bound q to 200 characters and limit to 1–100; stable sort plus ID tie-breaker; opaque cursor bound to filters. Search uses indexed metadata and no LLM.

Keep POST/DELETE existing project paper paths. DELETE means removal from the active corpus, not hard deletion of evidence/review provenance; referenced ProjectPaper rows need a tombstone/retention policy before physical deletion. Collection add cannot include an excluded paper for gap generation by overriding `CorpusPaper.included`.

**NEW** POST `/projects/:id/papers/:paperId/screening-decisions`:

```json
{
  "expectedVersion": 4,
  "status": "INCLUDED",
  "planRevisionId": "20000000-0000-4000-8000-000000000001",
  "inclusionReason": "Addresses the adopted research question in the target context."
}
```

201 returns decision ID, current ProjectPaper projection/version and actor/time. EXCLUDED requires a permitted reason and a nonempty note for OTHER. INCLUDED preserves inclusionReason and clears only incompatible exclusion fields. UNDECIDED requires a reopening reason if superseding a decision. The service appends history and updates the current projection atomically. Concurrent stale decision → 409. A batch command can be added later with per-row expected versions; no silent last-writer-wins batch.

The existing PATCH paper path delegates screening changes to this service. Reading status and personal/shared notes are explicitly separate fields; do not fabricate historical decisions for old notes. GET `.../screening-decisions` exposes history and protocol pins to current team members.

## 5. Evidence, gap packets and questions

| NEW command | DTO / boundary |
| --- | --- |
| POST `/projects/:id/evidence` | `{projectPaperId,source:{fileId?,sourceKind,sha256,page?,locator},quote,interpretation?,planRevisionId?,replacesEvidenceId?}` → immutable item, DRAFT. SourceKind FULL_TEXT/ABSTRACT/USER_NOTE; USER_NOTE cannot be presented as an exact source quote. |
| POST `/:id/evidence/:evidenceId/verify` | `{expectedVersion,confirmation}` → VERIFIED assessment with actor/time. Human rechecks source; text/hash unchanged. Replacement item for substantive edit. |
| POST `/:id/extractions` | `{projectPaperIds,planRevisionId}` → 202 suggestions operation; existing knowledge/LLM workers reused. No source → explicit unavailable outcome. |
| POST `/:id/gaps/:gapId/revisions` | `{expectedVersion,title,description,scope,evidenceLinks,coverage,changeSummary}` → immutable GapRevision. Evidence links pin item IDs and SUPPORTS/COUNTERS/CONTEXT. |
| POST `/:id/gaps/:gapId/validation-rounds` | `{expectedVersion,gapRevisionId,expertIds,shareSummary,expiresAt}` → 201 sealed packet/round. Owner only. Server pins applicable quorum/policy, evidence and counterevidence coverage; grants named independent experts only the approved packet. |
| POST `/:id/gaps/:gapId/validation-rounds/:roundId/votes` | `{expectedRoundVersion,verdict,rationale,evidenceReferences}` → 201 vote revision. Assigned eligible expert, current grant, no team/author/mentor conflict under policy. Reuse GapValidation semantics. |

Proposed bounds: at most 100 papers per extraction, 100 evidence links/packet, 20 named experts; 20000 characters per quote/interpretation, 5000 for vote rationale. Tune from measured operations; preserve full documents through scoped FileObject references, not unbounded JSON bodies. Server verifies quote/hash/locator and all resources' project joins. AI suggestions do not become VERIFIED evidence or independent human votes.

Existing `/gaps/analyze` accepts current DTOs and remains the worker entry point. Its project-scoped adapter resolves the approved canonical corpus and pins the plan/evidence inputs. Existing candidate/evidence/validation endpoints must delegate to revision/round operations once migrated; never maintain both mutable votes and a separate new truth. Legacy unpinned votes remain labeled historical, excluded from new-round quorum. A new round cannot count an old vote automatically.

## 6. Coordination, mentorship and feedback

| NEW path | Minimal contract / permission |
| --- | --- |
| GET/POST `/projects/:id/tasks` | List or `{title,description?,assigneeId?,dueAt?,milestoneId?,resourceLink?}`. Owner/member; assignee must be current team member, links same project. |
| PATCH `/:id/tasks/:taskId` | `{expectedVersion,...,status?:TODO\|IN_PROGRESS\|DONE\|CANCELLED}`; history + assignment/due-date outbox, no automatic content authority from assignment. |
| GET/POST `/:id/milestones` | Bounded title/dueAt and lifecycle; no duplicate task status summaries writable by clients. |
| GET/POST `/:id/discussions` | Thread title and optional typed project resource link. Existing ProjectTeamMessage gets optional threadId. Old messages remain in a legacy general thread. |
| POST `/:id/discussions/:threadId/messages` | `{body,replyToId?}`; current team. Reuse team messaging persistence/delivery. Safe plain text/allowlisted markdown, no arbitrary HTML. |
| POST `/:id/discussions/:threadId/decisions` | `{messageIds,summary,resourceLink?}` → append-only decision; correction supersedes record. Does not itself approve external sharing. |
| POST `/:id/feedback-shares` | Owner approves immutable output/context packet: `{relationshipId,submissionRevisionId?,contextSnapshotIds?,scope,expiresAt}`. At least one pinned resource; no live query as share scope. |
| POST `/:id/feedback-requests` | `{shareId,questions,dueAt?}` → owner/member request on approved share; valid active mentor relationship. |
| GET `/:id/feedback-requests/:requestId` | Team and named currently eligible mentor see only packet and entries. Pending/ended relationship grants no current work access. |
| POST `/:id/feedback-requests/:requestId/entries` | `{body,anchor?}`; mentor and team participants within packet. Anchor is exact PDF page/quote or snapshot file/hash/range, never mutable editor offsets alone. |
| POST `/:id/feedback-requests/:requestId/{complete,cancel}` | Complete by assigned mentor; cancel by owner/requester under policy; terminal events retained. |

Defaults: task title 240, description 10000, message/feedback 10000 characters; paginated threads/entries. Ending mentorship or removing a member revokes pending work, not attribution. Existing broad-context relationships require migration inventory and explicit confirmation; new relationships share summary only. Mentor guidance is feedback, not formal-review submission. Contributions remain their existing confirmation workflow and move into Team in the UI.

## 7. Manuscript metadata and assets

**NEW** base `/projects/:id/manuscripts`:

| Method/path | Contract |
| --- | --- |
| GET/POST base | List or `{title,templateId?}` → 201 Manuscript metadata/version. Owner/member. Server allowlisted templates, no arbitrary URL fetch. |
| GET/PATCH `/:manuscriptId` | Metadata and entrypoint/manifest summary; changes require expectedVersion. Never REST-overwrite the live Yjs document. |
| POST `/:manuscriptId/imports` | Multipart ZIP → 202 validated import; creates a new draft/generation with explicit conflict handling. Existing nonempty manuscript cannot be silently replaced. |
| POST `/:manuscriptId/assets` | Bounded allowed PDF/PNG/JPEG uploads through FileObject intent/quarantine/validation; returns opaque fileId/hash. Attach through the authoritative file registry command. |
| POST `/:manuscriptId/collaboration-tickets` | `{mode:EDIT}` → short-lived single-use room/session-scoped ticket, endpoint and protocolVersion; no query-string access JWT. See ADR for handshake. |

File paths use a server-normalized relative namespace, reject traversal/UNC/drive paths, symlinks, duplicate canonical paths, nested archives and forbidden file types. The initial editor represents the whole textual file tree in one Y.Doc; binary assets are immutable file references with a server-owned availability/quarantine registry. A CRDT reference to an unauthorized/missing asset cannot make it readable, compilable or exportable.

## 8. Collaboration, snapshots and compilation

The [LaTeX ADR](adr/0001-collaborative-latex.md) defines the proposed gateway. This protocol is a design requirement for the prototype, **not an assertion that default Hocuspocus supports database acknowledgements**.

- WSS room identity: canonical project + manuscript + generation; grant bound to user/session/access epoch. Authorize before room load/sync/presence. Protocol frames are bounded; query parameters contain no bearer credentials.
- Client updates carry a resumable `clientSessionId`, monotonic `clientSequence` and binary Yjs update. Server journals canonical update ID/hash/sequence in PostgreSQL, scoped to the manuscript generation, then sends a **durable receipt**. All client/server sequences and minimum snapshot sequences use canonical nonnegative decimal **strings** in JSON (PostgreSQL bigint range; no leading zeros except `"0"`), avoiding JavaScript precision loss. Generation and bounded REST row versions remain integers.
- Receipt: `{kind:"persisted",generation,clientSessionId,throughClientSequence,throughServerSequence}` only after all covered updates committed. Duplicate updates are safe. A provider “synced” event is not a durable receipt.
- User indicators: local edits → Syncing; all local edits durably acknowledged → Saved; failure → Unsaved/offline. No persistent offline store in the initial release; retain memory buffer while open and warn on navigation with unsaved edits. Reconnect checks membership before resending any buffered edit.
- Removal/archive/session expiry closes rooms; short authorization lease covers missed revocation messages. Initial proposed maximum lease: 15 seconds, with immediate event-driven eviction. No new update commit may rely on an expired lease; transactions recheck access. An authority outage freezes editing and delivery rather than extending the lease.

| NEW path | Contract |
| --- | --- |
| POST `.../:manuscriptId/snapshots` | `{expectedGeneration,minimumDurableSequence,label?}` → 202 snapshot operation. Snapshot pins a coherent committed server sequence, full binary-state hash, sorted file manifest, asset hashes and entrypoint. Server may include later committed edits but returns the **exact** pinned sequence. It never snapshots unacknowledged local edits. |
| GET `.../:manuscriptId/snapshots/:snapshotId` | Immutable manifest/hash/toolchain inputs; source view/export is separate from PDF-only grants. |
| POST `.../:manuscriptId/compiles` | `{snapshotId,engine:PDFLATEX\|XELATEX\|LUALATEX,toolchainId}` → 202 CompileRun. Server allowlist may initially expose only PDFLATEX. Pin image/package/font/policy digests. |
| GET `.../:manuscriptId/compiles/:compileRunId` | QUEUED/RUNNING/SUCCEEDED/FAILED/CANCELLED, sanitized diagnostic entries and safe private preview reference; no host path or secrets. |
| GET `.../:manuscriptId/compiles/:compileRunId/pdf` | Authorize exact artifact; stream private bytes or issue very short-lived capability URL. PDF-only grant never implies source access. |

At most one active compile per manuscript initially; dedup identical snapshot/toolchain/policy; new edits do not auto-compile on every keystroke. Compile timeouts are terminal safe failures, retries use identical immutable inputs and never enable shell escape/network. Recheck scope before publishing PDF; completed but unauthorized work is not delivered. A cancelled/archived project cannot seal a new output.

## 9. Existing outputs and formal review bridge

**NEW** POST `/projects/:id/manuscripts/:manuscriptId/output-versions`:

```json
{
  "submissionId": "30000000-0000-4000-8000-000000000001",
  "expectedRevisionNumber": 2,
  "snapshotId": "40000000-0000-4000-8000-000000000001",
  "compileRunId": "50000000-0000-4000-8000-000000000001",
  "summary": "Clarify methods and address the previous review."
}
```

201 returns the **existing SubmissionRevision** ID/number, source snapshot, successful compile/PDF SHA-256 and immutable research-metadata snapshot. Optional submissionId is allowed only for the first version, when the same transaction creates the one output root linked to this manuscript. First response has revisionNumber 1; later commands require existing root and expectedRevisionNumber. No OutputVersion table or independent version counter. Owner/member may create a sealed private version; owner separately approves disclosure/publication/review. All references must belong to the same project/manuscript; the PDF hash must match the successful run. Restoring old source/output always creates a new snapshot/revision, never overwrites a reviewed one.

**EXTEND** POST `/review-requests` with `expectedRevisionId` (for submissions) and idempotency. Keep existing submissionId-or-reportId, reviewerId, templateVersionId, message and dueAt contract. Owner alone approves external request; use current review admission/cooldown/capacity/template checks plus mentor conflict policy. Pin the exact immutable output; a concurrent new version causes 409 instead of reviewing an unexpected version. Existing report conversion must seal equivalent metadata/source once, through the same service.

**HARDEN** PUT `/reviews/:assignmentId` and POST `/reviews/:assignmentId/submit`: require expectedRevisionId/expectedRoundNumber for new clients, use current structured responses/required revisions, reject team/authorship/mentor conflicts and stale assignment generation. Submit creates immutable HumanReview + outbox. Owner/member cannot read the reviewer's draft. Resubmission uses existing POST `/review-requests/:requestId/resubmit`, verifies required responses and pins a **new** SubmissionRevision/round. The assignment's current pointer may move; older submitted HumanReview rows keep their exact pins.

Reviewer bootstrap/download resolves the accepted assignment and packet; no ordinary GET project-workspace or live manuscript access. Expiry, cancellation, loss of eligibility and retained-history grants follow one deliberate policy, not creator/admin shortcuts.

## 10. Export, administrative grants and acceptance

**NEW** POST `/projects/:id/exports` accepts `{scope:"PROJECT"|"MANUSCRIPT_SOURCE"|"OUTPUT_PACKET",resourceId?,revisionId?}` → 202 private bounded export. Team source export and mentor/reviewer PDF packet export are different scopes. Worker pins manifest/hashes and rechecks current authority at request, assembly, publication and download. Exclude private AI chat, verification evidence, unreleased review drafts and secrets. GET export download issues no permanent public link; initial bundle expiry 24 hours.

Purpose-bound AdminAccessGrant is managed through the existing admin authorization area, not self-service project endpoints. Proposed request includes resource IDs, READ_CONTENT or EXPORT_PACKET scope, purpose, expiry and independent approver. Requester cannot approve their own grant. Privileged step-up and grant-use audit are release requirements; default metadata administration does not reveal private source. Admin grants do not allow academic edits, ownership transfer or formal-review decisions.

Every slice must test: outsider/nested-ID substitution, removed member and stale token, archived writes, owner transfer, contextual grants, generic admin denial, idempotent replay after revocation, stale version and transaction races, source-versus-PDF permissions, pagination/deep-link compatibility and sensitive payload redaction. Database/race tests run only on isolated disposable PostgreSQL. See the [implementation gates](research-workspace-implementation-plan.md).
