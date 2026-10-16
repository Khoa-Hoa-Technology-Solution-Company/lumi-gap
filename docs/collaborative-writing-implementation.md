# Collaborative research writing implementation

14 October 2026. Normal application databases and services were not migrated or restarted. This report describes verified authoring functionality and an explicitly blocked compilation boundary. The full PDF-enabled definition of done has **not** been reached.

## 1. Existing repository architecture

LumiGap uses React 18/Vite 6, React Router, TanStack Query, Express 5, Prisma 7/PostgreSQL 16 with pgvector, and Redis/BullMQ. Authentication uses signed access tokens and persisted refresh families. Project account, membership and archive checks are authoritative. Existing `DraftWorkspace`, `ProjectDiscussion`, `ProjectTeamMessage`, mentor relationships, notifications, Contributions, `SubmissionRevision`, `ReviewRequest`, and `ReviewerAssignment` were reused.

The assessment and phases are in [collaborative-writing-architecture.md](collaborative-writing-architecture.md). The prior [LaTeX ADR](adr/0001-collaborative-latex.md) describes proposed security and operational gates; proposals in that ADR are not all implemented here.

## 2. Chosen editor architecture

CodeMirror 6 provides a real source editor. Yjs 13.6.33 and `y-codemirror.next` 0.3.6 provide merging, local undo and collaborative selections. The provider and small `ws` gateway add application persistence receipts. There is no custom text-diff merge or full-text REST autosave.

The gateway is attached to the existing persistent Node server. PostgreSQL is canonical; the socket map contains only connections, permissions and presence. This version requires one API/gateway process for live broadcasts.

## 3. UI routes and components

Project navigation includes **Manuscripts**. The compact creation form supports all four document types and three templates without requiring a mentor, completed plan, literature or review.

The lazy editor route is `/projects/:projectId/manuscripts/:id`; `?snapshot=:snapshotId` opens a scoped immutable source version. The feature is under `apps/web/src/features/manuscripts/`:

- `manuscripts-panel.tsx`: persistent list and creation.
- `manuscript-feedback-link.tsx`: latest feedback status with exact-version navigation.
- `manuscript-editor.tsx`: files, source, context, discussions, versions and review handoff.
- `source-editor.tsx`: LaTeX highlighting, line numbers, bracket matching, indentation, search/replace, completion and local undo.
- `collaboration-provider.ts`: reconnect, awareness and commit receipts.
- `manuscripts.api.ts`, `manuscripts.css`: HTTP operations and responsive presentation.

Desktop uses three panes. Mobile uses Files/Editor/Preview tabs. Toolbar icon actions retain accessible labels. English and Vietnamese strings follow the existing dictionaries. Historical source and live source are protected from DOM auto-translation.

## 4. Manuscript and file model

`DraftWorkspace` is the canonical container. `writingMode=LEGACY` preserves the existing section editor and its one-workspace-per-project constraint. `LATEX` permits multiple manuscripts. Manuscript metadata includes type, template, description, main file, archive state, version, creation receipt and optional research link.

New tables:

| Table | Responsibility |
| --- | --- |
| `manuscript_files` | Stable UUID, live path/version, text checkpoint or binary asset |
| `manuscript_updates` | Append-only update bytes and actor/session/sequence receipts |
| `manuscript_snapshots` | Immutable source manifest and hash |
| `manuscript_snapshot_assets` | Exact historical asset bytes |
| `manuscript_compilations` | Durable compilation intent, currently BLOCKED |

Text and asset payloads are separate. Files are soft-deleted. Renaming preserves identity. Existing snapshots retain removed files and replaced images.

## 5. Real-time synchronization

The room is bound to authenticated project, manuscript and file UUIDs. Server state is merged into the client Y.Doc. Local updates carry a stable client session UUID and consecutive sequence. The provider sends one outstanding envelope at a time.

Under the project transaction lock, the service validates authority, source type, causal dependencies, plain-text Y.Text structure and quotas; merges the update; writes the canonical checkpoint and receipt; and commits. Receipt and source broadcast occur after commit. A reused receipt with changed bytes is rejected. A duplicate matching receipt returns the committed state without duplicate contribution activity.

Snapshots and metadata operations use the same lock. File create/rename/delete/main-file changes notify open editors. Concurrent stale operations fail with conflict responses. Files removed with local pending edits offer recovery downloads.

