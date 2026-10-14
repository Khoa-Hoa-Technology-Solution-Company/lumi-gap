# Research workspace implementation and migration plan

Date: **2026-10-14**. **Future implementation plan only.** This audit applies no migrations, modifies no runtime feature and makes no deployment claim.

Read the [audit](research-workspace-architecture-audit.md), [contracts](research-workspace-api-contracts.md) and [LaTeX ADR](adr/0001-collaborative-latex.md) together. Each slice below has an independent acceptance gate. Feature flags govern release, never whether authorization is enforced.

## Delivery rules

- Work in the existing modular Express/React/PostgreSQL application. New socket/worker processes are justified by execution needs; no wholesale framework rewrite.
- Preserve current unrelated working-tree changes; do not auto-commit, push, reset or apply migrations to the user's database. A feature implementation may write reviewed SQL/schema files and rehearse them on an explicitly disposable database.
- Before a persistence change, read the applicable specs and [migration rules](prisma-migrations.md). Handwrite additive SQL. Never use `prisma migrate dev`, edit applied migration checksums or drop existing SQL-only FKs/vector/full-text indexes.
- Dependencies/packages and infrastructure changes must follow repository approval conventions. This document does not itself authorize vendor purchases, production deployment or new repository-root scaffolding.
- Use strict Zod DTOs, thin controllers, `AppError`, shared framework-agnostic types, `createRateLimiter` and existing LLM/user-AI routing. AI calls stay user-initiated async work.
- Small releases first: shadow comparisons, explicit backfill conflicts, one writer authority, compatibility reads, reversible UI routing. Do not dual-write two independently meaningful screening/version/permission models.

## Verification baseline

The following existing suites were actually run during this audit: **10 files, 66 tests passed**.

```powershell
pnpm --filter backend exec vitest run src/modules/projects/__tests__/project-workspace.rules.test.ts src/modules/projects/__tests__/project-mentorship.rules.test.ts src/modules/projects/__tests__/project-contribution.rules.test.ts src/modules/gaps/__tests__/gap-validation.rules.test.ts src/modules/gaps/__tests__/gap-evidence.test.ts src/modules/reviews/__tests__/academic-review.rules.test.ts src/modules/reviews/__tests__/review.rules.test.ts src/modules/reports/__tests__/artifact-status.rules.test.ts src/modules/projects/__tests__/project-team-chat.events.test.ts src/modules/projects/__tests__/project-chat.events.test.ts
```

This establishes only their isolated rule/event behavior. It does not certify authorization across services, migrations, persistence/races, browser behavior, provider integrations or compiler security. The source-confirmed defects in the audit remain unfixed in this documentation task.

Persistence suites inspected but not executed include project workspace, mentorship and peer-review database flows. They use the configured Prisma connection and mutate data. Future execution requires a disposable PostgreSQL/pgvector database, isolated Redis/storage, explicit fixture guard and no production credentials/provider side effects. Full build/typecheck and destructive/load/security tests were not run by this audit.

## Dependency-aware slices

IDs below are implementation slices, not mandatory one-commit packages. Split a slice again if it cannot be reviewed safely. Database batches M00–M08 are defined later.

