# Mentor-guided manuscript review: implementation and verification

Date: 2026-11-13. Branch: `research-integrity-mentor-screening-20261112`.

This change is implemented in the current worktree and, following the user's request, has been copied into the local Docker runtime checkout and activated at localhost:8080. It has not been committed, pushed, or deployed to production. Existing Paper Insight and screening changes in the worktree are separate work and were preserved. See section 10 for the local rollout record.

## 1. Architecture audit and defects

The submission detail page had its own direct mentor feedback engine alongside the existing versioned academic-review engine. The direct form contained eight fixed criteria, initially selected scores of 4 and an integrity score of 5. It lacked the canonical review-request, response-to-reviewers and item-verification lifecycle. The same manuscript could therefore receive differently structured feedback through two paths.

The canonical engine already provided published templates, frozen template versions, revision-pinned requests, drafts, review rounds, actionable revision items, author responses, comparison and reviewer verification. That engine now owns all new mentor feedback. Legacy scores and comments remain readable; no historical review or manuscript revision is rewritten.

Additional confirmed defects fixed:

- `NOT_READY` could complete a review request instead of requiring a revision.
- Mentor access was inferred too broadly from relationships or assignments, rather than the exact effective submission share.
- A request could label an assigned mentor as an external peer reviewer to avoid the mentoring scope check.
- Concurrent submission/resubmission retries could produce errors or duplicate side effects.
- Editing a template draft temporarily made its published version unavailable; criteria replacement and publication were not atomic.
- An older autosave could clear the dirty flag for newer text; background refresh could erase an author's response draft.
- The project readiness package reported ready with pending authorship/CRediT confirmations. It also reused CRediT consent as authorship consent and exported an unconditional claim that authors approved the manuscript.

## 2. Final template and scoring architecture

The existing `ReviewTemplate → ReviewTemplateVersion → ReviewCriterion → ReviewCriterionLevel` models are reused. Seven published SYSTEM templates use the policy marker **LumiGap Scientific Manuscript Review Rubric v1.0**, with artifact-specific descriptions and criteria:

| Supported type | Policy |
| --- | --- |
| Research Paper | Scientific problem, contribution, methods, evidence and interpretation |
| Research Proposal | Planned methodology, data access/evaluation plan, feasibility and risks |
| Literature Review | Source selection, search/synthesis method and evidence appraisal |
| Methodology | Appropriate research methods and reproducibility |
| Thesis Chapter / Thesis Draft | Existing supported chapter/draft artifact types |
| Software Research Project | Existing mapping for a research plan, resources, milestones and evaluation plan |

Systematic reviews can use the literature-review template; this change does not introduce a new systematic-review artifact enum or automatically certify a reporting standard.

Research Paper weights:

| Criterion | Weight |
| --- | ---: |
| Research Problem & Research Questions | 10 |
| Originality & Scientific Contributions | 10 |
| Literature Review & Related Work | 10 |
| Methodology & Reproducibility | 20 |
| Data, Experiments & Evaluation | 15 |
| Results, Discussion & Limitations | 15 |
| Scientific Writing, Structure & Presentation | 10 |
| References & Citation Accuracy | 10 |

Ratings are 1–5 (Poor, Weak, Adequate, Good, Excellent), with the criterion description and performance anchor. Every criterion starts unassessed. The partial indicator is `sum(score × weight) / assessed applicable weight`, accompanied by scoring coverage. Unassessed criteria are not zero. Permitted N/A is excluded. Submission requires all required applicable criteria. The default SYSTEM criteria are required; custom published templates can permit N/A. Low ratings require an academic comment.

Integrity is a separate eight-item checklist: authorship, attribution/borrowing, data concerns, source credibility, conflicts, AI disclosure, ethics and confidentiality. Some checks permit N/A. Concerns need a substantive note and prevent internal readiness, regardless of numerical score. A concern is not a misconduct verdict.

