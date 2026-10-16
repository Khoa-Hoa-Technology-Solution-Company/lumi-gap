# Report 1 Code Audit

## Scope and source of truth

This review uses the extracted copy of the supplied first Google Doc (`Report1-source.docx`) and the current `lumi-gap` source tree. The Google Doc was not edited. Historical generated documents under `outputs/` were not treated as implementation evidence.

## Executive result

Report 1 is a coherent product-introduction and target-scope document. Its main accuracy problem is status ambiguity: Section 6 says the eight feature groups are “committed” while also saying implementation status is tracked elsewhere. Several statements are therefore valid product intentions but are not yet verified facts about the current codebase.

## Required corrections

| Priority | Report section | Finding | Required correction / evidence |
|---|---|---|---|
| High | 6. Project Scope & Limitations | “Complete set of features committed to the capstone scope” reads as a release commitment even though the repository roadmap says Phase E and multiple domains are still in progress. | Change to “target scope for evaluation” and add a short implementation-status matrix or explicit cross-reference to Report 2/SRS. |
| High | FE-01–FE-08 | Feature bullets combine implemented, partial, and planned capabilities (for example translation, project AI chat, collaborator applications, ranking/points, payment, and AI evaluation). | Add `Current status` and `source evidence` for each feature group. Use exact backend/web module paths and test files; mark unsupported claims as planned. |
| High | FE-07 | “Google authentication” and “credit purchase” are product requirements, not proof of a working production flow. | Confirm the actual routes, provider configuration, webhook verification, and tests. If any part is incomplete, say “planned/in progress” rather than “shall provide.” |
| High | FE-04 | AI paper support spans Node/Python integration, PDF storage, format checking, AI review, history, and credits. The report presents this as one feature without naming the service boundary. | Name `apps/ai-reviewer` and the internal HTTP endpoints, storage mode assumptions, and failure/refund behavior. |
| Medium | FE-06 | “Academic identity,” lecturer support, collaborator discovery, and formal review are grouped together, although the repository uses separate profile, verification, mentorship, submission, and review authorities. | Split into sub-capabilities and state that verification, mentorship, and formal review are distinct permissions/records; do not imply a single academic role grants all access. |
| Medium | LI-05/LI-06 | These limitations are well aligned with current governance, but should cite the actual enforcement points. | Add references to verification/profile services, mentorship services, review assignment checks, and viewer-aware access tests. |
| Medium | LI-08 | The document correctly says one primary mobile client is intended, but the repository currently contains both Expo and Flutter clients and its own guidance says the canonical client is unresolved. | Promote this from a limitation to an explicit project decision/risk: identify the release client and mark the other as out of baseline. |
| Medium | Existing systems | Comparative claims are reasonable product positioning, but official URLs and feature descriptions are not linked to an access date or evidence snapshot. | Add access date and a short source note; avoid presenting changing third-party feature sets as timeless facts. |
| Low | Team/project metadata | Team members, emails, project code and September 2026 date are project metadata rather than code-derived facts. | Verify against the approved capstone record before final submission; keep personal details out of generated audit artifacts unless required. |

## Claims supported by the current repository

- The backend and web trees contain dedicated modules/features for search, literature, trends, reports, gaps, projects, communities, reviews, submissions, verification, credits, and administration.
- AI work is routed through backend LLM/RAG modules and asynchronous workers; it is not evidence that every FE row is complete.
- Academic profile, mentorship, and formal review are governed by separate records and checks; this supports the document’s human-judgment and consent limitations.
- The repository contains a separate Python AI-reviewer service, so FE-04 must document a cross-service dependency.

## Recommended revision order

1. Change Section 6 wording from release commitment to target scope.
2. Add a concise implemented/partial/planned matrix for FE-01–FE-08.
3. Add exact source/test references for claims retained as implemented.
4. Resolve the primary mobile-client decision and update LI-08.
5. Reconcile Report 1 with the revised Report 2 WBS and SRS before submission.