| Slice | Depends on | Deliverable | Principal files / boundaries | Gate and rollback |
| --- | --- | --- | --- | --- |
| S01 Resource access repair | Audit | One resource-policy vocabulary; project membership precedes creator/author/draft membership; archive guards; remove ambient admin content bypass | `modules/authorization`, projects/workspaces/literature/gaps/reports/submissions services, downloads; focused backend tests | Cross-project, outsider, removed creator and generic-admin denial; personal resources still accessible to their owner. Disable affected private feature on failure; never roll back to a known bypass. |
| S02 Admission and project authority | S01 | Affiliation-independent onboarding, canonical owner/creator/stage/version, public-summary compatibility; M01 | auth DTO, research-access service, academic profiles, project controller/service/rules, shared project types | All three personas create without institution; incomplete onboarding denied by API; transfers serialized; no automatic publication. Roll back reads via adapter, preserve added data. |
| S03 Delivery and revocation foundation | S01, S02 | General outbox/idempotency, access epoch, session/member eviction, bounded SSE recheck/reconnect; M02 | infrastructure queue, project event hubs/controllers, notifications/worker, session revocation | Duplicate/lost jobs recover; DB commit+outbox atomic; removed user stops receiving; two API instances tested before scale-out. SSE can fall back to authorized polling. |
| S04 Private file registry | S01, S03 | FileObject/intents, scoped downloads, safe import/export limits, retention/GC; M02 | PDF storage adapter, submissions/knowledge file paths, new file service, download controller | Nested file substitution denied; no public path/URI bypass; interrupted upload/retry/orphans; referenced revisions survive GC. Keep legacy scoped PDF reader until old metadata mapped. |
| S05 Plan and questions | S02, S03 | Versioned plan/protocol and human-adopted questions; M03 | new planning domain within research modules, project DTO adapters, shared types, web Research/Plan | Concurrent edit →409; no duplicate writable criteria/methodology; decisions keep older protocol pin. Flag off editing, retain revision reads. |
| S06 Workspace navigation | S01, S02; S05 for Plan UI | Seven destinations, nested Research, capability bootstrap and old-link redirects | web project detail/shell/section nav, project-workspace-navigation utility, routes, locale files | Existing eight tab keys, paper reader query/scroll and review links survive; direct route unauthorized states; keyboard/mobile/reduced motion and pure white theme. Route rollback uses the same domain APIs. |
| S07 Corpus and screening | S01, S03, S05 | Inclusion-reason fix, canonical ProjectPaper screening, append-only decisions, collection conflict workflow; M04 | project service, literature service, gap-corpus/eligibility, shared DTOs, literature workspace | Persisted INCLUDED rationale regression; concurrent decision/removal races; no excluded paper promoted by collection; conflict report resolved. Roll back new UI, retain canonical writer/history. |
| S08 Evidence and gap rounds | S04, S05, S07 | Immutable evidence/provenance, GapRevision/ValidationRound and named expert packet grants; M05 | knowledge ingest, structured-evidence, gaps/validation services/rules/worker, forum reference adapters | Exact quotes/hash survive reindex; source kind clear; changed packet never reuses old quorum; outsider, team and mentor COI denied; personal gaps retain separate behavior. Disable external rounds independently. |
| S09 Coordination | S02, S03, S06 | Tasks/milestones, threaded messages and recorded decisions; M06 | projects team-chat/contribution modules, notification renderers, new task/discussion components | Assignee/link scope, removal, mentions/digests, message history and accessibility; existing chat readable. No standalone fork of forum or contribution truth. |
| S10 Academic support and review hardening | S01, S03, S04, S08; S06 for UI | Version-pinned mentor feedback/sharing, owner disclosure gate, mentor conflict, retained-history policy; M06 | mentorship context/service, review admission/request/service, submissions; support components | Summary-only new relationships, end/revoke denies work, current owner can manage request after transfer, immutable round pins and private reviewer drafts. Disable new sharing, retain consent/history. |
| S11 Writing durability prototype | S01–S04; ADR | Proof-only CM6/Yjs gateway + PG journal/receipt/checkpoint and coherent snapshot; first M07 draft | proposed manuscript service/gateway/worker under apps/backend, small web editor prototype, shared protocol | Crash/reconnect, stale writer fence, custom receipts, no false Saved, causality/manifest and authority races. Private test only. No public compiler. |
| S12 Native source editor | S06, S11 | Supported editor, file tree/import/assets, presence, history and snapshot UI; M07 | web manuscripts feature and source protection, backend manuscript commands, i18n boundaries | Two-client convergence, reserved metadata validation, keyboard/responsive panes, unsaved navigation and no DOM translation changes. Flag off to scoped source export/read. |
| S13 Isolated compiler and preview | S04, S11, S12 | Immutable CompileRun, pinned trusted toolchain, disposable runtime, bounded private PDF/diagnostics; M07 | new compile worker/orchestrator, validated env, queue/limits, PDF viewer; separately reviewed infra | ADR sandbox abuse suite, hash agreement, timeout/cancel, no network/secrets/host socket, cleanup/quotas; no public enablement on stock-container claims. Source editor/export can remain usable. |
| S14 Output/review bridge | S10, S13 | Manuscript snapshots seal existing SubmissionRevision; exact PDF/source/research metadata pins; M08 | submission service, review request/service, shared revision contracts, manuscripts output view | Same-project/run/snapshot checks, expectedRevisionNumber races, source restore as new version, mentor and review isolation, legacy uploaded PDF/report flows pass. Stop new seals; retain old downloads/reviews. |
| S15 Release rehearsal | All enabled slices | Isolated migration/restore, access/load/sandbox/accessibility acceptance and operational runbooks | test fixtures, migration scripts/docs, observability/config, feature flags | Measured gate signoff; production rollout is a separate explicit action. Read/export fallback tested; retained immutable data remains accessible under policy. |