Published versions are unchanged when drafts are edited. Draft replacement and publication run atomically under a template lock. A request keeps its selected published version, so later template changes do not recalculate historical scores.

## 3. Student and mentor experience

Students keep the existing PDF, text and sealed manuscript-snapshot submission paths. AI pre-review remains optional, explicitly initiated, advisory and revision-bound. A successful human review does not run AI or copy AI suggestions into mentor scores.

The existing invitation UI recommends the matching scientific template and identifies assigned mentors. The existing Review Center handles acceptance, deadlines and the review inbox. A mentor relationship alone grants neither project membership nor unrestricted manuscript access.

The mentor workspace places the exact assigned immutable text/PDF beside the review on desktop, and stacks the layout on narrower screens. Criteria expand individually; integrity and comparison are disclosed progressively. PDF reading uses the existing authenticated revision-download API and releases blob URLs when the revision changes. Native PDF controls provide page navigation. A page/section locator is the fallback when reliable text anchoring is unavailable.

Each new required change can record severity, related rubric criterion, page/section locator and an exact quotation. Text quotations must occur in the pinned snapshot. Unverifiable PDF quotations are rejected; a manually checked locator remains available.

Authors see “Những gì nhóm cần sửa”, respond to each outstanding item, save private response drafts for a chosen newer revision, create the immutable revision, and explicitly resubmit. Refreshing review data does not overwrite their in-progress text. Saved response drafts survive a reload and are hidden from the reviewer until resubmission.

The mentor compares reviewed versions using the existing memoized text diff or side-by-side PDF comparison. Only the assigned verified reviewer can accept or reopen a response. Existing requested changes cannot be silently discarded when a new manuscript is uploaded.

Current project authors and the current owner receive submitted-feedback and item-verification notifications. A removed author is not selected as a team recipient. Legacy mentor tasks move into progress when upgraded to the canonical workspace, and finish when that feedback is submitted.

## 4. Relationships, state machine and permissions

`SubmissionRevision` owns immutable source content/checksum. A `ReviewRequest` and `ReviewerAssignment` pin a revision and published template version. Every `HumanReview` belongs to the assignment, exact revision and round. Its responses and required-change items remain historical. `ReviewRevisionResponse` connects a requested change to the author's new revision.

| Action | Result |
| --- | --- |
| Owner requests review | `REQUESTED`, exact revision/template pinned |
| Assigned eligible lecturer accepts | `ACCEPTED` |
| Reviewer saves incomplete work | `IN_REVIEW`, `HumanReview.DRAFT` |
| Major / minor / not-ready assessment | `REVISION_REQUESTED`; actionable changes required |
| Author saves response drafts | Response `DRAFT`; original item remains open/reopened |
| Author explicitly resubmits | Request `RESUBMITTED`, responses/items `ADDRESSED`; pin moves to the newer revision |
| Mentor verifies | Item/response `ACCEPTED` or `REOPENED` |
| Mentor submits readiness | Existing assessment `STRONG` is displayed as **Ready to advance internally**; request `COMPLETED` |
| Completed mentor review of current revision | Submission may become `READY_TO_ADVANCE`, only after aggregate review rules allow completion |

No external-publication acceptance enum was added. A newer draft being authored does not change the mentor's assigned revision. Readiness for an older reviewed revision does not mark the newer draft ready.

Owners retain invitation-management authority. Active project authors can read submitted feedback and respond to their manuscript. Students cannot write mentor reviews or verify corrections. Assigned mentors must remain verified lecturers with an active relationship, effective `SUBMISSIONS_VIEW`, and an unrevoked exact SUBMISSION share. New mentor requests enforce that scope even if the client sends `PEER_REVIEW`. Revoked access blocks workspace, request detail, revision history and downloads through existing access boundaries. Project contributors and declared conflicts remain excluded from formal reviewer admission.

