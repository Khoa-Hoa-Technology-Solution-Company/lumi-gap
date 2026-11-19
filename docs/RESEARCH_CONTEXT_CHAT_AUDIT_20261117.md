# Research-context chat audit and implementation

Workspace: `D:\lumi-gap`. Date: 17 November 2026.

## Audit and decisions

Existing Team Chat already used `ProjectTeamMessage`, `ProjectTeamMessageRead`, PostgreSQL persistence, HTTP writes with `clientKey`, an in-process SSE event hub, a shared composer/message presentation, basic cursor history, and notification/audit services. Personal AI has a separate private conversation API. Mentor Chat uses the existing accepted-relationship/access-policy workflow. Project discussions and Decision Journal already provide revision history and authorization.

Confirmed problems and fixes:

| Priority | Observed problem | Implementation |
| --- | --- | --- |
| P1 | SSE event channels were keyed by the URL project ID, so UUID and legacy-ID URLs could miss each other's messages. | Canonical project UUID is used for subscriptions and publications; authorization still resolves the incoming ID. |
| P1 | Reconnect resumed SSE but did not recover all missed messages. A newest-50 refresh could lose a larger gap. | On ready/reconnect, refetch authoritative history and walk forward from the saved cursor. HTTP polling remains a fallback even while SSE is connected. |
| P1 | Idempotency handled text only; reply/reference payload reuse could be ambiguous. | Transactional comparison covers normalized reply ID, text and reference IDs. Duplicate retries return the existing record without another notification/event. |
| P1 | Pagination used JavaScript Date precision for PostgreSQL timestamps. | Compare `(created_at,id)` against the original database row; serialize microseconds so browser sorting agrees. Regression tests use both tied timestamps and different microseconds. |
| P2 | One hydration query per message plus per-message users/reads. | Bounded page hydration batches replies, read receipts, context receipts and sender information. |
| P2 | Loading older messages changed the viewport. | Capture an actual visible message anchor and restore its position after prepend. Preserve follow-at-bottom behavior during resize and delayed reference rendering. |
| P2 | Ordinary history reads marked unseen messages read and emitted many update events. | Reading a page no longer marks every message read. The existing explicit mark-read path remains and rechecks membership transactionally. |
| P2 | Retry error retained text but lacked a direct retry action. | Keep input, show retry, retain the same receipt after uncertain HTTP failure and across remount/reload in the same tab. |
| P2 | Team messages had no research references, reply or keyword-search flow. | Extend the existing message API and shared presentation rather than creating another chat system. |

No new runtime library, database table, Prisma model or migration was added. No application history was rewritten or deleted. The local migration divergence previously documented in `RESEARCH_CONTRIBUTION_AUDIT_20261117.md` was not automatically repaired.

### Storage

- Message text/sender/project/time/deletion stay in `ProjectTeamMessage`.
- Replies use its existing `replyToId` column; only same-project, top-level team messages are accepted.
- Supplemental immutable context uses one append-only `ProjectActivity` receipt (`TEAM_CHAT_MESSAGE_SENT`, idempotency key `team-chat:<message-id>`). Metadata contains only the reference kind/ID, not copied title, manuscript text or file content.
- `TEAM_CHAT_MESSAGE_SENT` is excluded from the research-contribution meaningful-event taxonomy. Chat volume is not a CRediT contribution or ranking.
- Message and receipt, sender read marker and deduplicated notification intents persist in the same transaction before HTTP success.
- Decision creation reuses `projectDiscussionsService.saveDecision`, its existing authorization, idempotency receipt and version history. `TEAM_MESSAGE` is an authorized source-link kind; no parallel decision model exists.

An attempted use of workspace revisions was rejected by a real database CHECK constraint during development. Final code uses the existing activity receipt instead; no constraint was weakened and no migration history was edited.

## User experience

Existing Team Chat, My AI, With mentors, Threads and Decision log navigation is retained. There is no additional chat sidebar or new room model.

