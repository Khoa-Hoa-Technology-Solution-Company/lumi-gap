# CRediT contribution and authorship verification

Verified 11 November 2026. See the [architecture audit and implementation](credit-attribution-hardening.md)
for the original gaps, permission rules, workflow, API additions and academic-policy boundaries.
**Local update:** after the user requested it, backend/web/notification-worker images
and four additive migrations were applied to localhost:8080. See the
[local update record](credit-attribution-local-update.md). Statements below about
isolated-only testing describe the implementation/verification phase before that update.
The subsequent [requirement-by-requirement recheck](credit-attribution-requirements-check.md)
found and corrected three additional gaps and improved checklist detail.

## Automated results

| Check | Actual result and evidence |
| --- | --- |
| Contribution, authorship, allocation and governance | 40 passed across five files. Includes 18 new PostgreSQL/API attribution cases and 22 allocation/rules/domain regressions. |
| Existing manuscript integrity and trust/security | 44 passed across two files (18 + 26). |
| Combined backend suites | **84 passed**, latest full run `apps/backend/scratch/credit-requirements-final.log`. The preceding implementation run had 81 cases. |
| PostgreSQL-only runtime boundary | **4 passed**, `apps/backend/scratch/credit-final-runtime.log`. |
| Frontend contribution, attribution, integrity and notification routing | **85 passed** across four files (12 + 11 + 12 + 50), `apps/web/scratch/credit-requirements-tests.log`. |
| Shared types | TypeScript compilation passed during implementation. |
| Backend types | Full no-emit check passed during implementation; latest production TypeScript compilation passed, `apps/backend/scratch/credit-requirements-types.log`. Auth-mail assets copied separately during implementation. |
| Web types and production build | Latest web TypeScript passed (`apps/web/scratch/credit-requirements-types.log`). Production build through the existing `node scripts/build.mjs` and its bundle-budget check passed, `credit-requirements-build.log`. No circular-chunk warning remained. |
| Scoped ESLint | No errors. Backend has four existing unused-symbol warnings in `research-integrity.service.ts`; web/new UI files are clean. Logs: `credit-final-lint.log` in each app and web `credit-final-polish-lint.log`. |
| Whitespace | `git diff --check` passed. |

The three backend files and four web files changed in the recheck also pass scoped
ESLint without errors or warnings (`credit-requirements-lint.log` in each app).

The first final extended run passed 80 of 81 cases; former-author declaration review
hit Prisma's default five-second transaction limit under concurrent build load.
That read path performs the same bounded integrity aggregation as the existing
30-second overview. Its transaction now uses a ten-second acquisition limit and
30-second execution limit. The complete final rerun passed all 81 cases without
weakening assertions or skipping the failed case.

Tests use local PostgreSQL database `lumigap_credit_attribution_test` and local Redis
database 13. The runner rejects non-local hosts, disables email delivery, deploys
forward migrations and never resets the application database:

```powershell
node apps/backend/scripts/test-credit-attribution.mjs --env-file D:\lumi-gap\.env --extended
```

Frontend command, from `apps/web`:

```powershell
node ../../node_modules/vitest/vitest.mjs run src/features/manuscripts/__tests__/credit-attribution.test.tsx src/features/manuscripts/__tests__/manuscript-integrity.test.tsx src/features/projects/__tests__/project-contributions.test.tsx src/features/notifications/utils/notification-destination.test.ts --maxWorkers=2 --minWorkers=1
```

Direct installed Node CLIs were used. No Turborepo configuration was changed.
The web production build used the app's existing Vite build script, which sets
`NODE_ENV=production` and runs its bundle-budget check. It completed in 4m 41s on this
machine. Existing Browserslist-age and large lazy-chunk advisories remain.

## What the integration tests prove

- Exactly 14 existing canonical enum values, official persistent IDs and LaTeX escaping.
- A student records work, a named participant acknowledges their own roles, and an
  independent peer reviews without impersonation. Owner proposals do not invent work
  for the owner; all-participant teams retain the self-recorded distinction.
