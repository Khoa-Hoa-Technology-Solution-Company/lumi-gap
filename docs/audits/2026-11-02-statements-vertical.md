# Vertical reviewer statements

- Removed equal-height, side-by-side reviewer cards. The current reviewer's editor appears first and fills the available width. A/B labels remain bound to the original statement order.
- The other reviewer's pending/sealed state uses a compact line, without a blank card. No sealed content is revealed. When visible, submitted opinions are stacked vertically.
- Preserved draft, locking, stale-version, permissions and submission behavior.
- 31/31 targeted tests passed: screening-case (13) and screening-adjudication (18). New tests cover both A and B getting their own editor first, stable labels, sealed content hiding and successful submissions.
- Web TypeScript, isolated Vite production build and bundle budget passed (88 KiB entry, 567.4 KiB initial graph).
- Real-component fixture checked on desktop and 412px mobile. Mobile document client/scroll widths match (397px); editor width is 365px. No live opinion submitted. Screenshots: `2026-11-02-statements-vertical-desktop.png`, `2026-11-02-statements-vertical-mobile.png`.
- Isolated fixture Vite dependency cache to prevent duplicate-React failures when multiple local previews run concurrently.
- Lightweight web image built; web service recreated successfully and reported healthy. This build also contains the pending long-ballot dialog and removal of duplicate lower My Work queue content from preceding requests.