## 6. Persistence and restart recovery

Every successful source receipt covers a PostgreSQL transaction. The current binary checkpoint contains the full reconstructible state; journal rows are retained as immutable receipts. Missing causal dependencies cannot receive a successful acknowledgement.

The browser test stops and recreates the HTTP server and gateway, reconnects both users and reloads a browser. Acknowledged text survives and matches the stored source. This is a gateway/API lifecycle restart in the test process, not a host crash or power-loss test.

A disposable `pg_dump -Fc` / `pg_restore --exit-on-error` drill preserved source/asset byte checksums, snapshot hashes, receipt count and review-assignment count. At the drill boundary: 293 files, 70 receipts and 2 assignments matched. Production WAL/PITR, replication and backup schedules remain operator configuration, not claims made by this implementation.

Pending offline edits survive disconnect/reconnect **in the current browser tab**. They are not persisted across offline reload or browser termination. Before-unload warnings, back-navigation confirmation and recovery downloads make that limit visible.

## 7. Collaborator presence and cursors

Presence uses the maintained Yjs awareness protocol and CodeMirror binding. Display names, identities and colors are server-derived; email addresses are not sent. Each browser tab has a distinct Yjs client identity. Server clocks remain monotonic across reconnects. Disconnection removes peer awareness.

Executed browser checks cover remote cursor rendering, two distinct users, two tabs for the same account, removal of closed-tab presence and local undo that preserves a teammate's text. Presence represents open file sessions, not permanent membership.

## 8. Authentication and authorization

Tickets are obtained through authenticated HTTP and sent in the first socket message. Credentials never appear in the WebSocket URL. An origin allowlist, five-second handshake deadline, signed purpose and canonical scope precede admission.

Each edit and sensitive source delivery rechecks active refresh family and project membership. Periodic audits run every five seconds. Edit transactions take a shared lock on the active refresh-token rows, so session revocation and source commit have a defined database ordering. Members removed from the project lose write access and cannot obtain a new ticket.

Mentors receive only explicitly shared immutable snapshots while their verified relationship is active. Formal reviewers receive only accepted/in-review/completed assigned versions and retain the existing reviewer eligibility checks. Neither role grants live source-edit access. Admin status alone adds no manuscript bypass.

Bounds include 1,000 total sockets, 40 sockets per account, message/payload/backpressure limits and a shared account traffic budget. REST writes use `createRateLimiter`. Source/export/download responses are private and not cached.

## 9. Research references and BibTeX

The context panel reads canonical project literature, ordered author records, DOI/year/title metadata, plan questions, gap candidates, assumptions, extracted evidence and gap-evidence roles. Supporting/counterevidence associations are shown separately from limitations. Unreviewed evidence is labeled, and candidate gaps are not promoted into scientific conclusions.

Citation insertion is an atomic server operation. It rechecks that the paper is in the project library, finds or creates `references.bib`, preserves manual text, resolves colliding keys and appends an entry derived from canonical metadata. Concurrent inserts of the same paper reuse one entry/key. The resulting committed Yjs state is broadcast to bibliography viewers. The returned key is inserted into the active source selection.

Source ZIP export includes bibliography; individual source/BibTeX downloads are also available. Manual BibTeX editing/pasting works. Dedicated BibTeX import/parser tooling and complete cross-file missing-key analysis are not implemented. Missing-key checks are limited to loaded bibliography/current source. Completion is an aid and is not a bibliography validator.

## 10. Comments and mentor feedback

Comments use existing project discussions; replies use existing project team messages. There is no second discussion store. Live selection comments retain Yjs relative positions and a historical quote. Navigation selects a still-matching anchor; changed/deleted quotes are explicitly historical. Comment lists support open/resolved filtering, replies, resolution and reopening.

Sharing a selected snapshot with an active mentor creates a persisted feedback request and a notification pointing to that exact snapshot. Mentor comments, team replies and subsequent v2 source remain distinct; v1 feedback remains on v1. Mentor thread selection is scoped to the actor's own active relationship. Generic discussion editing cannot rewrite manuscript context.

The overview and live editor show the latest feedback request as pending, received, addressed or ended, linked to its exact immutable snapshot. The server derives this state from the scoped request, mentor-authored comments/replies, thread resolution and relationship status in one project-scoped query. Team replies and responses on older versions do not count as a response to the latest request. The status refreshes while the page is open.