- Repeated work and evidence do not inflate role summaries. Evidence fingerprints
  detect supported artifact changes and block obsolete positive acknowledgements.
- Correction drafts retain unresolved challenges. The affected reviewer can inspect
  and acknowledge a correction even after removal from its revised participant list.
- A scoped lecturer records substantive accepted feedback without project membership
  or unrelated library/task access. Former contributors retain scoped review access.
- An explicit author order, corresponding author, contact metadata, roles,
  non-author dispositions and publication policy are bound to an immutable snapshot.
- Each author confirms for themselves. Save does not imply proposer approval.
  Changed author order, roles, policy or snapshot requires renewed consent.
- Stale proposal versions and stale personal-decision IDs are rejected; duplicate
  retries are idempotent; concurrent seal/dispute has one serial outcome.
- An older approved snapshot cannot bypass a newer personal objection on the same
  manuscript. Positive approvals from other snapshots are never imported as consent.
- Pending contribution review is specific to the current viewer before counts and
  pagination. Creators, already-responded viewers and unnecessary extra independent
  reviews are excluded.
- Reordering an unchanged CRediT role set retains consent for authors and acknowledged
  people. Changing actual roles or author order still requires new individual approval.
- Unresolved concerns survive replacement declarations and snapshots. Institutional
  dispute resolution cannot be performed by the accused or unilaterally by an owner.
- Final sealing and statement export require the authoritative readiness result.
  Sealed declarations are immutable. Unchanged restored revisions retain original
  attribution/integrity references; changed Markdown does not reuse them.
- Authenticated HTTP routes reject forged identity, unrelated snapshots and
  cross-project access. Exports and contribution responses are private/no-store.
- The review-PDF grant covers exactly the selected compiled snapshot. It does not
  permit source, ZIP/assets, other snapshots or general project access.
- In-app review notifications route to the scoped declaration page using identifiers,
  with no private manuscript text or contact details in notification payloads.

These are real database and authenticated HTTP tests. Synthetic PDF bytes test access
control and headers, not TeX rendering. No new remote compilation, external provider
request, email, publisher submission or scientific certification is claimed.

## Browser verification

Browser QA uses synthetic `example.invalid` accounts, production web preview on
127.0.0.1:8098 and temporary API on 8097 against the isolated CRediT database.
The live application on localhost:8080 and its database were not updated.

Observed work records, independently acknowledged roles in the overview, all fourteen
roles with explanations and source links, and filtering the role picker to Software.
The scoped snapshot declaration lists the actual contributors, missing individual
approvals, author metadata and exact-version PDF availability. A snapshot without
compiled PDF gives an explicit instruction to ask the team to compile it.

Read-only CRediT display was shortened after visual QA: only declared roles appear as
source links, rather than fourteen disabled checkboxes for every author. Attribution
status labels and the internal-submission notice have English/Vietnamese text.

The synthetic author confirmed their own declaration through the UI. After reload,
only the other two authors remained in the blocking checklist, and statement export
remained disabled. This confirms one person's response does not approve for others.

At a 390 x 844 viewport, document client/scroll width were both 375 pixels; dialog
client/scroll width were both 326 pixels. The 15-pixel difference is the page
scrollbar. There was no horizontal document or dialog overflow. Mobile QA also found
the close button competing with the heading; the header now reserves room for the
button and wraps its title.
The final production bundle was reloaded and the mobile heading, translated status,
individual approval checklist and absence of horizontal overflow were verified again.
The temporary viewport override was reset afterward.
The follow-up checklist detail and source-label translations were checked through
React regression tests and a fresh production build; no second browser session was
started for these copy changes.

Screenshots are stored in
`C:/Users/tdinh/.codex/visualizations/2026/11/01/01a1972b-467a-7b40-aa60-375df14ce1f1/`:

- `credit-contributions-desktop.png`: deduplicated declared and acknowledged roles.
- `credit-attribution-desktop.png`: exact snapshot and remaining individual approvals.
- `credit-attribution-mobile.png`: responsive declaration review.

## Database and API scope

