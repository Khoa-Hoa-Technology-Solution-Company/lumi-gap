# Long ballot rationale presentation

- Current ballots in the adjudication packet show a compact preview for long exclusion reasons, comments and full-text references. Text exceeding 180 characters or three lines gets a three-line preview and “Xem đầy đủ”. Short text stays inline.
- The full ballot opens in the existing accessible Dialog component. Its reviewer/decision/version header stays outside the scrollable body. Content preserves original whitespace and wraps unbroken tokens. Closing returns focus to the trigger.
- No data, backend validation limits, attribution or permissions changed. Rendering is plain React text, including in the dialog.
- Removed duplicate My Work queue sections restored by concurrent edits, preserving the user's preceding request.

## Verification

- 29/29 targeted tests passed: screening-adjudication (18), screening-case (11). New cases cover very long reasons, short versus long content, multiline text, unbroken strings, safe escaping, popup opening and closing.
- Web TypeScript, production Vite build and bundle budget passed (88 KiB entry, 567.4 KiB initial graph).
- Real-component fixture with long synthetic text and blocked live APIs checked on desktop and 412 × 892 mobile. Dialog client/scroll widths both 363px; reading region client/scroll widths both 316px, with vertical scrolling available. Close returned focus to “Xem đầy đủ phiếu Reviewer B”.
- Screenshots: `2026-11-02-ballot-long-preview.png`, `2026-11-02-ballot-long-dialog.png`, `2026-11-02-ballot-long-mobile.png`.
- Lightweight web image built successfully. Local deployment attempt failed when Docker engine returned HTTP 500 while inspecting the image. No Docker sockets, volumes or application data modified.
- Production output prepared at `C:/Users/tdinh/AppData/Local/Temp/lumigap-ballot-reader-20261102`.
