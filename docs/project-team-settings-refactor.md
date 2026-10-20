# Project Team & Settings refactor

Implementation and verification: 2026-10-15. Branch: `codex/project-team-settings-ux`.

## 1. Existing UI and architecture audited

Reviewed the project workspace, team/invitation controls, project update route and service, Prisma project/plan models, onboarding taxonomy, workspace authorization, public project DTO, academic support discovery/consent services, archive/restore/delete operations, manuscript collaboration gateway, report/gap persistence and Vietnamese localization.

Canonical storage remains `Project` (`title`, `description`, `researchAreas`, `visibility`, `publicSummary`, `researchStage`, lifecycle `status`, mentorship fields and `version`) and the existing `ResearchPlan` approach. Mentor requests and active relationships remain separate from project membership. No institution-specific restriction was introduced.

## 2. Problems identified

- One settings form mixed metadata, privacy, research progression and mentor discovery.
- Mentor discovery controls appeared in both settings and academic support.
- Always-visible research suggestions made a small settings task lengthy.
- Broad form submissions could overwrite unrelated settings; remounting on project version changes could discard drafts.
- Public-summary wording implied approval, although publication is an owner action.
- Delete eligibility omitted several newer research/history tables.
- Report generation needed a fresh write authorization check when persisting after an LLM call.

## 3. New information architecture

The existing Team & Settings entry retains two tabs: People and Project Settings.

Project Settings contains General information, Privacy, a small real link to Academic Support, and Advanced actions collapsed by default. General and Privacy save independently. Academic Support contains the single mentor discovery editor alongside search, pending consent, active relationships and feedback.

## 4. Components and routes changed

Paths below are relative to the repository root.

| Source | Responsibility |
| --- | --- |
| `apps/web/src/features/projects/components/project-team-settings.tsx` | Tabs, team loading/error/pagination, advanced lifecycle actions |
| `apps/web/src/features/projects/components/project-settings-form.tsx` | General/privacy forms, public preview, publication confirmation, versioned drafts |
| `apps/web/src/features/projects/components/research-area-select.tsx` | Reusable searchable selector |
| `apps/web/src/features/projects/components/project-research-fields.tsx` | Shared taxonomy and existing approach values |
| `apps/web/src/features/projects/components/mentor-discovery-settings.tsx` | Owner discovery editor and safe preview |
| `apps/web/src/pages/academics/academic-support.tsx` | Mentor entry point and existing consent/relationship workflow |
| `apps/web/src/features/projects/api/academic-support.api.ts` | Typed owner settings/version |
| `apps/web/src/features/projects/hooks/use-projects.ts` | Seed current project response before invalidation |
| `apps/web/src/i18n/locales/project-settings.ts`, `en.ts`, `vi.ts` | New English/Vietnamese copy |
| `apps/web/src/features/projects/project-workspace.css` | Integrated settings/tab refinements |
| `packages/shared-types/src/project.ts` | Owner discovery settings type with version |

Existing URLs are reused: `/projects/:id?tab=members&team=settings` and `/projects/:id?tab=support`. No new domain endpoint or duplicate settings system was created.

## 5. Research Area selector

Suggestions open on interaction, filter by stored value or translated label, exclude selected items, and scroll within the dropdown. Selected values are removable chips with a count. Arrow keys, Enter and Escape work; the combobox exposes its active option and selection count. Project metadata allows up to three values; the existing backend validates count and case-insensitive duplicates too. Custom values are supported and do not modify the shared taxonomy. The creation form reuses this selector.

## 6. Research Stage placement

The existing `workspace-overview.tsx` stage control remains available in the project header/Overview. It uses the original `researchStage` workflow. General Settings contains only title, short description, areas and approach. Lifecycle status remains editable under Advanced actions, with the original enum and a version check. Approach changes retain the existing plan snapshot/history behavior.

The description keeps its existing storage meaning and is never moved into or copied over detailed Research Plan records. Unchanged legacy long descriptions and research-area lists are omitted from scoped updates, avoiding unrelated validation or data loss.

## 7. Privacy and public summary

- Existing visibility is loaded; new projects retain the backend PRIVATE default.
- PRIVATE and PUBLIC choices have explicit explanations. Legacy `INVITE_ONLY` and `PUBLIC_SUMMARY` values are retained unless the user edits the choice.
- Public description and preview appear only for a public draft.
- A private-to-public change requires confirmation and a nonblank explicit public description. Private objectives are never copied automatically.
- The preview shows the actual public content: title, public description, areas, lifecycle status and created/updated dates. Research stage is not added to the public DTO.
- The backend's explicit safe DTO continues to omit internal records and identities, with empty compatibility collections/counts. Internal routes still authorize their own access.
- Switching back to PRIVATE immediately revokes anonymous/nonmember detail access, while retaining the saved summary. Project detail responses use `Cache-Control: private, no-store` and vary on Authorization. Current featured-work visibility is checked by the existing backend; its persistence regression passes. No new public search cache was added.

