# Simplified adjudication dossier

## Changes

- Removed the “Dùng phiếu đã ghi” action. New opinions require each reviewer to enter their own text; existing saved use-existing statements remain accurately represented.
- Removed dossier/assignment history and case-history navigation from the dossier UI.
- Source information is displayed directly below the two opinions, without the “Đọc bài báo và xem căn cứ” disclosure or its subtitle.
- The dossier shows paper metadata, abstract, protocol criteria/RQs and the two current ballots. Ballot history and pre-case discussion are not rendered in the dossier; the legacy sharing preview retains its explicit discussion-selection flow.
- No database, access-control or workflow changes. Original ballots, histories and provenance remain stored.

## Verification

- Web TypeScript build: passed.
- Targeted Vitest suites: screening-case (11), screening-adjudication (16), adjudication-reminder (3), 30/30 passed.
- Production Vite build: passed. Bundle budget passed: entry 88 KiB, initial graph 567.4 KiB.
- Isolated visual QA uses real components with fixture history/discussion and blocked live API calls. Desktop and 412 × 892 mobile checked; no horizontal overflow. No real opinions submitted.
- Built the static web layer and recreated only the web service. Web running and backend healthy; `/ready` returned 200; served index matches the isolated production build.
- Authenticated live dossier was not inspected in this browser session; visual verification used fixtures.

## Screenshots

- `2026-11-02-adjudication-clean-desktop.png`
- `2026-11-02-adjudication-clean-mobile.png`