S09 can proceed alongside research feature work after its prerequisites. S11 can start without all research UI being complete, but cannot bypass access/files/delivery foundations. S10's policy tests can begin earlier; live feedback awaits immutable packet storage. The slice table gives dependency options, not permission to expose unfinished branches.

## Database migration plan

### M00 — Inventory and rehearsal, no production writes

1. Record applied migration IDs/checksums, PostgreSQL/pgvector version, SQL-only FKs/checks/indexes/defaults, row counts and orphan/duplicate counts using read-only queries in the approved environment. Source schema alone cannot establish live state.
2. Enumerate actual legacy ownership transfers, duplicate OWNER mirrors, invalid/expired invitations, draft members outside current project membership, creator/author-only access, existing mentor context exposure, project/corpus screening conflicts and missing provenance. Report IDs/counts securely; do not paste academic text or personal evidence into public artifacts.
3. Use an isolated migration replay harness. The historical `20260924000600_legacy_email_verification_recovery` migration reads `_prisma_migrations`; account for its documented shadow-replay limitation without modifying its applied checksum. Test both a real restore/upgrade and the supported bootstrap path; do not claim generic shadow replay works today.
4. Take/restore a consistent baseline backup and verify representative private source/PDF hashes. Never use test cleanups against the user database. Stop if target identity is uncertain.

### M01 — Project identity, version and admission

Proposed additive fields: `Project.createdById` nullable; `creatorProvenance` RECORDED/ACTIVITY/UNKNOWN; positive `version`; nonnegative `accessEpoch`; nullable `researchStage`. Research-area labels/IDs can use a bounded ProjectResearchArea join if multiple areas are required. No second writable methodology field; ResearchPlan owns it.

- Preserve current lifecycle strings and established visibility strings in storage initially. Map visibility at the DTO boundary. A later normalized storage change requires old clients/writers to be migrated first; no automatic private-content publication or SQL blanket visibility widening.
- Preserve `ownerId` as authority. Reconcile OWNER mirrors to actual owner, not vice versa. Partial unique active-OWNER mirror index can constrain compatibility rows; it cannot replace project ownership. Add owner existence/participation invariant in the transfer service and checked transactional repair.
- New records set creator from actor with RECORDED provenance. Backfill earliest **reliable creation activity** only when it identifies creation; never infer it merely from earliest remaining activity or current owner. Unknown stays null/UNKNOWN. Retain provenance and migration origin.
- Project update/access epoch changes are monotonically incremented in transactions. Archive status/archivedAt consistency is validated after anomaly review, not by an unconditional timestamp rewrite.
- Affiliation fix is primarily DTO/service work. No fabricated Institution or VERIFIED status for unaffiliated users. Enforcing server onboarding requires auditing/migrating genuinely completed legacy profiles, with user remediation for unknowns rather than treating client state as proof.

### M02 — Outbox, idempotency, grants and FileObject

