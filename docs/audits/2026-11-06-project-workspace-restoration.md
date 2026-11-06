# Project workspace UI restoration

## Cause

The submission fix was isolated on a branch based on main while newer project UI changes remained uncommitted in `D:\lumi-gap`. Publishing that branch's web build replaced the newer local project interface with main's older interface. The original source changes were preserved, but omitted from the pushed submission branch and its deployment.

## Recovery

Recovered the project UI and its corresponding API/types/schema changes from the preserved working directory using a three-way patch against the original Git base. This retained upstream main changes and the submission fixes already committed. The private project creation changes were staged before applying the recovery patch and remain present.

Restored areas include:

- My Work: separate actionable work, personal review history and project acceptance tabs, shared paper cards, deadlines and status colors.
- Screening: independent ballots, compact decisions, read-only history, reviewer discussion, unread message cues and direct adjudication.
- Tasks: automatic screening obligations and links to the correct round and action.
- Paper proposals and adding papers: existing project membership/duplicate indicators and current screening eligibility.
- Mentor project entry, project directory, shared message UI, participant profile links and mentor-only task visibility.
- Corresponding backend projections, permission checks, notification navigation, shared types and three previously uncommitted screening migrations.

The separate unfinished submission mentor-feedback prototype was left in the original directory. This recovery retains the tested submission workflow from the submission-fix branch. No files were deleted from the original working directory.

## Verification

- Compared ten restored UI source files against the preserved source after normalizing line endings/trailing whitespace. All matched, including My Work, paper cards, reviewer discussion/actions, mentor messages, task entry, project navigation and adding papers.
- Web regression: 668 tests across 50 files were covered. The initial full run passed 637 and failed 31 in two suites. A fixed historical deadline was made deterministic in the reminder fixture; the adjudication suite's initial cold-load timeout was rerun with a 20-second per-test limit. Both affected suites then passed all 42 tests, covering every initial failure. No production timeout or expired-task rule was relaxed.
- Backend rules: 74 tests passed across screening decisions/stages, project authorization and mentorship rules.
- Disposable PostgreSQL: 46 tests passed across automatic screening obligations and versioned screening stages; three additional project creation/idempotency tests passed. Application data was not used for fixtures.
- Shared types compiled; frontend typecheck and Vite production build passed; backend production typecheck passed; staged whitespace checks passed after removing restored trailing whitespace.
- Published the restored branch's web build to the existing localhost web container, preserving previous hashed assets. The served index matched the local build and every referenced entry asset returned 200. Web and backend readiness returned 200.

Direct Chrome inspection was stopped by the computer-use tool because it could not determine the browser URL reliably. No post-deployment browser screenshot or author-role live mutation is claimed. UI behavior was checked through component tests and build/source verification.

## Deployment provenance

Use the restoration branch when rebuilding this workspace. The earlier submission-only branch intentionally did not contain these project UI changes and must not be treated as the complete local workspace snapshot. Keep a backup of the served index and verify the build source before replacing localhost assets.