Notifications were tested as persisted in-app records. Email delivery is deliberately skipped for this new request type. No live push/email delivery was exercised. Manuscript-specific mentions are not implemented.

## 11. Snapshot and version history

Snapshot creation captures all live files, main-file identity and asset bytes under one project lock. Client minimum sequences must be present before capture. The UI waits for its local durability receipts before requesting a snapshot; it does not include another user's uncommitted offline edits.

PostgreSQL rejects mutation/deletion of snapshots, historical snapshot assets and update receipts. Restore creates a new manuscript with new file identities, preserving the old source. Snapshot ZIP export is authorized for the same member/mentor/reviewer grant as viewing. History links identify already sealed submissions. Side-by-side revision diff is not implemented.

Formal submission declares authors explicitly and seals a `LATEX` `SubmissionRevision` linked to the selected snapshot. Retry with different authors is rejected. Existing review requests and accepted assignments pin that revision. Tests execute request, acceptance and submitted structured evaluation after the live source changes. Review workspaces link to the exact source snapshot; snapshot reviewer views link back to their formal assignment. Informal comments cannot become a formal review.

## 12. Compilation security architecture

**BLOCKED for public production use.** Docker runtime inspection found runc/containerd and NVIDIA, with no gVisor or per-job microVM runtime. No TeX process is executed in the API or a shared application container.

The schema/API can record a durable `BLOCKED` request against an immutable snapshot with `COMPILER_ISOLATION_REQUIRED`. There is no enabled compiler worker, executable sandbox adapter, PDF artifact or success claim.

Before enabling compilation, the deployment must provide and validate a dedicated worker with fixed toolchain/package digest, nonroot execution, disposable filesystem, no application secrets/database credentials/Docker socket, no network, disabled shell escape, CPU/memory/process/input/output/time limits, quotas and safe cleanup. Adversarial file-read, network, process and output-bomb tests are required. The ADR documents the intended boundary.

## 13. PDF preview and errors

The preview states that the secure compiler is unavailable and that no PDF exists for the version. Source editing and private export continue to work. There is no fake document or simulated success.

Queued/compiling/success/failed/timed-out execution, real diagnostics, stale-PDF indication, PDF download and historical PDF verification remain **BLOCKED** with the worker. Built-in template compilation is also unverified; no template is claimed to have passed TeX compilation.

## 14. Contributions integration

Meaningful events include manuscript creation, an authenticated writing session per file/client session, snapshot creation, feedback and version submission. Each typing update does not generate a new contribution event. Matching receipt replay creates no second writing event.

Events carry actor provenance and explicit attribution limits. Snapshot creation records the snapshot creator only. Submission authors come from explicit team declarations. No words/lines/presence/compile counts produce research percentages, effort points or automatic authorship. Contributions remains the authority for negotiated work and allocation records.

## 15. Database migrations

Handwritten migration: `apps/backend/prisma/migrations/20261014001000_collaborative_manuscripts/migration.sql`. No `migrate dev` was used.

It preserves legacy uniqueness, introduces partial case-insensitive live-path uniqueness, foreign keys, payload/check constraints, main-file validation, stable file identity and append-only guards. It extends existing history/mentor-target constraints and permits `LATEX` submission content. The reverse main-file guard prevents removing or renaming a main source to a non-TeX path.

The final complete chain of **72 migrations** applied to an empty disposable database. `db:migrate:status` on that final database reported up to date. `prisma validate` and client generation passed. Early test failures exposed constraints that typechecking could not detect; those failures were fixed before the fresh-chain run.

## 16. Deployment and recovery requirements

Use one persistent backend/gateway process initially. `/api/v1/manuscript-collaboration` requires WebSocket upgrade forwarding and production HTTPS/WSS. The existing Nginx config now includes that exact location, HTTP/1.1 upgrade headers and disabled buffering; `nginx -t` passed in the existing local web image. Vite's API proxy supports WebSocket traffic.

Configure `CORS_ORIGIN` to the real browser origins. Preserve PostgreSQL durability; Redis is not the document store. Apply the reviewed migration chain through the established deploy process. No deployment or normal-database migration was performed here.