Review writes recheck assignment, revision, round, project and permissions in transactions. Submitted reviews cannot be edited. A submission key plus payload hash deduplicates identical human-review retries; changing feedback under that key is rejected. Repeated identical resubmission and verification do not duplicate records. Accept/cancel/decline retries preserve the existing decision and avoid duplicate notifications.

## 5. Separate readiness and attribution gates

Mentor readiness never writes manuscript attribution approvals, adds an author, allocates verified CRediT roles, or accepts a journal/conference submission.

The existing project readiness package now requires distinct author-order consent and applicable member CRediT confirmations. A registry edit invalidates older author-order consent; a CRediT edit invalidates older consent to those roles. A mentor listed only as an adviser/acknowledgement is separate from manuscript authorship. Unresolved citation problems, unchecked citations, AI declarations or open integrity cases prevent the aggregate ready flag.

Exported CRediT text explicitly remains a draft while authorship consent is incomplete. Even confirmed author order is not described as approval of a final manuscript. The existing snapshot-specific `ManuscriptAttribution` and internal-publish checks remain authoritative for sealed LaTeX submission. Regression fixtures now complete those real declarations and confirmations before publishing their test snapshots.

The project-wide package is an overview, not a replacement for snapshot-specific author approval, venue requirements, or an external submission system.

## 6. API and database changes

Existing request/review APIs are reused with additive `purpose`, `clientKey`, integrity checklist and revision-item metadata fields. New endpoints:

- `POST /api/v1/submissions/:id/mentor-review`: upgrade an explicitly assigned legacy mentor task to the canonical revision-pinned request. The operation does not manufacture scores or delete old feedback. Pending canonical invitations must first be accepted in the Review Center.
- `PUT /api/v1/review-requests/:requestId/responses`: save private author response drafts against a newer revision. Existing resubmission freezes those responses as addressed.

**Legacy write adapter:** `POST /submissions/:id/feedback` remains routed and accepts the existing payload. It preserves comments, paragraph references and original criterion values as clearly labeled notes in a canonical review draft, returning HTTP 201 with `submitted:false`, `requiresCompletion:true` and assignment/request/review IDs. Legacy scores are not translated into different modern criteria, and an integrity score never becomes a completed checklist. The client must open the returned workspace to finish and submit. An already populated structured draft is protected from overwrite (409 with workspace IDs). Historical reads remain compatible. This preserves the endpoint and entered feedback while intentionally requiring the new mandatory checks for formal submission.

Four additive forward migrations add integrity/idempotency metadata, revision-item locators, the `MENTOR_GUIDANCE` origin while preserving legacy origins, and response `DRAFT` status. No historical content is rewritten. All 157 migrations were replayed successfully in a new isolated PostgreSQL database. Following implementation verification, the four feature migrations were also applied to the local application database during the authorized rollout in section 10.

## 7. Files changed for this feature

Backend:

- `apps/backend/prisma/review.prisma` and migrations `20261113120000` through `20261113120300`.
- `apps/backend/src/modules/reviews/academic-review.rules.ts`, `peer-review-access.ts`, `review-request.service.ts`, `review-template.service.ts`, `review.service.ts`, `review.routes.ts`.
- New `mentor-review-access.ts`, `review-notifications.ts`, `scientific-review.rules.ts` in that module.
- `apps/backend/src/modules/submissions/submission.service.ts`, `submission.routes.ts`.
- `apps/backend/src/modules/projects/scientific-integrity.service.ts`.
- Backend review/submission regression tests, new mentor persistence and integrity-rules tests.
- `apps/backend/scripts/test-mentor-review.mjs`, `verify-mentor-review-ui.mjs`, `mentor-review-browser-fixture.ts`.

Shared and web:

- `packages/shared-types/src/research-review.ts`, new `scientific-review.ts`, `index.ts` export.
- `apps/web/src/pages/submissions/submission-detail.tsx`.
- `apps/web/src/pages/reviews/review-workspace.tsx`, `review-request-detail.tsx`.
- Review API, hooks, invitation dialog, new integrity checklist, assigned-revision reader and scoring model.
- `apps/web/src/features/submissions/api/submissions.api.ts`.
- Existing project readiness component and new `submission-readiness-model.ts`.
- EN/VI scientific-review dictionary and locale registrations.
- Six web review/readiness test files, alongside existing submission/compare regressions.
- This report and synthetic browser evidence under `docs/verification/mentor-review/`.

## 8. Verification and reproduction

Tests run against dedicated local PostgreSQL `lumigap_mentor_review_test_fresh` and Redis database 14. No real AI job was enqueued; AI responses in regression tests are mocked.

```powershell
node apps/backend/scripts/test-mentor-review.mjs --env-file <local-env-path> --database lumigap_mentor_review_test_fresh --regressions
```

The runner refuses non-local databases/Redis and derives a dedicated test database. It does not drop the application database. The browser fixture runner requires the dedicated test database and creates synthetic accounts only:

```powershell
node apps/backend/scripts/verify-mentor-review-ui.mjs <local-env-path>
# For the web dev server: API_PORT=4096, VITE_API_BASE=http://127.0.0.1:4096/api/v1
# Start Vite on port 8098. Run --api-only to reuse existing test fixtures.
```

Executed checks (all passed):

| Check | Actual result |
| --- | --- |
| PostgreSQL/API persistence and regressions | 48 tests: 13 mentor workflow, 16 peer review, 10 submission boundaries, 9 AI pre-review |
| Backend rules, legacy adapter, submission inputs and PostgreSQL runtime audit | 28 tests across six files |
| Web review, response drafts, PDF reader, scoring, readiness statement and submission regressions | 28 tests across ten files |
| Shared-types TypeScript build | Passed |
| Backend TypeScript check/build and auth-mail asset copy | Passed |
| Prisma schema validation and client generation | Passed |
| Web TypeScript check, production Vite build and bundle budget | Passed |
| Targeted backend and web ESLint | Passed without errors or warnings after cleanup |
| `git diff --check` | Passed |

Total: **104 relevant automated tests passed**. This is not a claim that the entire repository test suite ran. Builds emitted the existing Browserslist age notice and large lazy-chunk warnings; the enforced initial bundle budget passed. Heavy builds were run natively; the later local rollout packaged the built output in incremental Docker images.

Mentor item-verification commands also carry the expected manuscript revision. A stale v2 screen cannot accept a response submitted against v3; the authenticated API integration test verifies the 409 rejection and a successful v3 verification.

### Actual two-account browser journey

The initial project, mentor policy and v1 text snapshot were created by the test fixture. The following actions used the actual UI and authenticated local backend, not mocked page responses:

1. Student logged in, requested review of v1 using the recommended SYSTEM rubric and assigned mentor.
2. Mentor logged in through a separate origin/session, saw the incoming request, accepted and opened the pinned v1. All eight scores and integrity checks initially showed unassessed.
3. Mentor explicitly selected scores/checks, added major/minor changes with a verified source quotation and section references, saved a draft and submitted major revision.
4. Student created immutable v2 in the Markdown UI, responded to both changes, saved private drafts, reloaded and confirmed the responses were restored, then resubmitted.
5. Mentor opened v2, viewed the text diff, accepted the major change, reopened the minor change and submitted a minor-revision review.
6. Student created v3 in the UI, responded to the reopened item and resubmitted.
7. Mentor verified the final change, completed a fresh rubric/checklist and submitted internal readiness. Student saw all three historical reviews and the internal-readiness disclaimer.
8. Student opened the separate readiness package. After the confirmed gate defect was fixed, it correctly showed pending authorship and **ĐANG HOÀN TẤT** despite mentor approval.

Evidence: [three review rounds](verification/mentor-review/student-v3-result.jpg), [separate pending author gate](verification/mentor-review/authorship-gate-pending.jpg).

