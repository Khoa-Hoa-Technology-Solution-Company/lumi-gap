# Research Integrity Center

Implementation and verification record, 7 November 2026. This document describes implemented behavior, not a research-integrity certification.

## 1. Repository audit and reused functionality

The center joins existing manuscript evidence rather than creating another authorship, mentoring, or contribution system:

| Existing capability | Integration |
| --- | --- |
| Immutable manuscript snapshots and manifests | Every audit, declaration, and report names an exact snapshot, source revision, and checksum. |
| Manuscript attribution | The existing attribution reader and mandatory publication gate remain authoritative for author order, individual consent, omitted contributors, and disputes. |
| CRediT and contribution evidence | Existing detected contributions, attribution decisions, acknowledgments, and ledger references are summarized. Writing volume does not determine authorship. |
| Manuscript AI proposals and collaborative edits | A separate acceptance receipt records an explicit human acceptance after a durable source update. Proposals remain distinct from accepted changes. |
| Project external-AI activities | Existing self-declarations are included alongside snapshot-specific disclosures. |
| Mentor relationships, agreements, access and feedback | The center lists formal roles, revoked/historical access, accepted agreement IDs, and approved feedback/revision references. It does not copy private conversations. |
| Project permissions and export policy | Existing workspace authorization and source-export policy govern full-center access and report export. |
| Research ledger and integrity cases | Existing evidence pointers and case IDs/kinds/statuses are reused without exposing protected case evidence. |
| Notifications | Proposed authors receive a link to their declaration packet through the existing notification destination resolver. |

The older `scientific-integrity.service.ts` operates at live project/file scope. It is not a substitute for authoritative snapshot authorship verification. Its external-AI activity records are reused; its UI is not duplicated as a competing authorship checker.

## 2. New functionality

The implemented center includes seven sections: Overview, Citation audit, AI disclosure, Authorship and contributions, Mentorship and rights, Pre-submission review, and Integrity history. It supports English and Vietnamese, saved-snapshot selection, direct links to a section, loading/error/stale states, and recovery from concurrent declaration updates without silently discarding typed input.

New persisted evidence consists of citation audits, AI declarations, rights declarations, per-snapshot submission policy, readiness reports, individual acknowledgments, and accepted-AI-edit receipts. There is no integrity score, AI detector, plagiarism detector, automatic ownership judgment, or ethics certificate.

## 3. Architecture and publication integration

`manuscript-integrity.service.ts` gathers existing evidence inside the established workspace/project transaction. `readManuscriptAttribution` exposes the original attribution reader; it does not implement a second authorship decision algorithm.

Native LaTeX snapshot publication first executes the existing mandatory attribution gate, then recomputes integrity readiness inside that same publication transaction and project lock. An old report or a client-supplied readiness value cannot authorize publication. The publication revision stores both `attributionCheckId` and the newly generated `integrityReportId`.

The direct uploaded-PDF submission workflow has no native manuscript snapshot. It is not falsely presented as having passed this snapshot audit and has not been rewritten or newly gated by the center.

## 4. Models and migrations

| Model | Purpose |
| --- | --- |
| `ManuscriptIntegrityRecord` | Versioned snapshot-scoped evidence with kind, content, evidence digest, checksum, actor, command key/hash, and timestamp. |
| `ManuscriptIntegrityAcknowledgement` | One authenticated proposed author's acknowledgment of one exact declaration and evidence digest. |
| `ManuscriptAiAcceptance` | Owned AI run, accepted source file/sequence/version/checksum, proposal checksum, actor, and idempotency key. |

Three additive, handwritten migrations implement these models and scope constraints:

1. `20261106190000_manuscript_integrity_center`
2. `20261106191000_integrity_report_snapshot_scope`
3. `20261107001000_integrity_ai_acceptance_scope`

Composite foreign keys bind snapshot/project/workspace, publication report/snapshot, acceptance/run/project/workspace/owner, and acceptance/file/workspace. Append-only triggers protect evidence rows. Existing uniqueness annotations on `DraftWorkspace`, `ManuscriptSnapshot`, and `AiRun` describe the SQL scope keys. No historical evidence is rewritten.