Back up the complete PostgreSQL database with WAL/PITR or the existing approved database backup process. Text checkpoints, receipts, immutable manifests, asset bytes, feedback grants and review links are all inside that boundary. Restore to a separate database first; compare source and asset byte hashes, snapshot hashes, receipt counts and authorization/review records. Stop writes during final cutover, rotate/revoke sessions as appropriate, and reconnect clients. Do not delete retained files/assets merely because they are absent from a current draft.

Limits: 100 manuscripts/project, 200 live files and 20 MB/manuscript, 500 KB UTF-8/text file, 2 MB CRDT state, 5 MB decoded raster asset, 100 snapshots/manuscript, 100 MB/100,000 journal updates. The journal does not have a retention/compaction worker. At its limit, users must create a new draft from a snapshot. Multi-process routing/broadcast, storage-growth policy and load acceptance are required before horizontal scaling.

## 17. Actual tests executed

All persistence/browser suites were guarded to use disposable PostgreSQL on port 15439 and Redis on 16389. Browser UI was Vite on 13000 and the test API on 14039. Accounts and research data were synthetic. Compilation scenario E was not run because isolation is blocked.

After verification, the writing-task Vite process and the two disposable writing-task database/Redis containers were stopped and removed. Normal LumiGap containers were left running.

| Command/suite | Result |
| --- | --- |
| Backend Vitest `manuscripts.persistence.test.ts` | 8 passed |
| Backend Vitest `manuscripts.e2e.test.ts` | 7 passed in real Chromium sessions |
| Workspace collaboration persistence | 26 passed |
| Contributions persistence | 17 passed |
| Contributions domain | 7 passed |
| Workspace rules/schema | 9 + 6 passed |
| PostgreSQL runtime audit | 4 passed |
| Web notification destinations | 39 passed |
| Web workspace navigation | 10 passed |
| Web Contributions UI | 8 passed |
| Web DOM translation | 2 passed |
| Fresh `db:migrate:deploy` / `db:migrate:status` | 72 applied / up to date |
| Disposable `pg_dump` and `pg_restore` | Byte/hash/count comparison matched |
| Nginx config validation | Passed |

These are **143 distinct passing test cases**, excluding repeated verification runs. Commands were `pnpm --filter backend exec vitest run <listed paths>` and `pnpm --filter web exec vitest run <listed paths>` with the isolated test environment. Web browser tests use actual UI controls and authenticated accounts; REST/WebSocket traffic is not mocked. Service persistence tests execute real PostgreSQL transactions; notification queue delivery alone is stubbed there.

Browser evidence covers: project creation flow, two-user insert/concurrency/reload, offline merge, gateway/API restart, real cursors, same-account tabs, teammate-preserving undo, synchronized files, rename conflicts, deleted-file recovery, citation insertion, snapshots, persisted comments, mentor source denial/feedback/team replies, overview pending/received status and exact-version navigation, mobile panels/Vietnamese/no page overflow, outsiders, forged room credentials, invalid origin, removed membership and revoked session ticket denial. PostgreSQL assertions also verify that team replies do not mark a request answered, mentor replies do, resolve/reopen changes status, v1 responses do not answer a new v2 request, and ended relationships stop showing a pending request.

Screenshots were inspected:

- [Desktop editor](manuscript-screenshots/editor-desktop.png)
- [Mobile files](manuscript-screenshots/files-mobile.png)
- [Mobile editor](manuscript-screenshots/editor-mobile.png)
- [Vietnamese mobile editor](manuscript-screenshots/editor-vi-mobile.png)
- [Mentor snapshot](manuscript-screenshots/mentor-snapshot-desktop.png)
- [Overview feedback, desktop](manuscript-screenshots/overview-feedback-desktop.png)
- [Overview feedback, mobile](manuscript-screenshots/overview-feedback-mobile.png)

## 18. Typecheck, lint and build results

Shared types build, backend `tsc --noEmit`, web `typecheck` (`tsc -b`), backend build and web production build passed. The earlier `tsc --noEmit` invocation against the web solution root does not check referenced projects; the actual `tsc -b` check was subsequently executed and its errors fixed.

ESLint passed for the manuscript backend/DTO/tests, review-service integration, manuscript frontend/locales, review-workspace/API integration and notification destination test. Repository-wide lint was not claimed or run against the extensive unrelated work in progress.