Add `DomainOutboxEvent` (event ID, aggregate/type, version, bounded IDs-only payload, occurredAt, availableAt, dispatch state/attempts/lease) and a unique domain event key. Index pending availableAt/ID, aggregate history and stale leases. Dispatcher claims bounded batches, enqueues deterministic BullMQ keys, then marks dispatched; a crash at either step may duplicate but cannot lose the intent.

Add command receipts unique by actor/action/resource/key with request hash and result reference, expiry and effect timestamps. Existing notification eventKey remains delivery dedup; do not migrate it into a second business-state authority. Keep specialized notification recovery while new producers move to the general outbox.

Purpose-bound `AdminAccessGrant`: requester, distinct approver, exact project/resource/scope, purpose, expiresAt/revokedAt and grant-use audit. Constraint `approver != requester`, bounded lifetime, one explicit subject/scope policy, no public wildcard grant. Implement step-up/approval workflow or keep admin private-content access denied; a new table alone is insufficient.

`FileObject`: opaque ID, project or explicit personal owner scope, storage backend/key, SHA-256, MIME, bytes, validation/quarantine state, upload intent, timestamps and retention/hold metadata. Store no permanent public download URL. Existing URI values stay private adapter internals.

- Backfill SubmissionRevision files by known submission→project ownership; verify metadata/hash before claiming VERIFIED. Do not fabricate checksums for files not read. Existing missing objects remain explicit unavailable records with recovery status.
- Shared hash dedup must not expose cross-project object existence. Authorize reference creation/download by scoped records; content-addressed keys alone grant no access.
- File upload intent precedes remote object writes; finalize/reconcile after verification. Orphan GC must honor all source/version/review references and holds. Object deletes are retryable intents; no cascading database delete should erase the only record needed for cleanup.
- Keep old scoped PDF downloads working while mapping is incomplete. No unguarded `/uploads` static alias or global bucket ACL switch.

### M03 — Plan and questions

Add ResearchPlan (unique project, current revision pointer/version), PlanRevision (unique plan + revision number, immutable goal/approach/methodology/scope/protocol/schemaVersion/hash/actor/time), and ResearchQuestion with adoption/provenance and revision/supersession history.

- Move project criteria into an initial migration-origin revision, preserving exact values and unknown author/time. Corpus PICOC/goal/search strategies may disagree across collections: preserve each source and ask which plan to adopt; never select the newest silently.
- No LLM-generated suggestion is backfilled as human-adopted. Submission questions/methodology remain part of historical output content; do not retroactively point them at a new live plan as if that were their original source.
- Add current pointer FKs only after seed revision rows exist; compare old/new reads, then route legacy criteria writes through the plan service. No independently editable criteria arrays remain once canonical writing switches.

### M04 — Screening authority and history

Add ProjectPaper `version`, nullable `currentDecisionId`, active/removal tombstone metadata if provenance references must survive, and append-only ScreeningDecision (projectPaper, decision/version, status, reason/note, actor/date, PlanRevision, supersedes ID, origin).

- Existing `ProjectPaper.id` and `(projectId,paperId)` uniqueness remain. Paper re-add reactivates the same retained identity under explicit history rules rather than creating a conflicting pair.
- Backfill current decisions only with recorded status/reason/actor/date, clearly `origin=LEGACY_CURRENT_STATE`; unknown protocol/actor remains unknown. Do not invent the sequence of past decisions from timestamps.
- Fix actual inclusionReason service overwrite before changing the writer. Already-lost text cannot be recovered by migration unless reliable historical activity/backup proves it; report unknown rather than generating a rationale.
- Audit every project collection. If ProjectPaper and CorpusPaper disagree, keep ProjectPaper current screening, mark collection eligibility unresolved and show owner remediation. Corpus-only papers can be proposed for project addition as UNDECIDED; never silently become INCLUDED.
- Keep `CorpusPaper.included` semantics for personal non-project corpora. For project corpora, derive eligibility from ProjectPaper and collection membership; maintain deprecated fields only as compatibility projections, never independent write input.
- Replace recency-selected corpus authority in gap-corpus with explicit approved project source/collection input. Shadow-check included/evidence counts before switching gap generation. Do not broaden an active analysis's inputs mid-job.

