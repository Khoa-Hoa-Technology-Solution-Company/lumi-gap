# Living Research Plan: implementation design

## Audit and decisions

The existing `ResearchPlan` is the canonical mutable plan. Its `questions` JSON array is also the canonical project question collection: gap derivation writes it, and evidence/task/artifact workflows reference its stable UUIDs. There is no separate project ResearchQuestion table to reconcile. Objectives are an ordered PostgreSQL string array, not individually addressable records. Keep that storage, with structured inline list editing; section feedback does not require per-objective anchors.

`ResearchPlan.approach` is already the source read by Project Settings. Screening criteria belong to `Project.inclusionCriteria/exclusionCriteria`; plan reads and writes must use these same fields. Problem and short project description remain distinct. Stage controls remain in Overview. Existing `PlanRevision` records and their immutable trigger stay intact, including imported/automatically created legacy revisions.

## Persistence boundary

Add scoped draft PATCH to the existing plan service. Each request includes changed fields, their exact original values, a revision number and a UUID retry key. Under existing account/project locks, compare only touched fields with the original values. Merge independent changes; reject conflicting fields with 409. Store a durable request receipt and audit revision with the existing activity/workspace-revision infrastructure. Authenticate and authorize every retry before reading its receipt. No client storage of private draft text.

Explicit snapshot creation captures canonical plan/question content and project criteria in one transaction. Restoring a snapshot updates the working draft at a new revision; it never changes a snapshot. The legacy full PUT remains an explicit save-and-snapshot compatibility API. Project settings and gap derivation stop creating plan snapshots implicitly. Initial/imported snapshots remain readable. Snapshot numbers retain the existing monotonically increasing draft revision numbers; gaps in history are expected because autosaves are not snapshots.

## Feedback

Reuse `ProjectDiscussion`, its replies, resolution history and notifications. Add a server-created context anchor with section and draft revision or immutable plan revision. Draft discussions remain team-only. Snapshot section discussions are visible only to team members and active verified mentors who have a live share of that exact revision. Never reanchor comments when the working draft changes. Keep old generic revision comments readable. Mentor feedback requests reuse the owner-only, idempotent plan-share flow; they remain advisory and separate from formal review assignments.

## UI and verification

Three main document sections: problem, ordered objectives and canonical questions. Details are collapsed initially. A compact header shows the truthful autosave state, history and explicit snapshot action. Debounced saves serialize requests, preserve edits typed during a request and retain uncertain requests for safe retry. Conflicts offer a per-field comparison/choice before retrying against the latest server state. Navigation/unload guards protect unsynchronized input. History, snapshot reading/restoration and contextual section discussions use existing accessible components.

Verify HTTP/PostgreSQL persistence, retry/race behavior, snapshots and source history, access revocation, archived writes, mentor section comments and formal-review denial. Verify actual browser autosave/reload, network failures, details/history/comments and responsive widths. Run relevant existing regressions, typecheck, targeted lint and production builds.

An additive SQL migration extends the workspace audit kind check with `PLAN_DRAFT`, retaining every existing kind including `MANUSCRIPT`. No plan fields, old revisions or comments are rewritten. Deploy the migration before the new backend. Roll back the application first if necessary; retain the widened constraint and audit rows. Narrowing the constraint would require deleting or relocating audit history and is not an automatic rollback operation.

Expired-session edits are retained for up to 30 minutes in this tab's JavaScript memory, scoped to the original account and project. Returning after sign-in resumes normal conflict-safe autosave. This is not browser storage or offline persistence; closing or reloading the tab ends that recovery window.
