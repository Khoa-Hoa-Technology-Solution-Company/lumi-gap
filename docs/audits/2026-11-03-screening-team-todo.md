# Screening work in Team tasks / To do

## Change

- `WorkspaceTasksPanel` opens the shared team board by default, including legacy `view=screening` URLs. The separate Screening navigation and nested work/history tabs are removed from this surface.
- `TaskBoardView` reads the existing actor/project-scoped Screening summary. `myWorkTasks` supplies only pending caller actions, with deduplication and deadline/read-only checks.
- Screening items appear beside manual tasks in TODO and list mode. Search and applicable assignee/status filters include them. Counts include both sources; automatic items cannot be dragged or manually marked done.
- Existing paper/round/section links and the adjudication dialog are retained. Sending an opinion or completing Screening work refreshes shared query data. Evaluation history remains in Papers.
- No backend, schema, task persistence or workflow changes are required for this integration.

## Verification

- 47/47 tests passed across `screening-team-tasks`, `screening-tasks-panel` and `workspace-coordination`.
- 25/25 regression tests passed across `my-work-model` and `screening-paper-card`.
- Web production build passed (`tsc -b` and Vite).
- Playwright fixture checks passed at 1280px and 390px for Papers and integrated Tasks board/list: correct TODO counts, no separate Screening navigation/tabs, no document overflow or browser errors. Fixtures use explicit mock data, not production records.
- Published built web assets to the existing localhost web container, preserving prior hashed assets and backing up the prior index. HTTP index and task chunk returned 200; served index matched the build.

## Scope of checks

Authenticated live project interactions were not replayed. Backend behavior is reused without modification; integration tests cover task navigation, visibility, query updates, filters and manual task movement.
