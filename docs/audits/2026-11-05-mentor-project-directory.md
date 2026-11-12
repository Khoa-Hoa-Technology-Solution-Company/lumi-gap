# Accepted mentorships in the project directory

## Cause and fix

The project directory queried only owned projects and active team memberships. An accepted mentorship grants scoped access without adding the mentor to that membership list, so accepted projects appeared only in Academic Support.

- Reuse the authenticated Academic Support `mine?view=active` endpoint, loading relationship pages with its maximum supported page size of 30.
- Keep only this actor's active relationships whose backend actions allow opening the project. Deduplicate by project and avoid a second directory row for an existing team project.
- Add a mentoring section to the project directory and compact project picker, with role, actual project stage and direct links to the scoped mentor overview.
- When mentorships exist, show the directory at `/projects` instead of an empty workspace or automatic redirect into a team project. Include mentorships in the heading count.
- Keep loading/error/retry states distinct from a genuinely empty list. Existing mentorship mutations invalidate the actor-scoped Academic Support query prefix; the directory also refreshes periodically.
- Keep the existing team-project API, backend authorization and data unchanged. No new permissions, memberships or migrations.

## Verification

- 38/38 web tests passed: mentor entry/directory, pagination and permission filtering, existing project directory and workspace navigation.
- Web TypeScript and production build passed; pre-existing Browserslist and chunk-size warnings remain.
- Scoped `git diff --check` passed.
- Published web entry `assets/index-DU63P8Rf.js` to localhost. Served index matches the build; all eight entry assets returned 200.
- Live verification as the accepted demo mentor: `/projects` displays LumiGap and An toàn mã nguồn trong dự án sinh viên (Demo), count 2, with no empty-project message. Clicking LumiGap opens its scoped mentor overview successfully.
- Desktop and 390px mobile checked; no horizontal overflow. Restored the browser viewport after checking.
- During live checking, corrected an initial page-size mismatch (50 vs the endpoint's actual limit of 30), then reran the tests, rebuilt and verified the final deployment.

Screenshots: [desktop](2026-11-05-mentor-project-directory.png), [mobile](2026-11-05-mentor-project-directory-mobile.png).
