# Report 2 Copy Ready Revisions

Use the following text to replace Sections 1.1, 1.2, 1.3, 2.1, 2.2 and 6. Keep the existing WBS effort rows after adding the Status and Evidence columns described below.

## 1.1 Scope and Estimation

LumiGap is an AI-assisted academic research platform whose target scope covers literature discovery, publication trends, evidence-grounded reports and research gaps, project collaboration, AI paper support, academic communities, human review, account credits and administration. The WBS estimates the complete capstone work package; it does not state that every listed feature is already complete.

One man-day (MD) equals eight person-hours. Parallel work by two people for one day counts as two MD. Group subtotals summarize their child rows and are not added a second time. The current baseline totals 284 MD, comprising 182 MD of software engineering, 30 MD of independent verification, 50 MD of requirements and documentation, 12 MD of project coordination and 10 MD of training. This is planned effort for the work package, not actual time spent or measured remaining effort.

Add these columns to every FE, EX, Q, D, M and T row in the WBS:

| New column | Allowed value / meaning |
|---|---|
| Status | Implemented, In progress, Planned, or Out of release baseline |
| Evidence | Repository path, test file, test command or approved document reference |
| Primary owner | Person responsible for the work item |
| Independent reviewer | A different person who checks the evidence before acceptance |

The current release baseline is the web application and its PostgreSQL, Redis/BullMQ, AI and Python-reviewer support services. The primary mobile client is Flutter in `apps/flutter_mobile`; it is maintained outside the pnpm workspace and is excluded from the web release baseline unless a separate milestone explicitly accepts mobile work. The former Expo client is not the release baseline.

The AI paper-review feature includes the separate Python service in `apps/ai-reviewer`. The backend calls this service through the internal endpoints `/internal/pre-review`, `/internal/extract-text`, `/internal/health` and `/internal/format-presets`, protected by the internal service key. Its deployment, timeout, private-file handling and refund behavior must be included in the FE-04 integration and acceptance evidence.

Use the following status summary before finalizing the detailed WBS:

| Feature group | Baseline status | Required acceptance evidence |
|---|---|---|
| FE-01 Research discovery | Foundation implemented | Search, retrieval, paper detail, comparison and access-control journeys |
| FE-02 Research intelligence | Core implemented; hardening in progress | Trends, RAG reports, evidence inspection and gap tests |
| FE-03 Project collaboration | In progress | Lifecycle, membership, invitations, permissions, communication and AI journey |
| FE-04 AI paper support | Cross-service implementation exists | Node/Python integration, private files, format checks, review, credits and failure/refund tests |
| FE-05 Academic community | In progress | Community/forum, citations, voting, reports, moderation and privacy tests |
| FE-06 Academic identity and review | In progress | Profile, verification, mentorship, submission and formal-review permission tests |
| FE-07 Account and engagement | Authentication and PayOS routes exist; acceptance remains required | Google OAuth, password flow, PayOS signature/idempotency, credit ledger and account tests |
| FE-08 Administration and data operations | Core administration and ingestion exist; operational evidence remains required | OpenAlex, worker heartbeat, pipeline, corpus validation, evaluation and audit evidence |

Draft workspace APIs and generic AI job control are supporting capabilities. A full writing editor, automatic paraphrase-diff acceptance, document export and live collaborative editing are outside this baseline unless the supervisor approves a separate scope change. Legacy code is reference material and is not release evidence.

## 1.2 Project Objectives and Quality Targets

The project aims to deliver and verify four end-to-end journeys:

1. Literature search to an evidence-grounded research gap.
2. Research gap to a collaborative project.
3. Manuscript submission to human review.
4. PDF format checking or AI pre-review with controlled credit use.

Academic decisions remain with human users. A route or module in the repository is not acceptance evidence by itself. Each journey requires a dated test result, test data description, expected result, actual result and reviewer sign-off.

The following are release targets, not current measurements. Replace `Not yet measured` with the actual result when the relevant test run is complete.

| Quality stage | Coverage | Release target | Current evidence |
|---|---|---|---|
| Peer review | Every changed pull request and API/data contract | 100% required reviews complete; no Critical or High defect at release | Not yet measured per release candidate |
| Unit tests | Critical business, privacy and permission rules | 80% branch coverage target for selected critical modules; no Critical or High defect at release | Record the Vitest/Python command and measured result |
| Integration tests | PostgreSQL, Redis/BullMQ, PayOS and Node/Python contracts | 100% of required cases pass, including retries, denial paths, signature failures and idempotency | Record the integration suite and dated result |
| System tests | Four core journeys, private-file access and denied-access checks | 100% mandatory cases pass; no Critical or High defect at release | Record Playwright/browser evidence and test data |
| Acceptance | Baselined SRS acceptance criteria | 100% mandatory criteria accepted; zero release blockers | Supervisor acceptance record |

Milestone reviews are planned for Weeks 3, 6, 9, 11 and 12 relative to the confirmed kick-off. The supervisor records acceptance after reviewing the relevant deliverables and evidence. The five-member capacity assumption is 300 MD (2,400 hours) over 12 weeks. The 16 MD contingency is reserved capacity and must not be reported as completed work. Actual weekly availability must be recorded; scope additions require re-estimation and owner approval.

## 1.3 Project Risks