Sources: `apps/backend/src/modules/projects/project.service.ts` and `project.controller.ts`.

## 8. Mentor settings relocation

Discovery is edited only within Academic Support. Discovery OFF offers an enable action and existing mentor search. Discovery ON shows the safe preview and edit action. Pending invitations/offers retain direction, profiles and existing accept/decline/cancel actions. Active relationships, academic context, guidance and review actions remain intact.

A private project may seek a mentor. Only eligible verified lecturers receive the restricted discovery DTO: project id/title, mentor-facing summary, first research area, permitted lifecycle status, requested expertise and discovery state. Owner settings additionally contain the concurrency version; the public opportunity DTO does not. Opening discovery never creates a relationship, changes visibility or terminates an active mentor. Mutual consent remains required.

## 9. Archive and deletion

Advanced actions use the existing confirmed archive/restore/delete/leave operations. Archive/delete require typing the current project title. Archive retains history, closes discovery and cancels pending invitations under the established policy; restore permits collaboration without reopening old invitations or discovery.

Delete remains restricted to empty projects. Its parameterized PostgreSQL existence query checks 37 research/collaboration sources under the project lock, including manuscripts/snapshots, evidence, screening, files, workspace revisions, academic reviews, contributions, allocation and mentorship history. Owner membership, initial plan revision and basic project lifecycle activity retain their previous exceptions. This introduces no new cascade or destructive migration. A single query avoids dozens of database round trips inside the transaction.

Existing write guards deny archived workspace mutations, including messages from a manuscript WebSocket session opened before archive. Report generation now checks write access before starting, before storing evidence and under the same project lock before storing generated output. Gap generation already guards final persistence through `withWorkspace`.

## 10. Backend changes

| Source | Change |
| --- | --- |
| `apps/backend/src/modules/projects/project.service.ts` | Explicit publication summary validation; complete empty-project delete guard |
| `apps/backend/src/modules/projects/project.controller.ts` | Noncacheable project detail response |
| `apps/backend/src/modules/projects/project-mentorship.service.ts` | Owner settings version, optional expected version check, version increment and safe-summary validation |
| `apps/backend/src/modules/projects/project.routes.ts` | Validate optional positive discovery expectedVersion |
| `apps/backend/src/modules/reports/rag.service.ts` | Fresh project write authorization around persistence |

Forms send only changed fields plus `expectedVersion`. Clean drafts follow fresh responses; dirty general/privacy/discovery drafts retain their original version and inputs. Conflicts show feedback; users can explicitly load a newer fetched version. Existing unsaved-workspace protection covers links, tab navigation and unload. Saves expose loading, disabled unchanged states, errors and success feedback.

## 11. Authorization checks

Real JWT-authenticated HTTP tests verify owner updates and denial for members, outsiders, verified lecturers and admins without a project grant. Members retain team access. A verified lecturer sees the safe discovery preview while private project detail stays inaccessible. After mutual consent, the active mentor still cannot update settings. Public access does not grant team, plan, papers, evidence, tasks, discussions, contributions or academic-support access.

The existing consent regression suites also verify team-to-lecturer invitations, scoped active mentor access, termination/revocation, concurrent acceptance and archived feedback restrictions. There is no assumption that ADMIN grants arbitrary project content access.

## 12. Database migration impact

No Prisma schema or migration changes. No enums, models, routes or domain state machines were duplicated. Existing visibility, summaries, custom areas, stage, approach, invitations and relationships continue to use canonical storage. Verification used a disposable PostgreSQL database with all 72 existing migrations applied; application databases were not reset.

## 13. Responsiveness and localization

Constrained form width, wrapping chips/previews and minimum-width handling keep the affected interface usable at 1440, 768 and 390 pixels. Chromium checked no horizontal document overflow with a long project title. Screenshots were visually reviewed:

- [Desktop settings](project-settings-screenshots/settings-1440.png)
- [Tablet settings](project-settings-screenshots/settings-768.png)
- [Mobile settings](project-settings-screenshots/settings-390.png)
- [Mobile Academic Support](project-settings-screenshots/mentor-390.png)

New controls use existing Vietnamese localization, native labeled fields/radios/selects, accessible tab semantics, keyboard combobox behavior, live status/error messages and the existing Radix dialog focus management. User-entered text and taxonomy/custom values retain their original stored spelling.

## 14. Executed verification

