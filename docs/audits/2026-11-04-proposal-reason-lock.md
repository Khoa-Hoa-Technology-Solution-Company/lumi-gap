# Proposal reason lock after review

## Rule

The proposer can edit the proposal reason until the first submitted ballot in that project. Claiming or assigning a reviewer alone does not lock the reason. Submitted ballots in inactive rounds and previous revisions keep it locked after reopening. Legacy submitted screening decisions also lock editing. Reviews of the same paper in a different project do not affect this proposal.

## Implementation

- `screening-proposal.ts` batches project-scoped review existence checks without returning ballot content.
- Board `canEditProposal` and the proposal mutation use the same rule. The mutation runs under the existing project transaction lock shared by ballot submission, preserving authorship checks, optimistic concurrency and audit history.
- My Proposals hides the edit action when locked. An already-open editor disables saving when refreshed permissions change, preserves the draft and displays API errors from stale clients.
- The existing Paper Detail editor also consumes `canEditProposal` and already disables saving after access changes.
- No migration or historical data modification.

## Verification

- Web: 51/51 passed across `task-first-papers-workspace` and `screening-workspace`, including a locked proposal, capability revoked while editing, backend rejection with draft retention, and the alternate detail editor.
- PostgreSQL: 4/4 targeted persistence tests passed: editable before ballots, timestamp/idempotent retry behavior, lock across first submission/reopen/new rounds, concurrent edit/submission, legacy votes and project isolation. Other suites were filtered out.
- Backend PostgreSQL runtime audit: 4/4 passed.
- Backend and web production builds passed.
- The first legacy test run used the wrong legacy decision enum; corrected its fixture to `INCLUDED` and reran all four targeted tests successfully.

Deployment uses the existing local containers; only the backend was restarted. No extra workers were started. Signed-in browser interaction was not performed; frontend behavior was verified with component tests and real database behavior with isolated PostgreSQL tests.

Local verification: backend `/ready` returned HTTP 200 with Redis and PostgreSQL healthy; web entry and all eight referenced assets returned HTTP 200. Nginx configuration was checked and reloaded after the backend restart to refresh its upstream address; the proxied unauthenticated projects endpoint returned the expected HTTP 401.