The team reviews risks weekly and after a failed milestone, security incident or material scope change. Each risk record must include an owner, trigger or metric, response deadline, residual rating and status.

| Risk | Trigger / metric | Response | Owner | Residual rating |
|---|---|---|---|---|
| Scope expands into a complete writing editor or mobile release | New feature requested outside the baselined WBS | Keep the web baseline; estimate and approve extensions before implementation | Hoa | Medium |
| AI output contains unsupported citations or gaps | Evidence ID mismatch, unsupported statement or failed gold-case evaluation | Require evidence inspection, run evaluation cases and block unsupported output | Khoa | Medium |
| Private manuscript or blind-review identity leaks | Access-denial, projection or file-download test fails | Block release, rotate exposed test data and retest object-scoped access | Hoa | Low after passing tests |
| LLM quota, timeout or cost exceeds limits | Quota error rate, latency or credit consumption exceeds threshold | Cache, bounded retry, usage monitoring and explicit degraded behavior | Khoa | Medium |
| PayOS replay or invalid webhook changes credit balance | Duplicate, invalid-signature or amount-mismatch callback changes ledger | Verify HMAC signature, amount, order state and idempotency key; retest duplicate callbacks | Thanh | Low after passing tests |
| Self-declared academic links are mistaken for verified positions | Profile link or email is treated as verification without approved evidence | Keep self-declaration, email ownership and administrator approval as separate states | Hoa | Low |
| pgvector retrieval is slow or unavailable | Query latency, database error or failed readiness check | Review indexes/query plans and verify keyword-retrieval fallback | Thanh | Medium |
| Worker failure leaves jobs or analyses stuck | Missed heartbeat, orphaned generating state or queue failure | Monitor heartbeats, run startup recovery and record retry/refund behavior | Khoa | Medium |
| Migration or recovery loses data | Restore rehearsal fails or migration changes constraints/indexes | Use checked-in hand-written migrations, backup PostgreSQL/file volumes and rehearse restore | Thanh | Medium |
| Actual availability is below 300 MD | Weekly capacity below forecast | Reforecast loads and defer unapproved scope | Hoa | Medium |
| Too few human reviewers or pilot submissions | Fewer consented pilot cases than the acceptance plan requires | Recruit early and prepare consented test submissions | Hoang | Medium |
| Documents drift from code or supervisor changes arrive late | Review finds a source path, behavior or requirement mismatch | Hoang maintains traceability; technical owners verify content weekly | Hoang | Medium |

## 2.1 Project Process

The five-member team works in six two-week iterations. Hoa coordinates planning, scope, risk and capacity. Hoang maintains requirements, the document backlog and milestone evidence. Technical owners agree on contracts, implement changes, perform developer checks and provide evidence for independent verification. The backlog and effort forecast are reviewed weekly.

A software task is complete only when its implementation, independent review, relevant test result and demonstration evidence are recorded. A document task is complete when its technical owner verifies accuracy, Hoa reviews the consolidated version and Hoang publishes the approved revision. Scope, effort and milestone changes are logged and reviewed with the supervisor.

The standard repository checks are `pnpm typecheck`, `pnpm test`, `pnpm lint`, the configured Playwright/browser checks, `pnpm --filter backend runtime:audit:postgres` and `pnpm --filter backend db:migrate:deploy` where applicable. Prisma migrations are written and reviewed by hand; `prisma migrate dev` is not used for this repository.

## 2.2 Quality Management

Quality management covers prevention, detection and correction throughout each iteration:

- Defect prevention: agree on API contracts, permission rules, migration steps, private-file rules and AI evidence requirements before implementation.
- Review: a second team member checks behavior, denied paths, privacy, data changes and test evidence for each pull request.
- Unit testing: cover critical authorization, matching, contribution, revision, credit and AI-output rules.
- Integration testing: verify PostgreSQL, Redis/BullMQ, PayOS, external services and TypeScript/Python contracts, including retries and failures.
- System testing: verify the four core journeys plus denied access, payment replay, private-file handling, worker recovery and provider failure cases against a reproducible release candidate.

Defects are logged with severity, reproduction steps, owner, affected version and verifying test. A different team member confirms the fix before closure. A target or a source module does not count as a passing result until a dated test record exists.

## 4. Responsibility Assignments

Keep the current responsibility matrix and add two rules. Every work item has one primary owner and one backup/support owner. The independent reviewer must be different from the primary implementer. Q00, D09 and release acceptance evidence require review by a person who did not implement the behavior being accepted.

## 6. Configuration Management

The repository is a pnpm workspace managed with Turborepo. `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `.npmrc` are version-controlled baselines. Application changes are reviewed through branches and pull requests. PostgreSQL schema changes use checked-in hand-written migrations and are applied with the deployment command; development migration generation that could drop existing indexes or foreign keys is prohibited.

Environment files, API keys, JWT keys, database credentials and provider secrets are local configuration and must never be committed. The configured AI provider, storage mode, PayOS credentials, internal AI-reviewer key and service URLs must be recorded in the environment-variable inventory without exposing secret values.

Document versions are identified by report name, revision date and approval status. Each report records its source revision, technical contributors, reviewer and evidence links. Hoang maintains the document structure and publication record; technical owners verify the factual accuracy of their sections; Hoa reviews the consolidated package.