### M05 — Evidence and gap validation packets

Add immutable EvidenceItem payload/source hash/locator/quote and human assessment/supersession history; GapRevision; immutable gap-evidence links; ValidationRound containing a sealed revision/packet/coverage/quorum-policy snapshot; named packet grants. Extend existing GapValidation with nullable round reference and vote supersession/sequence metadata.

- Reuse existing GapEvidenceRecord/forum provenance as import references; records missing source/hash/quote remain LEGACY/UNVERIFIED, never magically VERIFIED. Full-text, abstract-only and user note sources stay distinct.
- A new validated item survives knowledge chunk replacement via source hash, quote/location and archived source/extraction revision. Live chunk FK can be nullable; provenance cannot depend solely on a deletable chunk row.
- Existing gap votes are historical/unpinned unless an actual exact packet can be proven. Do not retroactively assign them to today's gap text or count them in a new round.
- Round↔gap-revision↔evidence joins require same project; named expert independence, current eligibility and grant expiry are enforced in service/transaction. Quorum policy ID/version is stored with the round, not recomputed from changing global settings.
- Existing broad expert-discovery consent needs an explicit migration communication/policy. New project rounds use owner-approved named packets. A changed gap starts a new revision/round; old round records remain immutable history.

### M06 — Coordination and academic feedback

Add Task/Milestone, DiscussionThread/Decision, optional threadId on existing ProjectTeamMessage, FeedbackRequest/Entry and an immutable feedback share/packet grant. Do not duplicate ProjectTeamMessage into a separate project forum.

- Backfill legacy messages into an explicit general thread or support null as the legacy thread, preserving IDs/order/author/time/read receipt behavior. No interpretation of arbitrary old messages as project decisions.
- Assignee and resource links use stable IDs resolved inside project boundaries; removed users retain attribution and no active assignment authority. Reassignment is an explicit event, not historical user replacement.
- Existing mentor guidance activity remains historical notes. Do not claim it reviewed a particular output version. Existing context grants are inventoried; new feedback shares reference immutable context/output IDs with expiry. Ended relationships keep attribution and revoke work scope.
- Current mentor-as-reviewer policy and prior owner request-management access require deliberate service migration/negative tests; no role enum changes or automatic mentor membership rows.

### M07 — Manuscripts, journal, snapshots and compiles

Add Manuscript (project, title, generation, metadata version, current checkpoint reference), ManuscriptCollabState (binary checkpoint/hash/server sequence), ManuscriptUpdate (binary/hash/client session+sequence/server sequence/generation/actor/time), ManuscriptSnapshot (immutable generation/sequence/state hash/file manifest/entrypoint/creator), CompileRun (snapshot, pinned engine/toolchain/policy, operation/claim state, output FileObject/hash, diagnostics).

- Unique journal keys: `(manuscriptId,generation,serverSequence)` and `(manuscriptId,generation,clientSessionId,clientSequence)`. Duplicate envelope hash must agree. Persist checkpoint and receipt sequence semantics; reject stale generation/writer fences. Index replay from checkpoint and pending operation claims. Store sequences as PostgreSQL bigint and encode them as canonical nonnegative decimal strings in the JSON protocol, as specified in the API contracts; never round through a JavaScript Number.
- No plaintext authority parallel to binary state; checkpoint and journal are storage/recovery representation, snapshot is immutable source, SubmissionRevision is the human output version. Pin canonical hash encoding/algorithm/schema version for manifests.
- File manifest references only validated authorized immutable objects. Snapshot-ready state commits after all staged objects exist; compile cannot claim incomplete source. CompileRun success means verified PDF stored and referenced, not merely process exit 0.
- No automatic conversion of DraftWorkspace to LaTeX: explicit import preserves source section revisions and labels generated TeX. No fabricated historical collab events. Existing structured draft API remains available under repaired project authorization.
- Compaction deletes only journal safely covered by a verified durable checkpoint and retention/backup policy. Snapshots/output refs are protected. Rollback disables source writes, retains source export and last valid snapshots.