Only the isolated local test database `codex_mentorship_1a6e9c202611_test` was migrated during this implementation. The application database and localhost:8080 have not been migrated or deployed by this task.

## 5. APIs

All paths below are relative to `/api/v1/projects/:projectId/manuscripts/:id` and use existing authentication, research access guards, error envelopes, private-cache headers, and rate limiting.

| Method and path | Behavior |
| --- | --- |
| `GET /snapshots/:snapshotId/integrity` | Current evaluation of the selected snapshot and authorized evidence. |
| `POST /snapshots/:snapshotId/integrity` | Strictly validated audit/declaration/policy/report command or self-acknowledgment. |
| `GET /snapshots/:snapshotId/integrity/:recordId/declaration` | Limited frozen packet for an authenticated proposed author. |
| `GET /snapshots/:snapshotId/integrity/:recordId/export` | Authorized JSON report export with current stale/fresh evaluation. |
| `POST /ai/:runId/acceptance` | Records a verified, durably saved acceptance of the caller's own completed AI proposal. |

Declaration/policy writes require the expected record version. Commands use UUID client keys and reject reuse with different content or scope. Acknowledgments carry no caller-supplied author identity: the server always uses the authenticated actor.

## 6. Frontend

The page is available at `/projects/:projectId/manuscripts/:id/integrity?snapshot=:snapshotId`. Manuscript cards and the editor menu link to it. `panel` preserves the selected section in the URL; readiness warnings link directly to the relevant workflow. The original attribution dialog is reused.

The full center is for the current project owner and active team. The `declaration` URL parameter selects the limited author packet. Forms retain local input after a failed save or a teammate's conflicting update and offer explicit reload recovery. Unsaved-navigation confirmation uses the existing workspace mechanism.

Evidence states use one color map: green reviewed evidence, amber needs review, blue pending, red disputed/restricted, neutral unavailable, violet stale. Text accompanies color. These states describe the configured evidence checks, not scientific validity.

## 7. Citation verification

Analysis reads the selected saved manifest, never a newer live draft. The bounded lexical parser follows the main `.tex` file and reachable static `input`, `include`, and `subfile` paths, reads referenced `.bib` files and manual bibliography items, masks comments/verbatim, and handles plural citation commands. It does not execute TeX, fetch arbitrary URLs, or traverse the host filesystem.

Findings cover undefined citation keys, duplicate identifiers, missing metadata, DOI syntax/mismatch, author-name mismatch, missing resources, unsupported/dynamic macros, syntax problems, source retraction/correction notices, unknown source status, and analysis limits. Unknown provider status requires manual verification; it never means a source is clean. Semantic support for a scientific claim is always `NOT_REVIEWED`.

Bounds: 200 source files, 2 MB text, 2,000 bibliography entries, 5,000 cited keys, and 1,000 findings. Metadata lookup considers at most 5,000 linked project papers, 200 matching papers, and 4,000 author records. It reuses normalized DOI identities and authorized local provider cache records. Database queries select small status fields rather than entire provider payloads. Report entries name compared fields, provider, observation time, and source-record/notice references when available.

Title/year comparison and conservative author-name comparison are evidence of metadata agreement only. Missing, unavailable, or stale cache data degrades to manual review without requiring an API credential or a live provider call.