- Plus menu: Paper, Task, immutable manuscript snapshot, submitted manuscript revision.
- Searchable inline project reference picker with 250 ms debounce, loading/empty/error states and page controls.
- Reference preview in composer, removable without sending. Paper/Task/manuscript-version source actions navigate to Team Chat with a preselected reference, never auto-send.
- Reference cards resolve current authorized display metadata separately; unavailable/deleted sources show a neutral placeholder. Snapshot and revision URLs keep the original version ID.
- One-level reply selection/cancellation, short quote and jump to the original message. Deleted originals display a tombstone, including when a deletion event refers to an older unloaded original.
- Keyword search restricted to project Team Chat, paginated results with sender/time, context-window loading and highlighted jump target. A separate newer-page action returns from historical context.
- Message secondary actions use the existing Radix dropdown. Deletion retains current sender/owner/admin policy and uses server-confirmed updates.
- Save decision opens a short conclusion/rationale form and preserves the original source link. Saving does not auto-create a task or assert scientific agreement.
- Account/project-scoped session-storage drafts preserve text/reply/reference and uncertain send keys. Switching to Personal AI never copies team content into it. Storage failures retain the in-memory fallback.
- Enter/Shift+Enter, Vietnamese IME composition and touch-device Enter behavior are retained. Icon actions have labels, messages use a labeled log, controls retain focus, and no new motion is added.

## API

All below are authenticated, beneath `/api/v1/projects/:id/team-chat`:

| Route | Behavior |
| --- | --- |
| `POST /` | Existing send, extended with optional `replyToId` and `{kind,id}` reference. `clientKey` remains optional for old clients and is always sent by web. |
| `GET /` | Existing history; `beforeId`, `afterId`, `aroundId`, literal keyword `q`, bounded `limit`, and bounded comma-separated `ids` for cached-page refresh. Incompatible cursors are rejected. |
| `GET /references?kind=...&q=...&page=...` | Authorized project choices, 30 per page. |
| `GET /reference?kind=...&id=...` | Resolve current metadata and route after project/object authorization. |
| `GET /events` | Existing authenticated SSE with canonical room ID and live account/session checks. |
| `POST /:messageId/read` | Existing explicit read marker, membership rechecked inside transaction. |
| `DELETE /:messageId` | Existing tombstone and audit behavior; no destructive message deletion. |

Reference kinds: `PAPER`, `TASK`, `MANUSCRIPT_SNAPSHOT`, `SUBMISSION_REVISION`. No arbitrary external URLs, HTML or client-supplied titles are accepted.

## Security and privacy

Team Chat requires current project membership. Pending or accepted mentorship alone never grants Team Chat access; the separate Mentor channel remains the communication boundary for accepted mentors. Reference read/share follows existing team manuscript/task access, not a new grant. Cross-project replies, references, cursors, search and source IDs are rejected.

Inputs use strict Zod DTOs, authenticated identity, existing `createRateLimiter`, bounded queries and parameterized Prisma SQL. Message content is rendered as React text, never HTML. Search wildcard characters are escaped. Notifications contain generic text, no manuscript excerpts. Reference access errors hide previously cached metadata and links. Soft-deleted projects/accounts and revoked membership are checked by the existing workspace access layer; SSE reauthorizes before sending events and at heartbeat.

## Library research

Official sources consulted:

- [shadcn chat components](https://ui.shadcn.com/docs/changelog/2026-06-chat-components), [MessageScroller](https://ui.shadcn.com/docs/components/base/message-scroller), [Command](https://ui.shadcn.com/docs/components/base/command).
- [TanStack Virtual chat](https://tanstack.com/virtual/latest/docs/chat).
- [Socket.IO delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/).
- [Tiptap Mention](https://tiptap.dev/docs/editor/extensions/nodes/mention).
- [Playwright visual comparison](https://playwright.dev/docs/test-snapshots).
- [Zotero groups](https://www.zotero.org/support/groups), [Slack search](https://slack.com/help/articles/202528808-Search-in-Slack). The supplied Overleaf page was inaccessible from the research tool; existing manuscript snapshot/comment/review workflows were inspected directly instead.

The repo already has React 18, TanStack Query, Radix dropdown/dialog, textarea, buttons, and its own chat scroll hook. Command/cmdk and MessageScroller were not installed: the inline bounded picker and existing scroll hook address the actual task without replacing the design system. TanStack Virtual was considered but not added: initial history is paginated, and no measured performance case justified adding/replacing the list engine here. Tiptap exists for manuscript editing, but adding rich text/mentions to this simple composer would exceed the request. Socket.IO was not introduced; the existing SSE+HTTP architecture was kept, with application-level recovery/idempotency.

## Verification

The test runner creates a randomly named local PostgreSQL database, replays checked-in migrations, and removes only that disposable database afterward. It never resets or migrates the application database.

| Check | Result |
| --- | --- |
| Web chat, tasks/artifact links, workspace coordination and manuscript editor | 98 passed (includes 22 chat/scroll tests) |
| Latest focused web chat rerun | 22 passed; the same tests are included in the 98 above |
| PostgreSQL, authenticated HTTP, SSE and two-account Playwright | 12 passed, including the two-account browser scenario; final browser result recorded in `apps/backend/research-chat-browser-final.log` |
| Shared types compilation, backend typecheck and production TypeScript build | Passed |
| Web production build | Passed; existing mixed static/dynamic import and Browserslist warnings remain |
| Targeted frontend/backend ESLint and scoped diff whitespace check | Passed |
| Native local application | Web 8080 HTTP 200; backend `/ready` HTTP 200 |

Browser assertions cover two isolated accounts, realtime receive/reload, a saved write with deliberately lost HTTP response and same-key retry, all four reference destinations, old-message search/navigation, Decision Journal and its return link, read-above behavior, prepend anchoring, resize following, deleted reply placeholders and escaped dangerous/Unicode text. Screenshots were inspected directly. Both identical-millisecond and distinct-microsecond database boundaries are tested. Revoked membership closes an already-open SSE stream. Supplemental permission tests reject outsider, mentor-only and cross-project access.

A broader manuscript test initially had a stale API mock and omitted the existing `canManageGithub` permission, and a task-board test did not wait for the existing lazy import. Those test fixtures/waits were corrected without changing the GitHub or task workflow implementation.

Commands:

```text
apps/backend: node scripts/test-mentor-workspace.mjs --chat-only --chat-browser
apps/backend: pnpm exec tsc --noEmit
apps/backend: pnpm exec tsc -p tsconfig.build.json
apps/web: pnpm exec vitest run src/features/projects/__tests__/project-chat-usability.test.tsx src/features/projects/__tests__/workspace-task-artifacts.test.tsx src/features/projects/__tests__/workspace-coordination.test.tsx src/features/manuscripts/__tests__/manuscript-workspace.test.tsx --maxWorkers=1 --minWorkers=1
apps/web: pnpm build
packages/shared-types: pnpm exec tsc -p tsconfig.json
```

Targeted ESLint and `git diff --check` are also run. Real two-account Playwright uses headless Edge, isolated sessions and actual API/database records, not mocked production data. Screenshots are in `docs/audits/2026-11-17-research-chat/` (desktop/tablet/mobile, dark mode, picker, preview, search and error). Screenshots are inspection evidence, not an established automated image baseline.

## Changed-file map

- Shared contracts: `packages/shared-types/src/project.ts`, `project-workspace.ts`.
- Backend: project team chat service/controller/DTO/routes; new `project-chat-references.service.ts`; existing `workspace-access.ts`, workspace DTO and overview artifact resolver extended for `TEAM_MESSAGE` source links.
- Web: team chat API/panel, shared chat primitives and scroll hook; new `research-chat-tools.tsx`; chat CSS; Library/Task/manuscript-version share actions; submission version URL selection; workspace source link and chat locale composition.
- Tests: new PostgreSQL/HTTP/SSE integration and Playwright fixture; chat usability extensions; manuscript mock corrected for existing `remoteHistory` and GitHub permission, and lazy-task-board test explicitly awaits imports.
- Tooling: existing isolated mentor test runner adds `--chat-only`/`--chat-browser`.

## Limits and release considerations

- Existing local migration divergence remains a P1 environment/release concern, independent of this schema-free chat change. See the previous contribution audit; do not blindly apply pending migrations.
- SSE hub remains in-process. HTTP catch-up/polling recovers missed events across reconnects or separate processes; this is not a durable cross-instance realtime broker or delivery guarantee during an indefinite server outage.
- Initial message history is bounded. Manually loading many thousands of messages can grow the DOM; a measured large-history virtualization exercise remains future work. No claim of a 10,000-message/device stress test is made.
- Real browser testing covers desktop/tablet/mobile viewport emulation and keyboard input, not physical mobile software keyboards or several physical devices. No axe dependency is installed; semantic/keyboard behavior is tested, not a full automated WCAG certification.
- Team Chat did not previously support message editing. No unaudited edit workflow was added; existing tombstone deletion is retained.
- No generic file uploader, AI analysis, automatic task creation, new forum, new room system or contribution scoring was added.

No commit, push or deployment was performed. Unrelated existing modifications in the workspace were preserved.