### M08 — Extend existing output versions, protect history

Add optional manuscript linkage to Submission (at most one output root per manuscript initially), optional snapshot/compile/file references plus immutable research/author metadata and manifest hash on SubmissionRevision. Uploaded PDFs and report/Markdown outputs may legitimately have null manuscript/compile refs.

- Unique `(submissionId,revisionNumber)` stays canonical. Enforce one successful compile belongs to the referenced snapshot/manuscript/project through composite FKs/checks where applicable and transaction resolution. A standalone referenced UUID is insufficient to establish consistency.
- Existing nullable revision pins in review requests/assignments are backfilled only from provable historical records. Unresolved historical cases are flagged; never point all old reviews at currentRevisionId. Submitted HumanReview content/revision/round/template pins are immutable; current assignment/request pointers remain mutable on valid resubmission.
- Protect sealed revision payload/hash/file refs and submitted reviews with database permissions/triggers or an equivalently enforceable append-only write interface, reviewed against current legitimate metadata/status updates. Do not blanket-freeze entire assignments or all draft review rows.
- Restrict deletes of referenced immutable outputs. Account/privacy deletion uses retained attribution/pseudonym policy, holds and auditable erasure workflow; do not cascade-delete academic review history by accident.

### Constraints, indexes and rollout common to all batches

1. Update `apps/backend/prisma/*.prisma` plus handwritten timestamped migration SQL together. Document constraints that remain SQL-only. Use explicit FK delete actions: RESTRICT/NO ACTION for academic provenance; SET NULL only for genuinely optional live pointers, retaining historical payload.
2. Index all access joins (project/member status), parent/list pagination, outbox claims, pending jobs and retained-file references. Add composite keys/FKs when redundant project/manuscript references must agree; for polymorphic links use the repo discriminator + targetId pattern and enforce allowed scope via trusted service/trigger rather than nullable ID per type.
3. Add new nullable columns/tables first. Backfill in bounded resumable ID batches with dry-run counts, progress/cursor, idempotency and origin; keep per-batch transaction time short. Avoid assuming that ALTER TABLE default/backfill costs are free at production scale.
4. Add check/FK constraints NOT VALID where appropriate, repair anomalies, then VALIDATE. Unique indexes require actual duplicate cleanup and, for large live tables, separately managed concurrent creation. Document transaction limitations and failure recovery for `CREATE INDEX CONCURRENTLY`; do not hide it in an incompatible migration transaction.
5. Enforce positive versions/sequences, bounded enum strings, referential same-project invariants, terminal-state consistency and uniqueness. Dynamic membership/expiry/conflict checks remain service authorization inside transactions; static FK checks do not establish current permission.
6. Ship compatible reader → canonical writer → backfill/compare → new reader → validate constraints → remove compatibility writes. Shadow counts/hashes must match or surface explicit unresolved legacy records. Only later, separately reviewed contraction removes old columns/statuses/routes.
7. Roll back application readers/feature flags without dropping captured history. After a canonical writer has produced new data, do not reactivate an old writer that cannot preserve it; use read-only/export fallback or a forward repair. Security repairs stay enforced.
8. Rehearse old-client/new-server and new-client/old-data behavior; capture row/count/hash and constraint/index inventories before/after. Confirm foreign keys, vector index, search indexes and migration checksums survive. Production execution is a separate approved deployment step.

## Operational and release acceptance