The web production bundle budget passed. The editor is lazy and its approximately 487 KB uncompressed chunk does not join the initial application graph. This is build verification, not a load/performance benchmark.

## 19. Requirement classifications and remaining risks

| Brief requirement | Status | Evidence / limit |
| --- | --- | --- |
| Repository audit and architecture | IMPLEMENTED | Assessment and actual stack reuse |
| Project manuscripts / multiple documents | IMPLEMENTED | Persistent project UI and DB tests |
| Compact creation / types / templates | PARTIAL | Creation works; template compilation BLOCKED |
| Academic editor layout and controls | PARTIAL | Real editor; PDF controls BLOCKED |
| Responsive desktop/mobile UI | IMPLEMENTED | Inspected 1440 px / 390 px screenshots, overflow checks |
| Two users edit simultaneously | IMPLEMENTED | Actual Chromium sessions, PostgreSQL receipts |
| Real presence/cursors / multiple tabs | IMPLEMENTED | Browser presence, cursor and tab tests |
| Concurrent edits / reconnect / local undo | IMPLEMENTED | Browser and domain convergence tests |
| Durable save states and service recovery | IMPLEMENTED | Receipt replay, checkpoint, restart and restore tests |
| Collaborative file operations | IMPLEMENTED | Rename/conflict/delete recovery tests |
| Literature, plan, gaps and evidence context | IMPLEMENTED | Canonical project-scoped service/panel |
| Citation/BibTeX management | PARTIAL | Atomic insert/manual edit/export; dedicated import/full analysis absent |
| Contextual research notes/discussions | IMPLEMENTED | Existing discussions/messages |
| Comment selection/reply/filter/resolve | PARTIAL | Anchors/fallback and persistent threads; mentions absent |
| Member/mentor/reviewer/nonmember boundaries | IMPLEMENTED | DB and browser denial/assignment checks |
| WebSocket authorization/revocation | IMPLEMENTED | Scoped ticket, server identity, session/member audits |
| Working draft / immutable versions | IMPLEMENTED | Coherent capture, SQL immutability, new-draft restore |
| Revision comparison | NOT_IMPLEMENTED | History/view/export available; no side-by-side diff |
| Mentor feedback workflow | IMPLEMENTED | Exact-version request/comment/reply and overview status verified; in-app notification persisted |
| Formal academic review integration | IMPLEMENTED | Real request/acceptance/structured review on sealed source |
| Isolated compilation worker | BLOCKED | No adequate runtime; no unsafe execution |
| Asynchronous compilation / real PDF preview | BLOCKED | No compiler/PDF success/diagnostics claim |
| Source/snapshot/ZIP/BibTeX export | IMPLEMENTED | Authorized exports and retained asset bytes |
| Compiled PDF export | BLOCKED | No compiled artifact |
| Contributions provenance / no auto-percentages | IMPLEMENTED | Actor events, replay deduplication, explicit authors |
| Canonical relational data model | IMPLEMENTED | Reused domain, handwritten migration, constraints |
| Persistence / backup recovery | PARTIAL | Restart and restore verified; production PITR/load/crash gates remain |
| External assets | IMPLEMENTED | Decode/reencode bounded PNG/JPEG/WebP, private source/export paths |
| Overview required states | IMPLEMENTED | Empty/loading/error/archive/access/list/recent edits and latest feedback status |
| Error handling and localization | PARTIAL | Tested reconnect/revocation/deletion/Vietnamese; compiler errors BLOCKED |
| E2E scenarios A/B/C/D/F/G | IMPLEMENTED | Browser + PostgreSQL/service evidence above |
| E2E compilation scenario E | BLOCKED | Adequate sandbox must precede execution |

Remaining operational risks: no multi-gateway live broadcast, no journal compaction, no offline reload persistence, no disaster RPO/RTO promise, no DB-outage/kill-during-commit/load benchmark, no independent screen-reader audit, no full formal-review browser journey, no production notification delivery exercise, and no sandbox abuse tests. Archived manuscript metadata is supported, while per-manuscript archive management is not exposed as a separate UI action. Normal project archive behavior is enforced.

The source-authoring, collaboration and scoped review slices are functional and verified. Secure PDF compilation and its associated product workflow remain the release blocker for the full requested workspace.