The observed browser viewport was 699px wide, without horizontal overflow on the review detail. A requested desktop viewport override was not honored by the browser surface; a separate desktop/mobile breakpoint sweep is not claimed.

## 9. Reference guidance and limits

The weighting and internal decisions above are LumiGap policy, not an IEEE/ACM/Nature-mandated 100-point rubric. Guidance used for the design:

- [IEEE Access reviewer best practices](https://ieeeaccess.ieee.org/reviewers/reviewer-best-practices/): constructive, confidential scientific assessment.
- [PLOS ONE reviewer guidelines](https://journals.plos.org/plosone/s/reviewer-guidelines): methods, reproducibility and evidence appropriate to the article type.
- [ACM CHI reviewer guidance](https://chi2025.acm.org/guide-to-reviewing-papers/): reasoned contribution assessment and confidentiality.
- [Nature Communications Biology reviewer brief](https://www.nature.com/documents/commsbio-referee-brief-guide.pdf): specific, professional comments that help authors improve their work.
- [COPE ethical reviewer guidelines](https://members.publicationethics.org/files/u7140/Peer%20review%20guidelines.pdf): confidentiality, conflicts and constructive review. Internal mentoring is distinguished from independent external peer review.
- [EQUATOR reporting guidance](https://equator-network.org/about/reporting-guidelines.html): reporting completeness is distinct from research-design quality appraisal.

Remaining limits: no live LLM/provider call was tested; optional AI behavior was verified with mocked provider responses. Native PDF reading and manual page/section locators do not implement automatic PDF annotations or reliable PDF text anchors. PDF download authorization has regression coverage and the reader has component tests; the full two-account browser journey used text snapshots, not a real PDF upload. Dedicated systematic-review reporting checklists are not automatically enforced. Older direct-feedback clients must honor the additive `requiresCompletion` response and open the returned canonical workspace. Responsive breakpoint limitations are described above.

## 10. Authorized local Docker rollout — 2026-11-13

The user's request to update the local application was completed against the actual runtime checkout at `D:\lumi-gap`. Only the mentor-review feature was transferred; newer runtime changes, including the mentorship invitation dossier, were retained. No Git commit/push or production deployment was performed.

Before migration, a PostgreSQL custom-format backup and backups of overwritten source files and the exact previously served web assets were saved outside Git under `C:\Users\tdinh\.codex\local-backups\mentor-review-20261113`. This folder contains private local backup material and must not be committed.

The four feature migrations (`20261113120000` through `20261113120300`) were executed transactionally and registered through Prisma only after successful execution. An unrelated pending OpenAlex uniqueness migration was left untouched because existing duplicate IDs prevent it from applying safely. The feature migration ledger has no incomplete entries. Existing counts remained 12 submissions, 12 manuscript revisions and 0 human reviews. All seven published scientific SYSTEM templates are present, each with eight criteria and a total weight of 100.

Shared-types, Prisma client generation, backend compilation and auth-mail asset copy, and web TypeScript/production build passed in the runtime checkout. Incremental images `lumigap-backend:mentor-review-20261113` and `lumigap-web:mentor-review-20261113` were built from that output and activated through the local image tags. Backend, web, notification worker and manuscript compilation worker were recreated; PostgreSQL/Redis data and unrelated workers were not restarted.

Post-update smoke checks passed:

- Backend `/health` and `/ready`: HTTP 200; Docker health is healthy.
- Web root, `/reviews` and `/submissions`: HTTP 200.
- Proxied unauthenticated `/api/v1/auth/me`: expected HTTP 401.
- Nginx configuration validation: passed.
- Live HTML matches the runtime build; entry assets and the review workspace, review detail and submission detail chunks return HTTP 200.
- All four recreated containers use their expected new image IDs and have zero restarts at verification.

The full authenticated two-account workflow was verified previously against the isolated test database, as documented above. No synthetic users or test reviews were inserted into the local application database during this rollout.
