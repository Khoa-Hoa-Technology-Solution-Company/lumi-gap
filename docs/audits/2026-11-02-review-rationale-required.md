# Required screening rationale

- The personal ballot now requires a trimmed rationale of at least three characters for INCLUDE, EXCLUDE and UNSURE. Both the submit handler and disabled button guard this requirement; textareas are required and explain the requirement.
- Editing an INCLUDE/UNSURE ballot starts with its saved comment instead of the empty exclusion reason. Clearing that rationale blocks the update.
- The screening submission DTO validates the appropriate rationale field for each decision. The service parses the same DTO before executing the command, covering internal callers as well as HTTP validation. Existing stored ballots remain unchanged.
- Web screening-workspace suite: 29 tests passed. Backend screening calculator/request-boundary suite: 30 tests passed. These include blank, whitespace, short, valid, wrong-field and edited ballot cases.
- Web TypeScript and backend production TypeScript compilation passed. Vite production build and bundle budget passed (88 KiB entry, 567.4 KiB initial graph).
- Visual QA used real components with synthetic data and live APIs blocked: INCLUDE submit was disabled with no rationale, enabled with a written rationale, and disabled again when cleared. No live ballot was submitted.
- Screenshot: `2026-11-02-review-rationale-required.png`.
- Local backend/web deployment completed with healthy containers. `/ready` returned 200 and the served index matches the isolated production build.
