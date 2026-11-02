# Missing reviewer statement reminder

## Changes

- My Work shows a compact amber reminder above the queue advice when the current reviewer still owes an opinion. It includes the paper, actual common deadline and a direct “Nhập ý kiến ngay” button.
- The corresponding dispute row is highlighted and sorted before waiting rows. Missing opinions also appear under “Cần giải quyết”; total paper counts stay unique.
- Active case rows no longer disappear behind a duplicate discussion task.
- The backend derives `needsMyStatement` only from the caller's current packet submission metadata, a future deadline, an unlocked collecting case and an active round/project. It does not expose the other reviewer's sealed opinion.
- A submitted opinion, use of the original ballot, expired deadline or locked case removes the reminder. Current pending summaries refresh every 30 seconds; successful existing commands invalidate the summary immediately.
- No migration or new notification delivery is needed.

## Verification

- Web TypeScript and backend production TypeScript compilation passed. Isolated Vite production build passed.
- Existing case/adjudication tests: 26 passed. New reminder UI tests: 3/3 passed after correcting the test harness provider and waiting for Query's scheduled cache update.
- New PostgreSQL persistence regression passed after Docker recovery: 1 passed, 26 unrelated tests skipped by name filter. It covers each caller independently, current versus previous packet versions, expiry/lock and absence of sealed text. The runner uses isolated `lumigap_evidence_workspace_test`, never the application database.
- Production bundle budget passed: 88 KiB entry, 567.4 KiB initial graph.
- Real components tested in an isolated, explicitly labeled fixture with `/api/` denied. The reminder opens the correct dossier and disappears after “Dùng phiếu đã ghi”; the row returns to “Hồ sơ phân xử”. No live opinion was submitted.
- Desktop and 412px mobile screenshots: `2026-11-02-adjudication-reminder-desktop.png`, `2026-11-02-adjudication-reminder-mobile.png`. Reminder text and CTA fit the narrow viewport; the temporary viewport override was reset.

## Local runtime

Docker was initially restored and backend/web/notification worker became healthy; application counts remained 11 reviews, 3 statements and 0 final decisions. The browser session had expired and redirected the real dossier to login, so no live statement was submitted.

During followup verification Docker again became unavailable. Its first restart failed on `dockerInference`. After the user removed that socket, the next startup failed on `C:\Users\tdinh\AppData\Local\docker-secrets-engine\engine.sock`; Docker had already recreated `dockerInference` before aborting. User assistance was requested because automatic approval previously rejected socket deletion. The user removed both temporary sockets and reopened Docker. No volumes, database directories or application history were removed.

At 22:36 (UTC+7), the targeted database test passed and the reminder deployed successfully. Small image layers copied the compiled/current screening service and production web output into the existing local runtimes. `docker compose --parallel 1 up -d --no-deps --no-build --wait --wait-timeout 60 backend web` completed successfully. Backend and web are healthy; `/ready` confirms PostgreSQL and Redis. Served `index.html` matches the production output exactly. Deployed `screening.service.js` SHA-256 matches the host build: `72ba54dc6a5396b5f5dfa278892f16584692771f555062b2b9a0c019b8a61176`.

Before and after this final deployment, the application database contains 14 reviewer records, 4 statement records and 0 final decisions. These counts differ from the earlier recovery check because the application remained in use between sessions. No test or verification submitted a live opinion or conclusion.

The deployed My Work URL loads the app shell, but the browser used for verification has no signed-in account and correctly shows the access restriction. Authenticated live appearance is therefore not claimed; the real-component fixture and isolated persistence regression cover the missing-opinion behavior. The fixture server was stopped and its temporary tab closed.

No commit/push was performed.
