# Collaborative writing implementation architecture

14 October 2026. This extends the existing React 18/Vite, Express 5, Prisma/PostgreSQL application.

## Reuse and boundaries

`DraftWorkspace` becomes the canonical manuscript container with multiple LaTeX manuscripts per project. Existing section workspaces remain LEGACY and keep their current behavior. Project membership, account/session checks and transaction locks remain authoritative. ProjectDiscussion and ProjectTeamMessage remain the comment/reply stores. Mentor feedback shares an immutable snapshot through an active relationship. Formal review continues to use SubmissionRevision, ReviewRequest and ReviewerAssignment.

The native editor uses CodeMirror 6, Yjs and its maintained CodeMirror binding. A small authenticated WebSocket provider adds explicit durable receipts. Yjs handles text merging; no custom text-diff merge is introduced. PostgreSQL stores a binary checkpoint for every committed file state and an append-only update/receipt journal. Broadcast and receipt follow transaction commit. File metadata and coherent snapshots use the same project transaction lock. Text and bounded binary assets use separate PostgreSQL columns/tables, covered by the existing PostgreSQL backup boundary.

Only one collaboration gateway should serve the deployment initially. The gateway is attached to the persistent Node HTTP server, never a serverless handler. The socket URL has no credentials; origin validation and an authenticated initial message precede room admission. Every edit and periodic room audit recheck the active session and membership. Presence identity is server-derived. Room identifiers alone grant no access.

## Phases

1. Extend canonical manuscripts/files and add project-scoped list/create/editor routes.
2. Add authenticated CRDT transport, commit receipts, cursors, restart/reconnect recovery and collaborative metadata notifications.
3. Add canonical literature/BibTeX, context, discussions and coalesced writing activity.
4. Freeze coherent snapshots, restore to a new manuscript, share mentor feedback and pin formal review to a sealed SubmissionRevision.
5. Add compilation contracts and isolated-worker deployment instructions. Enable compilation only after an adequate runtime and abuse checks exist.
6. Execute database, two-session browser, revocation, convergence, recovery and responsive checks.

## Compilation gate

The available local Docker runtimes are runc/containerd and NVIDIA, with no gVisor or per-job microVM runtime. Public untrusted compilation is therefore BLOCKED here. A stock Docker container and `-no-shell-escape` do not satisfy the requested isolation boundary. No fake PDF, success state or unsafe fallback will stand in for a compiler. The editor must keep writing/export available and explain compiler availability.

## Design

Research teams work for extended periods on laptops in classrooms and offices, switching between source and evidence. Use LumiGap's existing light/dark tokens, compact toolbar and file rows, a readable monospace source pane and clear durability states. Desktop has files/source/preview; mobile exposes those panes as tabs. Comments and research references open alongside the current file without resetting its editor state.

## Primary references

[Yjs update and provider APIs](https://docs.yjs.dev/api/document-updates), [Yjs CodeMirror binding](https://github.com/yjs/y-codemirror.next), [ws authentication examples](https://github.com/websockets/ws), and the repository's [collaborative LaTeX ADR](adr/0001-collaborative-latex.md).
