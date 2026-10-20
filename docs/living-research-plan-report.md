# Living Research Plan implementation report

Date: 2026-10-15. Branch: `codex/living-research-plan`.

## 1. Repository audit

Inspected `CLAUDE.md`, `PRODUCT.md`, `docs/DESIGN_LANGUAGE.md`, `docs/prisma-migrations.md`, the project and workspace Prisma models and SQL migrations, and these implementation boundaries:

| Area | Principal files | Before implementation |
| --- | --- | --- |
| Plan and versions | `apps/backend/src/modules/projects/project-plan.service.ts`, `plan-history.ts`; `apps/web/src/features/projects/components/workspace-plan.tsx` | PARTIAL: persisted manual full-document saves and immutable revisions, but each save produced history and there was no scoped autosave or restoration UI |
| Canonical questions | `project-gap-research.service.ts`, `project-overview.service.ts`, `workspace-access.ts`, `project-research.prisma` | IMPLEMENTED_AND_WORKING: stable question UUIDs inside the canonical `ResearchPlan.questions`; shared artifact references, gap provenance and derived questions |
| Approach, criteria and stage | `project.service.ts`, `project-overview.service.ts`, `project-workspace.schema.ts` | IMPLEMENTED_AND_WORKING canonical ownership; PARTIAL presentation and automatic history semantics |
| Comments and mentorship | `project-discussions.service.ts`, `project-tasks.service.ts`, `academic-relationship-access.ts`, `workspace-notification-access.ts` | PARTIAL: exact-version sharing and replies existed; no plan section anchors |
| Contributions and notifications | `contribution-activity.service.ts`, `workspace-access.ts` | IMPLEMENTED_AND_WORKING; new events needed appropriate inclusion/exclusion |
| UI coordination | `workspace-common.tsx`, `workspace-discussions.tsx`, `use-workspace.ts`, project routes and locale modules | PARTIAL: reusable dialogs, guards, queries and feedback existed, but the plan was a long form |
| Tests | Project creation, settings, workspace collaboration, research, contributions and manuscript suites | Existing regression coverage; no truthful autosave/network/two-browser plan conflict test |

No disconnected Research Question table or existing character-level collaborative plan editor was found. No new AI service was introduced. Existing gap-derived suggestions and their human-controlled adoption remain intact.

## 2. Problems addressed

The old form exposed advanced fields at once; full PUTs rewrote the document; saving and snapshot creation were coupled; settings and question derivation also created snapshots. New-project creation copied the short description into the research problem. Generic version comments provided no section context. Autosave, a conflict chooser, explicit restoration and comparable history were absent from the plan UI. All pre-existing content is retained.

## 3. Architecture and canonical ownership

One `ResearchPlan` remains the mutable plan per project. `ResearchPlan.questions` remains the canonical ordered question array, including UUID, text, source gap and evidence/version references. `ResearchPlan.approach` remains the Settings and Plan source of truth. Selection criteria remain `Project.inclusionCriteria/exclusionCriteria`. `Project.description`, research problem, methodology and `Project.researchStage` remain distinct.

No paragraph/objective tables, duplicate plan aggregate, question repository or new realtime service were added. Ordered objectives retain PostgreSQL string-array storage.

## 4. New UI structure

`workspace-plan.tsx` coordinates the document, save state, snapshot reader, conflicts and dialogs. `plan-document.tsx` presents Problem, Objectives and Questions first. Native `<details>` discloses optional advanced planning. `plan-history-panel.tsx` handles history, comparison, restoration and sharing. `plan-section-feedback.tsx` reuses the discussion detail/reply/resolution interface. `plan-section-labels.ts` shares section labels without a component import cycle.

## 5. Fields and controls

Problem is an optional text area. Objectives and expected outcomes use numbered editable rows with add/remove/reorder and a 20-item limit. Questions have stable UUIDs, add/remove/reorder, focused links and optional source details. Approach, scope, methodology, search strategy, screening criteria and expected outcomes remain available under Detailed plan. Changing approach does not reset unrelated fields. Source gap changes explicitly remove old source pins; ordinary question text edits retain them.

The toolbar contains save state, Version history and Create version. Change notes are requested only at snapshot creation. Saved snapshots expose owner sharing. No plan completion gate, approval badge, generated manuscript promise or duplicate stage control was added.

## 6. Autosave and durability

`hooks/use-plan-draft.ts` debounces valid changes for 900 ms and serializes HTTP requests. PATCH `/projects/:id/plan/draft` sends only changed fields and their exact original values. Server success is returned after the PostgreSQL transaction commits. The UI displays Saved only after that acknowledgment; network/rejection states retain input and expose Retry.

Typing during a pending save is preserved and sent after acknowledgment. Uncertain requests retain the exact UUID and body; database activity receipts and immutable workspace audit rows reproduce the original acknowledgment on retry. An untouched imported plan is not trimmed or automatically rewritten on opening.

Unsaved input uses existing navigation/unload guards. A rejected expired-session edit can be recovered after sign-in by the same account/project within 30 minutes in the same tab's memory. Private plan text is not placed in localStorage, sessionStorage or IndexedDB.

