# Report 2 Code Audit

## Scope and source of truth

Audited the extracted copy of the supplied second Google Doc (`Report2-source.docx`) against the current `lumi-gap` working tree. The Google Doc itself was not edited. Existing generated reports in `outputs/` were treated as untrusted historical artifacts.

## Executive result

The plan is broadly aligned with the repository architecture, but it mixes three different states: implemented code, active development, and proposed capstone scope. The document must label those states separately before the effort baseline is defensible. The 284 MD total is an estimate, not evidence that every listed deliverable is complete.

## Required corrections

| Priority | Location in Report 2 | Finding | Required correction / evidence |
|---|---|---|---|
| High | 1.1, WBS FE-01–FE-08 | The WBS presents the complete feature map as one release package, while the repository roadmap says Phase E and several domains remain in active development. | Add a `Status` column (`implemented`, `in progress`, `planned/out of baseline`) and mark each WBS row from current route/module/test evidence. Cite `CLAUDE.md` roadmap and the actual module paths. |
| High | 1.1, 1.2 | “Four end-to-end journeys” and acceptance targets are stated as goals, but the report does not name the executable test suites or passing run IDs. | Replace generic evidence with exact test commands/results. A route/module existing is not acceptance evidence; retain this warning but add linked test files and date. |
| High | 1.1 / D00 | The plan says mobile and legacy code are outside the web baseline, but the repository contains both Expo and Flutter mobile clients and explicitly says the canonical mobile app is unresolved. | State that mobile is excluded from this release baseline, identify both clients as repository assets, and record the unresolved canonical-client decision as a risk/assumption. |
| High | FE-04 | AI reviewer is listed as a feature but the implementation is a separate Python service, not only the Node backend. | Add `apps/ai-reviewer` and its HTTP boundary to scope, ownership, integration tests, and deployment assumptions. |
| Medium | FE-07 | PayOS orders/webhooks are listed as committed work. | Verify current implementation and tests before retaining as committed scope; otherwise label planned. Do not infer completion from UI strings mentioning credits. |
| Medium | FE-06 | Academic identity, verification, submission, review, and contribution rows are detailed, but no acceptance evidence is attached in the plan. | Reference backend services/tests such as `modules/academic-profiles`, `verification`, `submissions`, `reviews`, and the persistence test suites. Separate implemented controls from remaining product-policy decisions. |
| Medium | 1.2 quality table | “80% branch target” is a target, not a measured result; “100% required cases pass” is likewise not a current fact. | Rename `Target` to `Release target`; add a separate `Current evidence` column with measured values or `Not yet measured`. |
| Medium | 1.3 risks | Risks are useful but need owners, trigger dates, and residual risk after mitigation. | Add owner, trigger/metric, response deadline, residual rating, and status. Include provider quota, worker failure/orphan jobs, database migration safety, and personal AI key privacy. |
| Medium | 2.1–2.2 | Process/quality sections do not identify the actual CI commands and database constraints used by this repository. | Add `pnpm typecheck`, `pnpm test`, `pnpm lint`, Playwright, PostgreSQL runtime audit, and migration-deploy commands only where they are actually configured. Never claim `prisma migrate dev`; repository rules prohibit it. |
| Low | 4 Responsibility assignments | Names are assigned to WBS rows but the plan does not define backup ownership or review independence. | Add primary/backup/reviewer columns and require a reviewer different from the implementer for Q00/D09 evidence. |
| Low | 6 Configuration Management | The section should identify the actual monorepo controls. | Mention `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`, hand-written Prisma migrations, branch/PR review, and the no-secrets rule from `CLAUDE.md`. |

## Items that are supported by source code

- Separate BullMQ workers and heartbeat instrumentation exist, including `apps/backend/src/workers/sync.worker.ts`, `report.worker.ts`, `gaps.worker.ts`, `embedding.worker.ts`, and `infrastructure/worker-heartbeat.ts`.
- Backend domains corresponding to discovery, trends, reports, gaps, projects, communities, reviews, submissions, verification, credits, and administration exist under `apps/backend/src/modules/`.
- Web feature modules exist under `apps/web/src/features/` for the same major areas.
- The repository documents PostgreSQL/Prisma/pgvector, Redis/BullMQ, Gemini, and a separate Python AI-reviewer service. These are valid technology assumptions, but the plan should distinguish infrastructure availability from release acceptance.

## Recommended revision order

1. Add status and evidence columns to the WBS.
2. Reconcile totals after removing or marking out-of-baseline rows.
3. Attach executable test evidence to each acceptance target.
4. Rewrite risks and configuration management against the actual repository rules.
5. Re-review the final plan against the source tree and commit this audit as the review record.

