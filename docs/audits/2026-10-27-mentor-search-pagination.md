# Mentor search pagination

Scope: project support tab, mentor discovery results.

## Changes

- Default to six mentors per server page; offer 6, 12, and 24 results per page.
- Show result range, total count, Previous/Next, and bounded numbered pages, including single-page results.
- Preserve filters between pages and reset to page one when filters or page size change.
- Correct the current page after the directory shrinks; reset search state between projects.
- Retain results while fetching and disable invitation actions until fresh results arrive.
- Scroll to the results heading when changing pages or page size; wrap controls on mobile.

## Verification

- Academic support unit tests: 18 passed.
- Playwright desktop (1440 × 1000) and mobile (390 × 844): 2 passed. GET-only fixtures cover server pagination, filter preservation, page-size reset, and horizontal overflow. No real invitations or writes were sent.
- Scoped ESLint, web build/typecheck, and diff whitespace checks passed.
- Locale suite: 11/12 passed. The static text audit flags 10 strings from other existing changes; the full locale suite is not green.
- Local web image rebuilt and deployed. HTTP 200; served index matches the built index (SHA-256 `f572d310281b24ec9c59d382ff3c7e430297b4dd8f67f42f04b24c6b8355202c`).

Browser screenshots are generated under `apps/web/test-results/browser/mentor-pagination-*/mentor-pagination.png`.