## 7. Concurrency

`project-plan-draft.service.ts` uses existing account/project transaction locks. It compares touched fields against submitted base values. Stale edits to different fields merge. Conflicting fields return HTTP 409 with the field list and current revision. The client fetches current content and requires a Mine/Saved choice per conflict while retaining independent local changes. Further races are checked again on the next PATCH.

Objectives and questions are atomic fields: two simultaneous edits within the same list may require choosing that list. There is no character-level merge, remote cursor or realtime presence claim.

## 8. Versions and restoration

POST `/plan/revisions` explicitly captures the committed canonical content under the project lock. `PlanRevision` remains immutable and captures question text and provenance with all plan fields and screening criteria. The creator comes from authenticated identity; note and timestamp are server-persisted. History displays creator, date, note and feedback-thread count, with two-version comparison.

POST `/plan/revisions/:revisionId/restore` checks project, membership, expected draft revision and historical source/question constraints. It creates a new working revision and preserves every snapshot and its feedback. A stale restore requires selecting and confirming again against the current draft; an uncertain response can be retried with the same receipt.

Snapshot numbers retain existing draft revision numbers, so they may skip numbers. A snapshot already captured at a given draft revision is reused. The legacy full PUT remains the explicit save-and-snapshot compatibility endpoint; the new autosave path, Settings and gap derivation do not create automatic snapshots.

## 9. Mentor feedback

`project-plan-feedback.service.ts` creates ordinary `ProjectDiscussion` threads with server-controlled section and draft/snapshot context. Team-only draft comments show the draft revision at posting. Snapshot comments stay on that exact immutable version after later edits or versions. Existing general version comments remain in a collapsed compatibility section.

An active verified mentor needs a live share for that exact snapshot to read, comment, reply or inspect discussion history. Mentors cannot access the draft, edit plan content, resolve team threads or mention private members. Owners can request/revoke feedback through the existing share flow. Share and mentor-feedback notifications use existing infrastructure; private research text is omitted. Overview now counts unanswered section feedback. Replies, resolve/reopen and immutable discussion history are reused.

Formal Academic Review remains assignment-scoped and independent. A mentor comment never creates a reviewer assignment or approval state.

## 10. Research Question integration

The Plan edits the same `ResearchPlan.questions` used by gap derivation, evidence, tasks, discussions and artifact selection. There is no second editable question copy to synchronize. UUIDs survive reorder and edits. Artifact links now include the question UUID/hash to focus the canonical question. Cross-project gap/evidence references and invalid source packets are rejected. Questions linked by tasks/discussions/decisions cannot be silently removed; the user must retain them or update those links. Snapshots preserve earlier question wording after live edits and restoration.

## 11. Research Approach integration

Plan edits update canonical `ResearchPlan.approach`, and Settings reads that same field. Settings writes increment the plan revision so stale plan clients are checked. Both flows preserve methodology, search strategy and questions. Plan saves invalidate only the current actor/project's connected workspace/research/project queries.

## 12. Database changes and preservation

Migration `apps/backend/prisma/migrations/20261015000100_living_plan_draft_history/migration.sql` extends the existing workspace-revision CHECK constraint with `PLAN_DRAFT`. It retains all previous kinds, including `MANUSCRIPT`. No tables or columns are removed, and no existing plan, snapshot, question or comment is rewritten. Prisma models need no shape change for this string discriminator.

Deploy the migration before the backend. All 73 migrations applied successfully to disposable PostgreSQL; migration status reports up to date and Prisma schema validation passed. For rollback, revert application code while keeping the additive constraint and audit history. Do not narrow the constraint or delete audit rows automatically.

## 13. Responsiveness and accessibility

Verified Chromium layouts at 1440, 768 and 390 px with no horizontal overflow. Screenshots are in `docs/living-plan-screenshots/`. Primary sections remain visible and Detailed plan remains collapsed on initial load/reload. Lists and actions wrap on mobile. Textareas have accessible labels; native selects/details and standard buttons support keyboard operation; save states use live status text; errors use alerts. Existing Radix dialogs provide focus trapping and Escape/close behavior.

Visual inspection covered desktop and mobile screenshots. This is not a full screen-reader or WCAG certification.

## 14. Security and authorization

New routes reuse authenticated project routing, strict Zod DTOs and the existing workspace rate limiter. Services recheck account state, current membership, archive state and exact mentor share inside existing transactions. Request receipts are actor/project-scoped and authorization is rechecked before returning retries. Snapshot bytes, creator identity and feedback anchors cannot be supplied by clients.

Tests reject nonmembers, unrelated verified lecturers, nonmember admins, cross-project snapshot IDs, forged creator/content fields, mentor draft writes, archived edits, removed members and revoked sessions. Immutable database triggers reject snapshot modification. Section-thread generic editing is denied to preserve context. Feedback/history reads fail after live share revocation. React renders comment text without HTML evaluation.

## 15. Executed verification