One additive migration belongs to this task:
`apps/backend/prisma/migrations/20261111110000_attribution_publication_policy/migration.sql`.
It adds `publication_policy JSONB NOT NULL DEFAULT '{}'` to the existing attribution
check table. Historical declarations retain their policy semantics. It was applied
only to the isolated test database; normal migration deployment is still required
before running this source against another database.

Existing contribution, acknowledgement, author-declaration, decision and sealing
APIs were reused. Four read routes extend existing routers: scoped work people,
deduplicated contribution overview, approved CRediT statement and exact review PDF.
There is no new contribution or author-management subsystem.

## Task-specific file inventory

This inventory excludes unrelated dirty work already present in the checkout.
Shared files can also contain changes from those earlier tasks.

| Area | Files changed or added |
| --- | --- |
| Shared contracts | `packages/shared-types/src/credit-taxonomy.ts`, `project-contributions.ts`, `research-trust.ts`, `index.ts` |
| Database | `apps/backend/prisma/manuscript.prisma`; additive migration above |
| Work and evidence | `apps/backend/src/modules/projects/contribution-evidence.ts`, `work-contributions.service.ts`, `workspace-access.ts`, `project-contributions.controller.ts`, `project-contributions.routes.ts` |
| Authorship and final gate | `apps/backend/src/modules/workspaces/manuscript-attribution.service.ts`, `manuscript-integrity.service.ts`, `manuscript.routes.ts`; `modules/submissions/submission.service.ts`; `modules/projects/research-integrity.service.ts` |
| Notification whitelist | `apps/backend/src/modules/notifications/notification.service.ts` |
| Contribution UI | `apps/web/src/features/projects/components/credit-role-picker.tsx`, `contribution-overview.tsx`, `work-contributions.tsx`, `project-contributions-workspace.tsx`, `project-contributions-tab.tsx`, `mentor-project-workspace.tsx`; `features/projects/api/contributions.api.ts` |
| Authorship UI | `apps/web/src/features/manuscripts/components/attribution-author-fields.tsx`, `attribution-readiness.ts`, `attribution-review-document.tsx`, `credit-statement.tsx`, `manuscript-attribution-dialog.tsx`; `features/manuscripts/manuscripts.api.ts` |
| Scoped review and copy | `apps/web/src/pages/projects/manuscript-attribution-review.tsx`, `routes/app-routes.tsx`, `features/notifications/utils/notification-destination.ts`, `pages/academics/contribution-archive.tsx`, `i18n/locales/credit-attribution.ts`, `i18n/locales/en.ts`, `i18n/locales/vi.ts` |
| Backend tests and runner | `apps/backend/scripts/test-credit-attribution.mjs`; `modules/workspaces/__tests__/credit-attribution.persistence.test.ts`, `manuscript-integrity.persistence.test.ts`, `manuscripts.persistence.test.ts`, `manuscript-deletion.persistence.test.ts`; `modules/projects/__tests__/research-trust-security.workflow.test.ts` |
| Frontend tests | `apps/web/src/features/manuscripts/__tests__/credit-attribution.test.tsx`; `features/projects/__tests__/project-contributions.test.tsx` |
| Documentation | `docs/credit-attribution-hardening.md`, `credit-attribution-requirements-check.md`, this report |

## Remaining boundaries

CRediT records work types, allocation records a team agreement, and authorship follows
the applicable venue policy and individual consent. No automatic author ranking,
universal ICMJE eligibility rule or percentage-to-authorship rule was introduced.

User-declared affiliations and external acknowledgement permission notes are not
institutional verification or electronic signatures. Historical evidence without a
fingerprint remains historical evidence, not retroactively verified provenance.
Changed linked artifacts conservatively require renewed review. No external Git
proof service, new publisher portal, JATS exporter or automatic insertion into LaTeX
was added. Existing unresolved integrity cases can require institutional review.

No commit, push, production deployment, localhost:8080 update or application-database
migration is included. Both temporary QA services were stopped and the six temporary
preview/editing scripts removed after verification. Test logs and the documented
runner remain available.