| Check | Result |
| --- | --- |
| New real HTTP/PostgreSQL/Chromium settings suite | 6 passed |
| Existing backend academic profile/onboarding/relationship/mentorship integration suites | 127 passed |
| Existing creation/team and collaborative research persistence suites | 29 passed |
| Settings forms, Team & Settings and project creation frontend suites | 16 passed |
| PostgreSQL runtime audit, part of backend build | 4 passed |
| Shared-types build | Passed |
| Backend `tsc --noEmit` and web `tsc -b` | Passed |
| Targeted ESLint on changed TS/TSX, `--max-warnings=0` | Passed |
| Backend production build | Passed |
| Web production build | Passed |
| Git whitespace/conflict check | Passed |

New test sources:

- `apps/backend/src/modules/projects/__tests__/project-settings.e2e.test.ts`
- `apps/web/src/features/projects/__tests__/project-settings-forms.test.tsx`

The backend browser suite exercises actual form saves/reload, public confirmation, private revocation, discovery saves and viewport overflow. API/database assertions cover scoped updates, stale versions, owner permissions, membership invitations, safe public/discovery DTOs, lecturer offers and consent, active mentorship preservation, nonempty delete denial, empty delete, archive/restore, active WebSocket rejection and an archived queued report refusing generation.

Reproduction uses disposable PostgreSQL at `127.0.0.1:15439/lumigap_project_slice_test`, Redis at `127.0.0.1:16389`, the test API at `127.0.0.1:14039`, and Vite at `127.0.0.1:13000` with `API_PORT=14039` and `VITE_API_BASE=''`. Supply the isolated DATABASE_URL locally; use `NODE_ENV=test`, `EMAIL_DELIVERY_MODE=disabled`, `STORAGE_PROVIDER=local`, `CORS_ORIGIN=http://127.0.0.1:13000` and `PROJECT_SETTINGS_INTEGRATION=1`. The suite skips unless its disposable database/Redis guard matches. Existing persistence tests use their own integration flags. Run tests with one worker. No real email delivery or live LLM call is required.

## 15. Unresolved issues and verification limits

No blocking issue remains in the affected workflows. No pending migration or placeholder control was introduced. Verification is scoped to the affected project and mentorship workflows; it does not prove every legacy worker or unrelated endpoint. The report-worker final persistence guard was inspected and compiled; the integration test proves an already archived queued report cannot start, rather than simulating archive during a live provider call. Manual screen-reader, full browser/OS accessibility and every possible long institution/account value were not exhaustively tested. The full repository lint/test suite was not run; targeted lint and the suites above were executed.

## Definition of Done classification

`IMPLEMENTED` indicates shipped behavior with the source/test evidence above. Verification limits are recorded separately and do not imply exhaustive platform coverage.

| # | Requirement | Classification | Evidence |
| --- | --- | --- | --- |
| 1 | Clear Team and Settings experiences | IMPLEMENTED | Existing two tabs; team unit/persistence regression |
| 2 | Compact focused settings | IMPLEMENTED | Separate sections; responsive screenshots |
| 3 | Essential General metadata only | IMPLEMENTED | `ProjectGeneralSettings` |
| 4 | Searchable areas, maximum three | IMPLEMENTED | Selector keyboard/max tests and HTTP validation |
| 5 | Simple editable approach | IMPLEMENTED | Shared fields; saved plan assertion |
| 6 | Stage in research workflow | IMPLEMENTED | Existing header/Overview stage control retained |
| 7 | Separate privacy | IMPLEMENTED | `ProjectPrivacySettings` |
| 8 | Contextual public summary | IMPLEMENTED | Conditional unit and browser assertions |
| 9 | Preview matches backend exposure | IMPLEMENTED | Explicit preview, safe DTO assertions |
| 10 | Authorized private/public transitions | IMPLEMENTED | Real owner/nonowner HTTP tests and revocation |
| 11 | Discovery in Academic Support | IMPLEMENTED | Single editor; real browser save |
| 12 | Relationships and requests preserved | IMPLEMENTED | Existing consent suites and discovery OFF assertion |
| 13 | Protected collapsed advanced actions | IMPLEMENTED | Native details, confirmation, archive/WS/delete checks |
| 14 | Existing data preserved | IMPLEMENTED | No schema changes; legacy form and persistence regressions |
| 15 | No duplicate model/API | IMPLEMENTED | Existing storage/routes reused |
| 16 | Owner/Member/Mentor permissions | IMPLEMENTED | Direct HTTP plus existing consent/access suites |
| 17 | Responsive, accessible, localized UI | IMPLEMENTED | Three widths, keyboard tests, VI browser flow; manual AT limit above |
| 18 | Real API/database persistence | IMPLEMENTED | Actual HTTP, PostgreSQL, reload and Chromium assertions |
| 19 | Relevant checks pass | IMPLEMENTED | Executed results above |
| 20 | No fake controls/incomplete migrations | IMPLEMENTED | Working existing operations; no migration required |