Provider-status interpretation follows [Crossref update guidance](https://www.crossref.org/documentation/register-maintain-records/maintaining-your-metadata/registering-updates/), [Crossref REST fields](https://raw.githubusercontent.com/CrossRef/rest-api-doc/master/api_format.md), and [OpenAlex work attributes](https://help.openalex.org/data/works/attributes/). Crossref `updated-by` is used for notices about the referenced work; reverse `update-to` is not interpreted as a retraction of that work. OpenAlex `is_retracted: true` produces a retraction warning. Retraction warnings take priority over corrections.

## 8. AI disclosure

The center distinguishes a proposed operation, an explicitly accepted edit, exact accepted-source capture in a snapshot, and manually declared external use. It does not infer undisclosed AI use.

After human acceptance and a successful collaboration flush, the UI requests an acceptance receipt. The server verifies the run owner, completed proposal, target file, persisted sequence, proposal text, and a source update at that sequence made by the authenticated actor. An idempotent retry returns the original receipt after later edits. Failed receipt persistence does not reinsert text or undo a saved human edit; the UI asks the user to disclose the already-applied use.

`exactSourceCaptured` is true only when the snapshot's file sequence and checksum exactly equal the accepted source and acceptance predates the snapshot. A later revision does not prove that AI text remains. This is not word-level AI provenance.

Humans record external tool, purpose/category, affected sections, disclosure wording, and venue/institutional policy. The declaration freezes current assistance references and coverage information. Each proposed author acknowledges personally. Changed AI evidence or author-list scope invalidates previous acknowledgment applicability. Bounded AI history is explicitly disclosed; the declaration must cover earlier usage too.

## 9. Rights and mentorship

The owner can record claimed holders, basis, explanation, institutional/contractual arrangement, third-party content/licenses, publication/sharing restrictions, unresolved questions, and supporting links. Records are versioned user statements, not platform-certified legal conclusions. A declaration does not grant technical access, ownership, export rights, authorship, or publication authority.

Mentor roles and permitted contribution references remain separate from authorship. A mentor does not gain manuscript access by appearing in this report. Existing resource sharing, revocation, expiry, and consent rules still govern access. Private mentor conversations and full agreements are not copied into exports.

## 10. Readiness and blocking

| Condition | Enforcement |
| --- | --- |
| Missing mandatory attribution, author consent, or mandatory attribution dispute | Existing authoritative gate blocks publication; no general override. |
| Unauthorized viewer, archived/completed project or archived manuscript | Submission/write remains forbidden. |
| Rights declaration explicitly prohibits internal submission | Blocks even under the default advisory policy. |
| Owner enables required AI acknowledgments | Every proposed author must acknowledge the current scoped declaration. |
| Owner enables required rights acknowledgments | Every proposed author must acknowledge the current scoped declaration. |
| Owner enables current citation analysis | Missing, bounded-incomplete, or stale citation analysis blocks; metadata warnings remain visible for human review. |
| Owner requires current snapshot | A changed working manuscript blocks submission of the historical snapshot. |
| Advisory AI/rights evidence missing, missing DOI, unknown status, unresolved nonmandatory question | Needs review; not one universal hard block. |

Additional checks default to advisory to preserve existing workflows. Configured rules apply to the selected snapshot. Existing authorship consent and access controls cannot be disabled by policy. Relevant open cases are surfaced by ID/status; the original attribution system decides mandatory authorship-dispute blocking. The center does not invent a new security-case adjudication workflow.

## 11. Staleness, security, privacy, and retention

Reports include project/manuscript/snapshot IDs, source version and checksum, algorithm/schema versions, evaluated timestamp, evidence versions/digest, individual checks, blocking reasons, confirmation timestamps, and report checksum/version. Staleness uses persisted source inventory/sequences/checksums, declaration and policy versions, attribution decisions and contributions, bounded AI evidence, relevant ledger references, mentor access, cases, and project policies. Reports remain immutable; export adds a current `stale` result rather than editing historical content.

Checksum verification: `SHA-256/CANONICAL_JSON_V1` recursively sorts object keys, retains array order, serializes as JSON, and hashes UTF-8. Reconstruct the record envelope `{ projectId, manuscriptId, snapshotId, kind, version, content, evidenceDigest, createdById }` using the exported report as `content` and its corresponding report fields. `reportChecksum` is the digest of this envelope; export-time metadata is outside it. See `integrityDigest` for the exact algorithm.

Full-center authorization is checked server-side for every operation. Export additionally calls the existing source-export guard, including `OWNER_ONLY`. Former proposed authors can read only their frozen declaration packet and acknowledge as themselves; they cannot regain manuscript source or team access. Cross-project snapshot, record, and run IDs are rejected. No report exports API keys, AI credentials, source files, private conversations, or protected case evidence.

Parameterized queries, strict input schemas, UUID scope validation, bounded parsing, optimistic versions, project locking, immutable records, command idempotency, and the existing ledger protect the write paths. There is no public report route.

Append-only evidence is not permission for indefinite personal-data retention. Normal APIs cannot delete or rewrite these records. Any approved privacy/retention operation must use the application's existing authorized process and reconcile dependent records/ledger references; this task adds no new privacy bypass or retention exemption.

## 12. Verification

Final backend run: **74/74 tests, four files**, on isolated PostgreSQL. It covers 16 citation-parser cases, 18 integrity persistence/API cases, 26 existing manuscript cases, and 14 existing AI persistence cases. The compiler regression repaired broken LaTeX and produced a real PDF through the existing isolated compiler. Two additional parser regressions reproduced manual-bibliography and finding-budget defects before the fix and passed afterward. Both limits now preserve an incomplete-analysis marker, which the existing required-citation gate treats as incomplete rather than ready.

Final verification results:

| Check | Result |
| --- | --- |
| PostgreSQL parser/integrity/manuscript/AI suites | 74/74, four files, including actual PDF compilation. |
| Web center/AI/workspace/notification/locale suites | 129/129, five files: 12 center, 24 AI, 42 workspace, 50 notification, 1 locale. |
| PostgreSQL-only runtime boundary | 4/4. |
| Shared types | `tsc -b packages/shared-types` passed. |
| Backend production TypeScript | `tsc -p tsconfig.build.json --noEmit` passed. |
| Web TypeScript | `tsc -b` passed. |
| Web production build | `node scripts/build.mjs` passed. |
| Scoped ESLint | New/modified center, integration, shared-contract and regression files passed; final UI/test/locale edits checked again. |
| Whitespace | `git diff --check` passed. |

The web build reports the existing old Browserslist-data notice; React Router emits future-version notices in tests. Neither was hidden or treated as a failure. Infrastructure interruptions and an initial runtime-audit invocation from the wrong working directory were corrected and were not counted as passing runs. Docker recovered after temporarily stopping previously authorized unnecessary workers; no application volumes/data were deleted.

Browser QA used an authenticated researcher account and disposable fixtures in the isolated test database, with a real API on loopback port 8096 and Vite on 8094. Verified: navigation across sections, saved citation audits visible in history, AI declaration save, report generation, report download, correct authorship-warning destination, and opening the original attribution dialog with the selected snapshot. The downloaded JSON checksum was independently recomputed and matched. Its `stale` was false and `maySubmit` remained false while author confirmation was missing. No author consent or rights agreement was fabricated to force a passing state.

Desktop (1280 × 900) and mobile (390 × 844) were visually inspected. Document width equaled viewport client width in both, with section navigation scrolling within its own container. The temporary viewport override was reset. Browser QA caught and corrected invalid paragraph/badge nesting and a translated count placeholder; the latter has a regression test. A transient development hot-refresh failure after changing locale exports required a reload; normal page loading and subsequent interactions passed. Preview servers were stopped after QA. This is not a claim of a complete multi-account production-browser E2E run.

The database runner is invoked from `apps/backend`:

```powershell
node scripts/test-manuscript-integrity.mjs --env-file D:/lumi-gap/.env --compiler-via-docker
```

The runner derives a named local test database, applies migrations there, and optionally forwards compilation to the existing isolated local compiler through a temporary loopback bridge. The original application database is not modified. The environment path is local configuration, not a committed credential.

Locale audit: the repository already contains 390 untranslated UI strings. A HEAD-versus-working-tree scan found **390 before, 390 after, zero introduced**. The unrelated global locale baseline is not claimed to pass.

## 13. File inventory

Paths are relative to the repository root. Generated Prisma output, temporary preview scripts, screenshots, and logs are not source deliverables.

New center files:

- `packages/shared-types/src/manuscript-integrity.ts`
- `apps/backend/prisma/manuscript-integrity.prisma`
- The three integrity migration directories listed above.
- `apps/backend/src/modules/workspaces/integrity-citations.ts`
- `apps/backend/src/modules/workspaces/dto/manuscript-integrity.schema.ts`
- `apps/backend/src/modules/workspaces/manuscript-integrity.service.ts`
- `apps/backend/src/modules/workspaces/manuscript-integrity.routes.ts`
- `apps/backend/src/modules/workspaces/__tests__/integrity-citations.test.ts`
- `apps/backend/src/modules/workspaces/__tests__/manuscript-integrity.persistence.test.ts`
- `apps/backend/scripts/test-manuscript-integrity.mjs`
- `apps/web/src/features/manuscripts/manuscript-integrity.api.ts`
- `apps/web/src/features/manuscripts/manuscript-integrity.tsx`
- `apps/web/src/features/manuscripts/__tests__/manuscript-integrity.test.tsx`
- `apps/web/src/i18n/locales/manuscript-integrity.ts`
- `apps/web/src/i18n/__tests__/manuscript-integrity-locales.test.ts`
- `docs/research-integrity-center.md`

Existing files integrated or covered by regression changes:

- `packages/shared-types/src/index.ts`, `notification.ts`
- `apps/backend/prisma/collaboration.prisma`, `manuscript.prisma`, `review.prisma`
- `apps/backend/src/modules/workspaces/manuscript-attribution.service.ts`, `manuscript.service.ts`, `manuscript.routes.ts`
- `apps/backend/src/modules/notifications/notification.service.ts`
- `apps/web/src/features/manuscripts/manuscript-ai.tsx`, `manuscript-editor.tsx`, `manuscripts-panel.tsx`
- `apps/web/src/features/manuscripts/__tests__/manuscript-ai.test.tsx`, `manuscript-workspace.test.tsx`
- `apps/web/src/features/notifications/utils/notification-destination.ts`
- `apps/web/src/routes/app-routes.tsx`
- `apps/web/src/i18n/locales/en.ts`, `vi.ts`

Earlier uncommitted lecturer-applicant matching changes remain present and separate. Their project services, applicant models/migrations, APIs, pages, locale module/tests, and documentation are not Research Integrity Center changes and were not overwritten.

## 14. Rollout, rollback, and remaining limits

Before rollout, back up the application database using the normal project process, apply the additive migrations with `migrate deploy`, regenerate Prisma/shared types, deploy backend and web together, and smoke-test authorized manuscript snapshot publication. No new provider secret or dependency is required. The default advisory policy preserves existing gates; an owner must explicitly configure stricter rules for a snapshot.

Rollback should revert the application feature while retaining evidence tables and immutable records. Do not drop evidence or rewrite historical publication revisions. Export/archive under the existing retention policy if a later reviewed data migration is needed. Existing authorship checks must remain in force.

Known limits:

- Native saved LaTeX snapshots only; uploaded PDFs are not citation-audited by this feature.
- Citation verification uses bounded local provider cache, not a full live Crossref/OpenAlex refresh or complete retraction registry.
- No semantic claim-support evaluation, universal plagiarism check, AI-text detector, ethical/legal certification, or automatic authorship decision.
- TeX/BibTeX parsing intentionally supports a bounded static subset. Dynamic constructions and resource limits require human review.
- AI operation display, activity/ledger history, mentor history, and metadata matching have documented bounds. Human declarations remain necessary for older/external usage.
- Accepted-AI-edit receipts prove a saved acceptance event and exact source version, not persistent ownership of every later word.
- Scope-specific policy must be configured for each snapshot; the task does not change the separate uploaded-PDF workflow.
- Application database rollout and localhost:8080 deployment have not been performed. No commit or push was made for this task.
