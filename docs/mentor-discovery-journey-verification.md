# Mentor journey verification

Verified on 11 November 2026. See [implementation and audit](mentor-discovery-journey.md).

## Results

| Check | Actual result |
| --- | --- |
| PostgreSQL onboarding, classification, matching and invitation suites | 99 passed across six files, including eight pure evidence regressions. Final log: `apps/backend/scratch/mentor-journey-final-regression.log`. |
| Existing access and recruitment plan suites | 51 passed. `mentor-journey-access-final.log`. Earlier runs each encountered one different 20-second timeout; rerun with 60-second test timeout passed without changing assertions. |
| Classifier mocks, taxonomy sync, onboarding validation | 40 passed (6 + 12 + 22), rerun after final provider changes. |
| PostgreSQL-only runtime audit | 4 passed. |
| Frontend journey, project creation, shared profile, onboarding and Academic Support | 98 passed across five files (39 + 59 on final rerun). |
| Shared types / backend production TypeScript / web TypeScript | Passed. |
| Web production build and bundle budget | Passed, `apps/web/scratch/mentor-journey-verified-build.log`. |
| Scoped ESLint | Passed on new services, selectors, discovery/onboarding integrations and new backend journey tests. |

Commands use direct installed Node CLIs; no Turborepo configuration was changed.
Backend production compilation and auth-mail asset copy were checked separately.

## Browser verification

Used the production web bundle on 127.0.0.1:8098 and API on 8097, exclusively with
synthetic accounts in `lumigap_mentor_journey_test`, local Redis database 14 and email
delivery disabled. No application database or localhost:8080 deployment was changed.

Observed through the UI:

1. Student signs in and opens Find Mentors.
2. Verified lecturer has actual topic, subfield, field, PyTorch, supervision preference
   and support explanations. The unverified lecturer is excluded.
3. Owner edits inherited project classification and explicitly saves the approved
   summary/support needs. Catalogue selections resolve to labels and stay compact.
4. Owner adds the synthetic lecturer to the existing Primary Mentor recruitment plan.
5. Invitation preview contains the approved classification, summary, team size,
   personalized message, six-day expiry and proposed access disclosure.
6. Send succeeds; invitation counter updates and the pending candidate is no longer
   recommended as immediately available.
7. Lecturer signs in, sees the incoming invitation and reviews the same approved brief.
8. Lecturer accepts; Incoming becomes 0 and Active becomes 1.
9. Open Project reaches the scoped Academic Support workspace with the approved
   overview, team and permitted collaboration entries. No private library/source tab
   is present. Backend regression tests separately verify denied and revoked access.
10. Responsive check at requested 390×844 browser viewport (375px content area):
    document scroll width equals client width. Navigation switches to a select.

Browser QA found a missing stylesheet on direct mentor workspace entry. The shared
workspace now explicitly imports its workspace/coordination styles and token scope.
This removes reliance on first visiting the normal project page.

Screenshots are local review artifacts in the task visualization directory:
`mentor-journey-invitation-desktop.png`, `mentor-journey-discovery-desktop.png`,
`mentor-journey-workspace-desktop.png`, `mentor-journey-workspace-mobile.png`.
The temporary QA servers were stopped afterward.

Onboarding and decline/expire/cancel/concurrency paths were verified by real PostgreSQL
tests; they were not all repeated manually in the browser. No claim of full browser
end-to-end coverage is made for those paths.

## Task file inventory

Paths below are relative to the repository. Existing files also contain changes from
earlier tasks; this inventory identifies this journey's integrations, not every dirty
file in the checkout.

- Shared: `packages/shared-types/src/{research-classification.ts,index.ts,academic-profile.ts,user.ts,project.ts}`.
- Prisma: `apps/backend/prisma/{identity,collaboration,scholarly}.prisma` and migrations
  `20261111090000_shared_research_classification`,
  `20261111091000_mentorship_support_preferences`,
  `20261111092000_keyword_classification_provenance`.
- Backend taxonomy: `research-classification.schema.ts`, `research-classification.service.ts`,
  `research-catalog.service.ts`, `research-catalog.routes.ts`, under `src/modules/taxonomy/`.
- Backend auth/profile: `auth.service.ts`, `dto/auth.schema.ts`,
  `academic-profile.service.ts`, `dto/academic-profile.schema.ts`.
- Backend projects: `project.controller.ts`, `project.service.ts`, `project.routes.ts`,
  `project-mentorship.controller.ts`, `project-mentorship.service.ts`,
  `academic-relationship-access.ts`, `mentorship-discovery.service.ts`,
  `lecturer-match-evidence.ts`, `mentor-relevance.ts`, `mentorship-topic-suggestions.service.ts`.
- Backend wiring: `src/routes/index.ts`, `src/workers/ai-jobs.worker.ts`.
- Web profile: `research-classification-fields.tsx`, `academic-profile-inline-editor.tsx`,
  `academic-profile-view.tsx`, `research-focus-fields.tsx`, `utils/research-classification.ts`.
- Web projects: `create-project-form.tsx`, `mentor-discovery-settings.tsx`,
  `mentor-preview.tsx`, `mentor-relevance-summary.tsx`, `mentor-topic-suggestions.tsx`,
  `mentor-project-workspace.tsx`, `api/academic-support.api.ts`.
- Web pages: `academic-profile-onboarding.tsx`, `academics/academic-support.tsx`.
- Locales: `i18n/locales/{mentor-journey,en,vi}.ts`.
- New tests: `research-classification.persistence.test.ts`, `mentor-journey.persistence.test.ts`,
  `mentorship-topic-suggestions.test.ts`, frontend `mentor-journey.test.tsx`.
- Existing regression fixtures/assertions: lecturer expertise, onboarding schema/persistence,
  shared profile, frontend onboarding and Academic Support suites.
- Runner: `apps/backend/scripts/test-mentor-journey.mjs`.
- Documentation: this report, `mentor-discovery-journey.md`, `shared-academic-profile.md`,
  `mentor-invitation-access-control.md`.

## Remaining limits

- Live OpenAlex credentials, costs and provider output were not exercised. Automated
  provider calls are mocked; browser QA did not transmit text to OpenAlex.
- Async suggestions require the existing AI worker. Manual catalogue selection works
  without that worker or external classification.
- Ranking measures declared relevance, not academic qualification or teaching quality.
  No semantic suitability score or automatic authorship/verification is inferred.
- Unmapped historical strings remain available as explicit custom terms.
- Availability off blocks new invitations; existing pending consent and relationships
  retain the repository's original lifecycle policy.
- Three additive migrations were applied only to the isolated test DB. Application
  rollout still needs reviewed migrations and coordinated backend/web/worker builds.
- No production deployment, application DB mutation, commit or push was performed.