| Area | Concrete acceptance evidence |
| --- | --- |
| Authorization | Full matrix for owner/member/mentor/reviewer/outsider/admin, every nested resource and download/export, removed creator/author, archive and role/verification/session change. No tests relying only on hidden UI buttons. |
| Transactions | Controlled two-connection races for transfer/removal/archive versus screening/save/review submit; version conflicts and documented lock order, no external work under locks; deadlock/retry behavior. |
| Research integrity | Lost-inclusion-rationale regression, history/protocol pin, collection conflicts, exact quote/hash, abstract labeling, human adoption, changed gap packet and independent quorum/counterevidence coverage. |
| Async | Crash after domain commit/before enqueue, after enqueue/before dispatch mark, duplicate worker delivery, stale lease, cancelled/revoked result and credit/refund idempotency. Notifications contain minimal data and dedup correctly. |
| Writing | ADR durable receipts, two-client edits, missing dependencies, rejected update, stale generation, reconnect, compaction and coherent multi-file snapshot. No false Saved indication. |
| Sandbox/storage | Malicious TeX/ZIP/PDF/paths, no network/secrets/host socket, quotas/cleanup, no cross-project file reads, short download URL TTL and retained refs protected from GC. |
| Review | Exact sealed output/metadata/template/round, private draft feedback, mentor conflict, owner transfer, revision responses and historical grant rules. Uploaded PDF and generated report compatibility. |
| UX/localization | Seven destinations, old links/query/reader state preserved, keyboard/focus/touch targets, source outside DOM translation, #FFFFFF light canvas, restrained accents, responsive panes and reduced motion. |
| Recovery/performance | Reconstruct acknowledged edits and retained output hashes; measured backup RPO/RTO; Redis loss; fenced gateway restart; socket heap, journal/write rate, compile queue/cost and quotas. |

Before any production rollout: deploy expanded schema compatibly; enable per-slice flags for internal fixtures; canary limited projects; monitor denied-access anomalies (metadata only), outbox age, queue/compile delay, save/receipt latency, file cleanup and recovery. Use explicit thresholds based on prototype measurements. Disable the new command path on integrity failure, preserve committed data and investigate. No estimated production capacity/hosting price is asserted by this audit.

## High-risk decisions carried into implementation

