# Main integration verification — 12 November 2026

Branch: `research-integrity-mentor-screening-20261112`. Integrates main
`c2c5117cc77238a694fdab81243691c6fdf14873` into feature commit `f98705d8`.

## Resolution choices

- Preserve the current two-reviewer workflow: direct discussion, latest personal
  ballot revisions, frozen consensus deadline, and no new adjudicator invitation.
  Legacy discussion-extension, manual closure, and more-information commands cannot
  bypass this workflow. Historical `CLOSED_UNRESOLVED` records remain readable and
  owners can open a separate attempt while retaining the old record.
- Keep one ORCID ownership implementation with expiring single-use state bound to
  account/session/configuration, session-revocation checks, identity revision
  checks, private defaults, and database uniqueness. Main's status/connect/delete
  API aliases delegate to it. No academic role or affiliation is verified by ORCID.
  Remove duplicate callback routes and duplicate environment declarations.
- Keep main's literature matrix, feasibility, source-analysis and submission
  readiness additions, alongside the branch's mentor and attribution permissions.
  Preserve incoming mobile/SSE changes without rewriting their implementation.
- Keep previous round policy defaults for snapshots without a workflow kind;
  infer the compatibility workflow kind from an explicit screening mode only.

## Migration compatibility

The incoming `20261110090000_screening_team_workflow` CHECK constraint omitted
`CONSENSUS_REQUIRED` and `CONSENSUS_IN_PROGRESS`, introduced on this branch before
that migration. Its allowlist is expanded to the union so applying the combined
history does not fail on existing consensus records. The additive migration
`20261112090000_screening_workflow_status_compatibility` installs the same union
for databases that have already applied main's original migration. No ballots,
discussion history or decisions are rewritten by this reconciliation.

Forward migrations were applied only to dedicated local test databases. The
application database, running Docker images and production environment were not
updated during this merge. Existing unrelated pending migration/data cleanup
must be reviewed separately before updating a real application database.

## Executed verification

| Check | Result |
| --- | --- |
| Shared-types TypeScript | Passed |
| Backend TypeScript including tests; production TypeScript compilation | Passed |
| Web TypeScript project build (`tsc -b`) | Passed |
| Web production build and bundle budget | Passed |
| ESLint on affected Screening, ORCID and UI modules | Passed |
| Web: identity, callback, discussion, workspace, queue, status, notification routing, literature CSV (9 files) | 190 passed |
| Backend unit: ORCID adapter, team workflow schemas/calculator, screening calculator | 69 passed |
| Additional ORCID route, literature rule and PostgreSQL runtime checks | 21 passed |
| Literature matrix/limitations/feasibility persistence and authenticated ORCID route recheck | 10 passed |
| Screening consensus persistence, calculator and event checks | 58 passed |
| Queue persistence, leases and consensus | 40 passed (includes overlapping consensus coverage) |
| ORCID persistence/HTTP compatibility, onboarding, expertise, mentor consent and matching | 102 passed |
| CRediT attribution and extended manuscript integrity/security | 84 passed |

Provider responses are mocked; no real ORCID credentials are needed. No Flutter
SDK build or full browser end-to-end suite was run for this merge. Test totals
from overlapping runs must not be added as a unique-test count.
