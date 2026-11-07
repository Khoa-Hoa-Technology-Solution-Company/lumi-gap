# Single-round acceptance and accepted papers

## Requested behavior

Two matching INCLUDE ballots finish current screening. A successful title/abstract
round must not silently create another full-text task. Personal ballots remain
independent of the project decision. My Work has three independently counted tabs:
Cần xử lý, Đã đánh giá, and Được chấp nhận.

## Implementation

- Current settings use workflow 10 and default to title/abstract only. Workflows
  5 onward finish acceptance in the current round even if an older settings
  snapshot lists two stages. Historical protocols before 5 retain explicit stage
  behavior. An explicitly authorized provisional information request remains
  separate from acceptance.
- Project classification, extraction eligibility, and the accepted list use the
  same stage predicate. No full-text reading is inferred from acceptance.
- The accepted list is project-scoped, includes only the active accepted round
  and its latest final decision, and is independent of the caller's personal vote.
  Reopened, excluded, disputed, and legacy-audit sources do not qualify.
- The data migration retires only an automatic, non-provisional full-text round
  with no assignments, decisions, cases, or subsequent events, following an
  accepted title/abstract round. It reactivates the accepted predecessor and logs
  SINGLE_ROUND_ACCEPTANCE. Every snapshot, ballot, decision and old round remains.
- Existing project access checks wrap the summary. No project identifier is
  embedded in application code or migration SQL.

## Verification

- Web: 54 tests passed, including independent counters, acceptance versus personal
  exclusion, search, keyboard navigation, and existing workspace flows.
- Calculator: 31 tests passed, including stage behavior across workflow versions.
- PostgreSQL: migration preservation/replay tests and current acceptance tests
  passed in the isolated workflow suite. The first broader run passed 141/145;
  four older expectations required updates for the one-round flow, explicit
  full-text opt-in, and previously simplified adjudication/source URL contracts.
- Backend TypeScript emit and web production builds passed.
- Browser fixture verified desktop and 390px mobile; no horizontal overflow.
  Screenshots: artifacts/my-work-two-tabs/accepted-papers-{desktop,mobile}.png.

- The four adjusted regression cases passed in targeted reruns (2 + 2). All
  145 cases in the original workflow/calculator/slots/migration batch have passed
  across the completed runs. No tests were removed or disabled.
- Applied migration 20261103120000 to localhost and copied the compiled backend
  modules plus completed web bundle to the running containers. Backend readiness
  and the served project bundle returned HTTP 200.
- Verified the referenced project's actual service summary: one accepted paper,
  restored round INCLUDED with 2/2 ballots, extractionReady true, accepted list
  includes the restored paper, and zero unfinished claims for that paper. Its
  untouched full-text followup remains stored with active=false. No authenticated
  browser session was used; UI appearance was checked using fixture data.
- Runtime update is in the existing containers; recreating from old images
  requires rebuilding the images from the updated repository.