The [audit decision register](research-workspace-architecture-audit.md#14-high-risk-decisions-still-needing-productoperations-confirmation) remains authoritative. Unresolved policies are not silent permission expansions. Defaults: PUBLIC summary only; no former-member live access; named immutable mentor/expert packets; current mentor conflict in formal review; owner approval for external disclosure; all onboarded academic personas can create unaffiliated; native writing stays private until durability/sandbox/restore gates pass. The implementer must record any deviation, its owner and migration impact before changing a contract.

## Concrete incremental feature prompts

Execute one prompt at a time. Each prompt inherits repository instructions, the three companion docs, no auto-commit/push, no production data changes and no destructive migrations. Produce a focused diff, tests actually run, migration/rollback notes and remaining limits.

1. **Resource authorization:** “Implement S01. Trace project-owned DraftWorkspace, corpus, gap, report, submission and download paths. Centralize current-project resource checks, remove creator/author/draft-member and generic-admin bypasses, enforce archive writes, and preserve personal-resource ownership. Add focused negative tests including a removed creator and substituted nested IDs. Do not introduce manuscript features.”

2. **Project admission and authority:** “Implement S02/M01. Allow explicit unaffiliated onboarding for all academic personas, enforce API onboarding, add creator provenance, row version, access epoch and separate research stage. Retain current lifecycle and legacy visibility adapters; PUBLIC exposes only approved summary. Add transfer/version-race tests on a disposable database and a dry-run provenance backfill. Do not infer unknown creators or publish private fields.”

3. **Outbox and realtime revocation:** “Implement S03/M02 outbox and idempotent command receipts using PostgreSQL plus existing BullMQ/notification infrastructure. Apply to membership/archive/session revocation first. Evict/recheck SSE sessions, document replay/refetch and bounded lease, and test duplicate delivery, queue loss and two-instance revocation. Use current authorization on idempotent replay.”

4. **Scoped files:** “Implement S04/M02 FileObject intents, private scoped downloads and retention-aware reconciliation around existing PDF storage. Preserve legacy submission downloads during metadata backfill. Test missing objects, unauthorized refs, interruption/retry and GC of held/referenced files. Provide measured upload limits and no public storage aliases.”

5. **Research planning:** “Implement S05/M03 versioned ResearchPlan/PlanRevision and human-adopted Questions with bounded approach-specific protocol. Route legacy criteria writes through the same service, preserve conflicting corpus provenance, and build the Research/Plan view. Test expectedVersion and historical protocol pins.”

6. **Workspace structure:** “Implement S06 using server-derived capabilities and seven primary destinations. Nest Plan/Literature/Screening/Evidence/Gaps under Research, group outputs under Manuscripts, and membership/contributions/settings under Team. Preserve all eight existing tab keys, screening query and reader-modal/deep-link state. Keep pure white canvas and existing typography; verify keyboard/mobile/reduced motion.”

7. **Corpus and screening:** “Implement S07/M04. Fix inclusionReason persistence with an actual service/persistence regression test. Make ProjectPaper the project screening authority, append immutable protocol-linked decisions, handle retained paper removal, and produce a dry-run conflict report for collections. Do not promote corpus-only or excluded papers to INCLUDED; update gap scope to the same authority.”

8. **Evidence and validation:** “Implement S08/M05. Add immutable source-pinned EvidenceItem/GapRevision packets and explicit owner-approved ValidationRounds with named independent experts. Reuse existing gap workers/vote rules per round. Keep legacy unpinned votes historical, label abstract/user-note evidence, test reindex survival, packet changes, revocation and counterevidence.”

9. **Team coordination:** “Implement S09/M06 minimal tasks/milestones and discussion threads around existing team messages, plus append-only decisions. Preserve message IDs/read receipts and contribution workflow. Enforce current-team assignees, same-project links and safe notification digests; add accessible list-first UI.”

10. **Mentor feedback and formal-review policy:** “Implement S10/M06 scoped immutable feedback shares/requests around existing mentorship. New relationships get summary only. Harden review admission for mentor conflicts and owner-transfer access, keep reviewer drafts private and define retained-history grants. Test ended/expired relationships and exact version pins; do not grant mentors project membership or source edits.”

11. **Writing proof:** “Implement S11 as a private durability prototype after dependency approval. Pin CM6/Yjs/Hocuspocus-compatible versions, prove authenticated per-room policy, PostgreSQL binary journal/checkpoint, custom commit receipts, missing dependency handling, fenced writer and coherent multi-file snapshot. Run deterministic gateway crash/reconnect/revocation tests. Report unsupported hook semantics before choosing an adapter; no public compiler.”

12. **Native editor:** “Implement S12/M07 on the proven protocol: file tree, CodeMirror source, bounded imports/assets, presence, explicit save state, snapshots and safe navigation. Protect source/editor/quotes from DOM i18n and validate reserved metadata edits. Verify two-client convergence and responsive/keyboard behavior. Do not add a parallel text-saving endpoint.”

13. **Safe compiler:** “Implement S13/M07 with an independently reviewed isolated Linux runtime, pinned allowed TeX toolchain, immutable inputs, no network/secrets/socket/shell hooks, bounded resources and cancellable CompileRun. Add scoped PDF preview/sanitized diagnostics and adversarial isolation tests. Keep public enablement off until all ADR sandbox gates pass.”

14. **Output/review bridge:** “Implement S14/M08 by sealing a successful snapshot+compile into existing SubmissionRevision, including immutable research metadata and hashes. Require exact expected revision for review requests/resubmissions; retain old HumanReview pins. Test concurrency, cross-project refs, restore-as-new-version and existing PDF/report workflows. Do not create OutputVersion or a second formal review system.”

15. **Release rehearsal:** “Execute S15 against isolated infrastructure. Rehearse additive migrations/backfills, compatibility and forward rollback, authorization races, sandbox attacks, backup/PITR/object restoration, quotas/load and accessibility. Deliver measured evidence and operator runbooks; keep production rollout a separately authorized action.”
