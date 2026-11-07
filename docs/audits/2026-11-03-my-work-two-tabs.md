# Việc của tôi: Cần xử lý / Đã đánh giá

Date: 2026-11-03

## Behavior

- Default to Cần xử lý: unfinished claims, a pending agreement response, reviewer discussion before an active case, the caller's missing case statement, and an actionable independent adjudication/coordinator task.
- A submitted statement waiting on somebody else is not an action. Case requests suppress ordinary discussion tasks. Read-only projects show no writable tasks.
- Đã đánh giá includes every actual submitted ballot, including a ballot whose assignment was subsequently deactivated or reopened for revision. It is no longer restricted to final team decisions.
- A personal choice comes only from the reviewer's latest actual ScreeningReview. A final decision never supplies or changes a personal choice. No default INCLUDE is invented for missing reviews.
- Show Đánh giá của bạn and Kết quả của nhóm separately. Final adjudicated outcomes explicitly say sau phân xử and retain the resolver attribution.
- Search in both tabs; a small native group-status select is shown only in Đã đánh giá.
- Count distinct papers separately in each tab. A paper may belong to both. Earlier phases/rounds remain available under the same paper, with their own choices and results.
- No migration or review/history mutation. The summary retains its existing project access boundary and reads only the caller's statement metadata, without sealed statement text.

## Verification

- Web: 44 tests in adjudication-reminder, task-first-papers-workspace, screening-workspace; 4 my-work-model tests passed.
- Web production build passed. Final web and backend TypeScript checks passed, including the reopened-ballot history-query refinement. Targeted diff whitespace checks passed.
- PostgreSQL regression run passed screening (79), adjudication cases (28, including the new independent personal/team outcome test) and the first 7 collaboration tests.
- The first broad run was interrupted by Docker engine failure. After the user restarted Docker, a targeted rerun covered 65 cases: 63 passed initially; the reminder test hit a cold-start interactive transaction timeout and the new outsider fixture was rejected before membership checks because its email was unverified. The fixture now verifies its fake email. Both cases passed their final targeted rerun (2/2); skipped cases in these commands were intentionally excluded by testNamePattern. All 177 cases across the six persistence suites have passed across the completed batches. No business transaction timeout was relaxed.
- Recovery commands: node apps/backend/scripts/test-screening-cases.mjs --regression --slow with testNamePattern for the interrupted suites and the two personal-work cases, followed by a final testNamePattern=workspace reminder|keeps every submitted ballot rerun.
- Browser fixture: desktop and 390px mobile, distinct counters 2 and 5, separate personal/group values, no horizontal overflow. Screenshots: artifacts/my-work-two-tabs/. The excluded filter was also verified in the browser: personal INCLUDE remained visible alongside EXCLUDED after adjudication.
- Local backend emit build passed (tsc -p tsconfig.build.json); emitted screening.service.js also passed node --check. The built project-detail bundle was checked to contain the new work-tab copy.
- Docker image builds again lost engine connectivity under memory pressure (Windows had about 1.2 GB free; WSL had about 140 MB available and no swap). The build was cancelled. Docker restart then failed on the existing dockerInference socket. The user was asked to remove the two temporary sockets because automatic approval review had previously blocked that operation. No socket files, volumes or application data were deleted by this task.
- Localhost runtime update completed after socket recovery: the running backend image reports 129 migrations, schema up to date. Copied the newly emitted screening.service.js and its map into the backend container, restarted the backend, and copied the completed web assets followed by index.html into nginx. GET http://localhost:4000/ready returned 200; the served project-detail bundle returned 200 and contains the new two-tab UI copy.
- The browser reached the real localhost project route, but its session is signed out, so the private project was correctly denied. Authenticated UI behavior was verified in the fixture and tests, not by claiming a logged-in live browser check.
- Runtime limitation: Docker image rebuild failed from engine/memory pressure. This update is in the currently running containers and survives restart, but recreating containers from the old images will discard it until images are rebuilt from the changed repository. No schema changes are part of this task. No production deployment or automatic commit/push.

## Follow-up: consistent presentation in both tabs

- Both tabs now use WorkPaperCard, including active review claims, discussion tasks, missing statements, adjudication tasks and submitted ballots. Reuses the existing claimed-paper styling for metadata, title, border, padding and the action footer. Missing statements retain an amber highlight.
- Reviewed cards retain separate personal and group outcomes, filtering and earlier-round history. No backend or data changes in this follow-up.
- Verification: 19 related web tests passed, TypeScript and production build passed. Browser fixture checked desktop and 390px mobile with no horizontal overflow. Screenshots: artifacts/my-work-two-tabs/reviewed-unified-desktop.png, todo-unified-desktop.png and reviewed-unified-mobile.png.
