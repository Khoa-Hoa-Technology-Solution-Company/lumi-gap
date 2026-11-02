# Research synthesis workspace — 2026-11-02

## Scope

Evidence Matrix is now **Bảng tổng hợp nghiên cứu**, using existing LumiGap components and tokens. No migration, deletion, deduplication write, new dependency or automatic AI job is introduced.

## Why the old view repeated content

`publishDiscoveryEvidence` creates an extraction for each supporting paper of each candidate gap. A paper can legitimately have multiple extraction records and gap links, often containing the same finding, all findings in `results`, and a long source passage. The previous UI rendered every record as a complete card. It also returned sources that were no longer eligible and merely warned about them.

The replacement groups records by project paper **before pagination**, without merging findings or changing their IDs. The overview shows a compact, explicitly identified extraction version; all other records remain separately available in the expanded details. Full source text is absent from the overview response.

## Workflow and safeguards

- Six-column comparison table; title/content search; RQ, topic, verification and eligibility filters; paper/RQ modes. RQ groups cover the current page of papers and each preview belongs to that RQ. Expanding a paper lists compact extraction disclosures; each record opens independently so repeated legacy results do not form a wall of cards. Links lead to the original Library source and the existing cross-paper synthesis workspace.
- Default sources must be INCLUDED in the current screening round and must have completed the configured analysis stage. Legacy results that need audit, unresolved conflicts, excluded papers and pending full-text stages are excluded by default. An explicit archive filter retains access to their extraction history.
- Method, finding and limitations are the core editor. Only the finding and a paper are required; RQ, quotation, locator and context are optional.
- Existing AI suggestions load only after an explicit click. Saving preserves AI origin and creates a draft/pending extraction; it never confirms verification.
- Human verification requires an explicit source-confirmation checkbox and the exact opened extraction version. Edits reset verification and append revisions. Abstract-derived content remains labeled **Chỉ dựa trên tóm tắt**, even if full text was manually declared.
- Paper/source fingerprints and indexed document hashes invalidate stale verification. Stale indexed passages cannot be adopted. Existing source snapshots and revision history remain intact.
- Workspace reads and writes use existing backend project authorization. Screening decisions remain independent of evidence creation. No real research decisions or AI jobs were created during UI QA.
- The workspace reuses the current relational records and JSON provenance metadata. Grouping is currently performed in memory within the authorized project transaction; very large projects may require a future database aggregation optimization.

## Automated verification

- Web: **74/74** across Evidence (17), research workflow (10), synthesis (8), Library (9), task-first views (5) and Screening (25). The final compact extraction disclosure adjustment was additionally checked with Evidence's 17/17 tests.
- Isolated PostgreSQL: final focused Evidence/Synthesis/Collaborative Research run **38/38**. Covers grouping and pagination, separate findings, filters, RQ preview scope, screening eligibility, explicit AI verification, source freshness, preserved history, authentication and project boundaries.
- Broader PostgreSQL regression run before the final indexed-passage test: **145/146**. Screening slots: 31/31; Screening: 77/78. The failing existing case is `V5 reviewers request an independent adjudicator after discussion; the adjudicator can request more information`, at `screening.persistence.test.ts:320`. It expects a 403 before discussion; the concurrently modified Screening request service now accepts the request. This Evidence change does not alter that service or resolve that separate behavior mismatch.
- Web and backend TypeScript checks passed. Docker builds also perform shared type compilation and the backend PostgreSQL runtime boundary test.
- Test runner derives `lumigap_evidence_workspace_test` from the local PostgreSQL configuration. It does not migrate, reset or seed the application database.

Commands:

```powershell
node apps/backend/scripts/test-evidence-workspace.mjs --focused
node apps/backend/scripts/test-evidence-workspace.mjs
pnpm --filter web exec vitest run src/features/projects/__tests__/evidence-workspace.test.tsx src/features/projects/__tests__/research-workflow.test.tsx src/features/projects/__tests__/research-synthesis.test.tsx src/features/projects/__tests__/collaborative-library.test.tsx src/features/projects/__tests__/task-first-papers-workspace.test.tsx src/features/projects/__tests__/screening-workspace.test.tsx --maxWorkers=1 --minWorkers=1
pnpm --filter backend exec tsc --noEmit -p tsconfig.build.json
pnpm --filter web exec tsc --noEmit -p tsconfig.app.json
```

## Live UI verification

- Rebuilt backend and web production images and recreated both Compose services. Both became healthy; backend `/ready` and web `/` returned HTTP 200.
- Reloaded the supplied reference route in the in-app browser. New heading/subtitle, filters, Library link and existing cross-paper synthesis link are present. No hardcoded project ID was added to application code.
- Actual archive: **14 papers / 14 unique overview rows**. The USMLE paper has **7 separate extraction records**, represented by one overview row; the final expanded view has seven closed extraction disclosures, with sources and history available after opening a record.
- The REVISIT filter returns **3 papers** with existing extractions. AI origin and abstract-only labels are visible. Opening history retrieves the existing version and original attribution without changing data.
- Default eligibility shows a guided empty state for this project: its current papers have not completed the required screening stage or need review. The source picker also explains this and disables saves. No screening outcome was changed to manufacture demo data.
- Live project has no linked RQs. The unlinked-RQ display mode was checked live; populated RQ filtering and RQ-specific findings were verified in the automated PostgreSQL and frontend tests.
- Verified the editor's three core fields, one required content textarea, optional source disclosure and separate draft/verification actions without submitting a real extraction.
- At 390px: document width 375px (scrollbar excluded), workspace approximately 343px, table scroll region 342px with 1040px content. Expanded extraction content stays within approximately 295px. Horizontal scrolling is confined to the table. At 1440px the six-column table fits the workspace. Light and dark themes were inspected; temporary viewport overrides were reset.
- Browser error log was empty after final verification. No AI execution, reviewer claim, review submission or project data write was used for browser QA.

Screenshots: `2026-11-02-evidence-after.jpg`, `2026-11-02-evidence-mobile.jpg`, `2026-11-02-evidence-dark.jpg`. The earlier `2026-11-02-evidence-before.png` documents the previous repeated-card layout.