| Verification | Actual result |
| --- | --- |
| Living plan HTTP/PostgreSQL/Chromium suite | 8 passed: partial persistence, retry deduplication, independent/overlapping writes, canonical fields, immutable question capture, restore, exact-version mentor access/replies/resolution/history/notifications, revocation/security, real browser network recovery/history/comparison/restore and two authenticated browser conflict resolution |
| Workspace collaboration persistence | 26 passed, updated for explicit initial snapshots and Settings draft semantics |
| Collaborative research persistence | 12 passed, including evidence, screening, pinned gap-derived questions and mentor guidance |
| Contribution persistence | 17 passed; autosave stays outside contribution activity; explicit snapshots count as plan activity |
| Project creation/team persistence | 17 passed |
| Manuscript persistence | 8 passed, including immutable bytes, export/restore, mentor scope and formal assignment/review flow |
| Workspace schema/rules unit suites | 15 passed |
| Project frontend suites | 109 distinct tests passed across 12 files: 108 in the full run, followed by the coordination rerun with the additional expired-session test (19 in that suite) |
| PostgreSQL runtime audit | 4 passed |
| Typecheck | Web and backend passed; shared types built successfully |
| Targeted ESLint | All task TypeScript/TSX files, zero warnings |
| Production builds | Web, backend and shared types passed |
| Migration checks | All 73 migrations applied, status up to date, Prisma validate passed |

The tests used a disposable local PostgreSQL/pgvector and Redis, synthetic accounts and real Chromium. No production data, real emails or LLM calls were used. Targeted tests were run, not every service's entire repository test suite.

## 16. Known limits

- Collaboration is field-based optimistic concurrency, not realtime character coediting. Existing source pins are preserved, not scientifically validated.
- A working draft is durable after server acknowledgment. Unsynced text is memory-only; tab closure/reload after dismissing the native warning can lose it. Expired-session recovery requires the original account, same running tab and the 30-minute window. Browser back/forward follows the existing router behavior; a complete router-level blocker was not introduced.
- Snapshot labels follow existing draft revision numbers and can have gaps. Legacy full PUT consumers keep their established snapshot semantics.
- Objectives have ordered string-array identity; stable item UUIDs apply to questions. Comments anchor at section level, not individual text ranges or objective rows.
- History compares two snapshots on the current history page. It shows content changes without a word-level diff. Restoration can be rejected when it would remove questions linked to live research work or restore unavailable source references; historical snapshots remain readable.
- Sharing remains owner-controlled. Mentor notifications use the existing in-app mechanism; email delivery and a new AI suggestion workflow were not added.
- English and Vietnamese plan copy are supplied. Other locales use the established fallback behavior.

## Definition of Done classification

| # | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Lightweight understandable plan | IMPLEMENTED | Document layout and inspected responsive screenshots |
| 2 | Three primary sections | IMPLEMENTED | `plan-document.tsx`; browser screenshots |
| 3 | Optional advanced fields | IMPLEMENTED | Native collapsed Detailed plan; reload E2E |
| 4 | Incomplete plans can save | IMPLEMENTED | Partial draft API and real browser reload |
| 5 | One canonical approach | IMPLEMENTED | Settings/Plan API regression |
| 6 | Canonical questions | IMPLEMENTED | Artifact and gap derivation integration tests |
| 7 | Persistent truthful autosave | IMPLEMENTED | HTTP commit boundary; pending/network/retry/expired-session tests |
| 8 | No silent collaborator overwrite | IMPLEMENTED | Independent-field API race and two-session Chromium conflict choice |
| 9 | Draft separate from immutable version | IMPLEMENTED | Zero snapshots after autosave/Settings; explicit snapshot E2E |
| 10 | Accurate historical capture | IMPLEMENTED | Earlier question wording and snapshot mutation-denial tests |
| 11 | Existing plans/versions preserved | IMPLEMENTED | Additive-only migration and compatibility reader/legacy endpoint |
| 12 | Contextual mentor feedback without editing | IMPLEMENTED | Exact share, section anchor, replies/history/revocation tests |
| 13 | Formal Review separate | IMPLEMENTED | No assignment from feedback; sealed manuscript review regression |
| 14 | Research modules accessible without completion | IMPLEMENTED | Existing navigation, research/creation/manuscript regressions; no gate added |
| 15 | Desktop/mobile UI | IMPLEMENTED | 1440/768/390 px browser checks and inspected screenshots |
| 16 | Backend authorization | IMPLEMENTED | Negative HTTP tests, archive/member/session/share revocation |
| 17 | Meaningful end-to-end tests | IMPLEMENTED | Real HTTP + PostgreSQL + two authenticated Chromium sessions |

Additional scope classifications: fine-grained realtime coediting NOT_IMPLEMENTED (not required for V1); new AI service NOT_IMPLEMENTED (explicitly excluded); persistent offline draft storage NOT_IMPLEMENTED; full browser-history interception PARTIAL through existing navigation/unload guards; full assistive-technology certification NOT_IMPLEMENTED. No infrastructure dependency blocked the implemented workflow.
