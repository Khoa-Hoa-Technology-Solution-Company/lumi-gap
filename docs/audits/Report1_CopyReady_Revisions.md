# Report 1 Copy Ready Revisions

Use the following text to replace Sections 6, 6.1 and 6.2. Keep the existing project information and team table after verifying them against the approved capstone record.

## 6. Project Scope and Limitations

This section defines the target scope for evaluation and the intended product direction. It does not claim that every feature is complete in the current release candidate. Implementation status is tracked separately in the Software Requirements, Implementation and Testing reports. A feature is considered accepted only when its required behavior, access-control rules and test evidence have been recorded.

The current repository has a substantially implemented foundation for scholarly ingestion, semantic retrieval, paper analysis, RAG reports, research-gap analysis and MCP tools. Web features for projects, communities, reviews, credits and academic profiles are available at different levels of completion and remain subject to integration, security and acceptance testing. The AI paper-review capability also depends on the separate Python service in `apps/ai-reviewer`.

### 6.1 Major Features

| ID | Feature group and target capability | Current implementation status | Evidence to cite in the technical reports |
|---|---|---|---|
| FE-01 | Research Discovery: keyword and semantic search, metadata filters, paper details, references, related works, comparison, bookmarks and paper organization. | Foundation implemented; end-to-end acceptance still requires recorded browser and integration evidence. | `apps/backend/src/modules/search`, `retrieval`, `papers`, `bookmarks`; `apps/web/src/features/search`, `papers`, `compare`, `bookmarks`. |
| FE-02 | Research Intelligence: publication trends, topic analysis, RAG reports, evidence inspection, research-gap analysis, supporting/counter evidence and research directions. | Core pipeline implemented; hardening and acceptance evidence remain in progress. | `apps/backend/src/modules/trends`, `reports`, `gaps`, `scoring`, `llm`; corresponding web features and worker tests. |
| FE-03 | Research Project Collaboration: project lifecycle, literature scope, membership, invitations, permissions, activity, team communication, project AI assistance, research openings and applications. | In progress; individual modules exist, but the complete journey must be verified as one release workflow. | `apps/backend/src/modules/projects`, `workspaces`, `recruitment`; `apps/web/src/features/projects`; integration and permission tests. |
| FE-04 | AI Paper Support: private PDF handling, format checks, AI pre-review, strictness/options, history and credit-aware execution. | Implemented across Node and Python services; release acceptance depends on cross-service, storage, privacy and refund tests. | `apps/ai-reviewer`; `apps/backend/src/modules/papers/ai-reviewer.client.ts`, `submissions`, `credits`; internal `/internal/pre-review`, `/internal/extract-text`, `/internal/health` and `/internal/format-presets` endpoints. |
| FE-05 | Academic Community: communities, posts, comments, citations, tags, voting, accepted answers, reports and moderation. | In progress; backend and web modules exist, with moderation and privacy behavior requiring release evidence. | `apps/backend/src/modules/communities`, `forum`, `admin`; `apps/web/src/features/forum`; persistence and access-control tests. |
| FE-06 | Academic Identity and Research Support: academic profiles, research interests, scholarly links, verification, collaborator discovery, lecturer-support relationships, submissions, formal review and contribution history. | In progress and governed by separate capabilities. Profile self-declaration, institutional verification, mentorship and formal review must not be treated as one permission. | `apps/backend/src/modules/academic-profiles`, `verification`, `recruitment`, `submissions`, `reviews`; `apps/web/src/features/academic-profile`, `reviews`, `submissions`; persistence tests. |
| FE-07 | Account and Engagement: password and Google authentication, account settings, notifications, PayOS credit top-up, credit history, points and ranking features. | Authentication and PayOS routes exist; feature-level acceptance and production-provider verification remain required. | Google OAuth routes in `apps/backend/src/openapi.ts` and auth modules; PayOS routes/service in `apps/backend/src/modules/credits`; web auth and account-management features; webhook/idempotency tests. |
| FE-08 | Administration and Research Data Operations: user and paper administration, OpenAlex ingestion, pipeline monitoring, worker health, corpus validation, AI evaluation, moderation and audit views. | Core administrative and ingestion capabilities exist; operational acceptance and evidence collection remain in progress. | `apps/backend/src/modules/admin`, `api-sync`, `pipeline`, `evaluation`, `audit`; workers and heartbeat instrumentation; `apps/web/src/features/admin`. |

AI-generated summaries, reports, recommendations and review assistance remain advisory. Human researchers, lecturers, supervisors and assigned reviewers retain final academic responsibility.

The primary mobile client for this baseline is Flutter under `apps/flutter_mobile`; it is outside the pnpm workspace. The former Expo client is not the release baseline. Mobile feature parity is therefore a separate decision and must not be implied by web feature completion.

### 6.2 Limitations and Exclusions

LI-01: AI-generated reports, research gaps, recommendations, summaries and review assistance are advisory. LumiGap does not replace the final judgment of researchers, lecturers, supervisors or assigned reviewers.

LI-02: LumiGap cannot guarantee exhaustive coverage of the scientific literature or prove that every suggested research gap is globally novel. Results depend on the coverage, quality and availability of configured scholarly-data providers and the selected analysis scope.

LI-03: The academically evaluated scope should prioritize software and computing research use cases. Cross-domain literature may be searchable when supported by the configured data sources, but equivalent validation quality is not guaranteed for every discipline.

LI-04: LumiGap is not a journal publishing platform, institutional repository, plagiarism-certification service or replacement for formal peer-review processes used by publishers and research institutions.

LI-05: The system does not automatically assign lecturers, reviewers or project supporters. Support and review participation requires explicit consent or an authorized assignment. Private project and manuscript access is granted only by the relevant object-scoped policy.

LI-06: An ORCID, GitHub, Google Scholar or other external profile URL does not by itself verify academic identity, position or expertise. Verification status must come from platform evidence or an approved verification workflow.

LI-07: General-purpose social-network features such as livestreaming, entertainment feeds, unrestricted private social messaging and non-academic marketplace functions are outside the intended product scope.

LI-08: The release baseline has one primary mobile client: Flutter in `apps/flutter_mobile`. Mobile and web are separate clients; web completion does not prove mobile feature parity.

LI-09: Payment functionality is limited to purchasing platform credits through the configured PayOS provider. LumiGap does not provide peer-to-peer payments, research-service payouts or a financial marketplace.

LI-10: Some features depend on external scholarly metadata, AI, translation, object-storage and payment services. Temporary unavailability, quota limits, provider errors or policy changes may limit those functions.

### Source note for the existing-system comparison

The Semantic Scholar, Elicit, ResearchRabbit and Overleaf descriptions are comparative product observations. Add the date on which each official product page was accessed and retain the official URL for each system. These descriptions explain the product opportunity; they are not implementation evidence for LumiGap.

