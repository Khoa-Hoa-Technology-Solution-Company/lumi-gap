# Gap result loading and paper selection

## Result loading failure

The local API logged Prisma P2022 for `GET /api/v1/gaps` filtered by the project and completed analysis: `research_gaps.global_evidence` did not exist. The analysis and its one candidate were already saved.

The running backend image contained 86 migration directories, while the repository contained 92. Its migration status therefore reported up to date against an incomplete migration bundle. Updating application output without updating the Prisma migration bundle had left the local schema behind the application.

Restored the complete checked-in Prisma directory in the local backend image and running backend container. Applied the six existing pending migrations with `prisma migrate deploy`:

- `20261015120000_gap_closure_protocol`
- `20261016000100_paper_review_analysis`
- `20261016000200_research_gap_global_evidence`
- `20261016000300_report_grounding_checks`
- `20261017120000_quality_assessment_details`
- `20261019120000_quality_project_assessments`

These existing migrations add fields/tables, relax quality-assessment nullability and retain counter-evidence relationships. No migration files were modified and no ad hoc table alterations were run. Migration status now finds all 92 migrations and reports up to date.

A read through the normal gap listing service, using the saved analysis's owning member and project filters, now returns the existing one candidate. This verification does not enqueue AI work or change account permissions. The API's authenticated browser session was not used for this service check.

Updated the Docker deployment guide to explain why checking an old image's migration bundle is insufficient.

## Selection and result UX

- Full-width paper list with leading native checkboxes and compact bibliographic metadata, replacing the large cards and separate setup column.
- Search and view filters share a toolbar. Count, limits, price and analyze action are grouped in the footer.
- Paper titles remain readable in full. Pointer selection avoids the large row focus outline; keyboard focus retains it.
- After completion, collapse the picker to a source summary and offer an explicit action to select papers for another analysis. Results appear immediately below it.
- Expanding/collapsing preserves edits; source counts come from the saved run's selected IDs when extraction details are omitted.
- Result-loading errors explain that the analysis is saved. “Reload results” only refetches saved results instead of enqueueing another analysis.

## Verification

- 23 discovery component tests and 12 locale tests passed.
- Scoped ESLint and web build/typecheck passed; existing bundle-size warnings remain.
- Four browser tests cover extraction/comparison/generation/completion, result GET failure/retry, ready-state picker collapse, selection preservation, no writes on result retry, and desktop/mobile overflow. Browser API responses are synthetic fixtures, so these tests do not invoke AI or spend credits.
- Screenshots inspected on desktop/mobile; final UI retains full paper titles and keyboard focus.
- Deployed the final web build locally, verified HTTP 200 and an exact `index.html` hash match (`5a8af4d8a53a31050204d484c6fca98afd41ccc802a3851c2abc7367b364d46c`). The two result-recovery/selection browser tests passed again after the final CSS refinements.

Screenshots: [desktop picker](2026-10-27-gap-selection-desktop.png), [mobile picker](2026-10-27-gap-selection-mobile.png), [saved results](2026-10-27-gap-saved-results.png).

No commit or push.
