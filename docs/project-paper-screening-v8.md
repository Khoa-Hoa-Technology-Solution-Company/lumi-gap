# Paper screening v8: independent adjudication invitations

## User flow

1. Two independent reviewers submit their own ballots. Disagreement stays in both reviewers' My Work; it is not returned to the available review queue.
2. Reviewers discuss privately. Each can revise only their own ballot, with a reason and immutable previous revisions. Matching valid current ballots resolve automatically as `CONSENSUS_AFTER_DISCUSSION`.
3. Either submitted reviewer can request adjudication directly after the discussion section in the paper reading modal. No message quota or waiting period is required. The confirmation describes the automatically attached packet; the requester cannot select an adjudicator. Opening a case does not submit a statement for either person. An eligible historical collaborative round with exactly two valid conflicting ballots uses the same case workflow, preserving its frozen protocol and history.
4. One neutral case is created for that round. It includes the frozen protocol, RQs, paper, exact source file references, original/current ballots and revisions, and the prior reviewer discussion.
5. An eligible candidate receives an explicit invitation. Acceptance grants access to this packet and its sources. Declining records the response and tries the next priority group without creating another case or reinviting the same person.
6. Both reviewers have the same configurable statement deadline (default 48 hours). Each can use their existing ballot or add an independently versioned supplement. New supplements are sealed until both finish or the common deadline passes. Silence remains missing information, never agreement.
7. The accepted, currently eligible assignee may decide once ready. A reason and source basis are required; exclusion requires an actual frozen exclusion criterion and adequate source scope. More information closes that adjudication attempt while keeping binary selection unresolved and records the requested next step in the reason.
8. The decision is a separate `ScreeningFinalDecision`. The two reviewer ballots stay unchanged. Completed tasks disappear. Reconsidering a completed result requires reopening with a reason; a new case preserves the previous packet and its explicitly linked decision.

There is no adjudicator chat, third reviewer ballot, common-proposal confirmation step, random candidate selection, or AI adjudication.

## Frozen selection policy

`ScreeningSettings` stores `preferredAdjudicatorId`, `adjudicationCoordinatorIds`, `statementWindowHours` and the existing optional `authorizedAdjudicatorIds` allowlist. Settings are copied into each round and apply to future rounds when edited.

Priority order:

1. Explicit preferred candidate, or the single legacy authorized candidate.
2. Accepted primary mentor with effective paper permissions.
3. Accepted secondary mentor with effective paper permissions.
4. Independent active member.
5. Independent Owner.

The paper proposer, current reviewers, inactive/unverified accounts, revoked or expired mentors, candidates outside a nonempty allowlist, and previously invited candidates are excluded. The Owner has no independence exemption. A preferred person must also belong to a configured nonempty allowlist.

One candidate in the highest priority group is invited automatically. A tie exposes the entire highest group to an independent Owner or configured active team coordinator, who must record a selection reason. Display sorting never selects the winner. A reviewer/proposer cannot coordinate their own case; the current invitee cannot adjudicate their own conflict report. With no eligible candidate, the case stays `WAITING_ASSIGNMENT`.

## State and concurrency

| State | Meaning |
| --- | --- |
| WAITING_ASSIGNMENT | No live invitation; waiting for an independent coordinator or an eligible candidate |
| INVITED | Explicit invitation sent |
| ACCEPTED | Candidate accepted; waiting for readiness |
| IN_PROGRESS | Accepted and both supplements finished or deadline passed |
| COI_REVIEW | Conflict report pauses acceptance/decision until independent review |
| COMPLETED | Separate immutable adjudication result recorded |
| CANCELLED_AS_RESOLVED | The two valid ballots agreed before adjudication finished |
| CANCELLED_REOPENED | The round/ballot was formally reopened |

`IN_PROGRESS` is derived from accepted status and current readiness; elapsed time needs no background write. Deadline readiness is enforced on the server when reading or deciding.

All mutations use the existing workspace transaction/account/project locks and idempotency audit. PostgreSQL partial unique indexes independently enforce one active case per round and one live SENT/ACCEPTED invitation per case. Each candidate can be invited only once per case.

Case commands use optimistic case versions. Supplemental statements use packet version plus the reviewer's own statement revision, allowing A and B to submit concurrently. Decisions check both round and case versions. A ballot change refreshes the packet, stores both prior/current packets in the audit, increments packet/case versions and restarts the same deadline for both reviewers. Old supplements remain historical and no longer satisfy current readiness. Ballot agreement cancels a pending case under the same lock.

Cases link their own immutable decision through `finalDecisionId`, constrained to the same project and round. Historical views never select the most recent result of a reopened round.

## Authorization and provenance

- Every operation resolves the project and active caller through `withWorkspace` and existing authorization.
- A case is visible only to its reviewers, an independent authorized coordinator, or its currently eligible invitee/assignee. Former declined/revoked candidates lose access. Historical assignees retain only the case they accepted while underlying membership/mentor permissions remain valid.
- Before acceptance, the invitee gets metadata, not abstract, ballots, previous discussion, supplements, or PDF bytes.
- Statement plaintext is excluded from generic audit/activity records while sealed. Only the scoped case view reveals it under the readiness rule; each reviewer can always see their own history.
- Source download requires an exact packet file ID, project/paper match, current access and unchanged frozen SHA-256/size. It grants no library, project chat, manuscript or LaTeX access.
- Source references are scoped file identities, not public storage URLs. Responses use private no-store headers and PDF nosniff.
- COI pauses the case; independent review records a reason. An upheld report revokes the candidate and falls back, preserving all invitations/reports.
- In-app notifications/tasks use existing infrastructure and routes. Coordinator notifications exclude reviewers, proposer, assignee and inactive recipients. Decisions notify eligible reviewers and proposer. No private statements enter notifications.

## API and UI

Existing prefix: `/api/v1/projects/:id/research/screening-v2`.

- `POST /rounds/:roundId/request-adjudication`: open/join one neutral case.
- `GET /rounds/:roundId/adjudication?caseId=...`: scoped current/historical packet.
- `POST /rounds/:roundId/adjudication`: ACCEPT, DECLINE, STATEMENT, SELECT, RETRY, REPORT_CONFLICT, REVIEW_CONFLICT.
- `GET /rounds/:roundId/adjudication/sources/:fileId?caseId=...`: authenticated scoped PDF bytes.
- `POST /rounds/:roundId/resolve`: separate decision, guarded by round/case versions.
- `GET /adjudications`: current eligible invitation/assignee tasks.

Authenticated case route: `/academic-support/projects/:projectId/screening/:roundId`. My Work, mentor tasks and notifications link here. The Papers four main tabs are preserved. Policy configuration is inside the existing review workflow settings. The case page has equal reviewer sections, collapsed ballot/discussion/invitation/statement histories, source access and a guarded decision form. Drafts survive errors/stale responses; successful saves clear the unsaved guard.

## Compatibility and migrations

New rounds use workflow version 8. Existing v5–v7 rounds use invitations when requesting adjudication and cannot bypass them using direct finalizer, common-proposal or confirmation writes. Old mentor packet shares are revoked when a normalized case is opened. Historical snapshot reads are retained. Pre-v5 workflows keep their existing legacy write compatibility, without introducing adjudicator chat.

Additive handwritten migrations:

- `20261102000100_screening_adjudication_invitations`
- `20261102160000_screening_case_decision_link`

No ballots, extraction histories or existing research data are removed. Run `pnpm --filter backend db:migrate:deploy`; never `migrate dev`.

## Verification

`node apps/backend/scripts/test-screening-cases.mjs --regression` derives a local isolated `_test` PostgreSQL database, applies migrations only there, mocks notification delivery/queues, and runs the case tests plus screening, slots, evidence, synthesis and collaborative research regressions. It refuses remote or application-database test URLs.

`node apps/web/scripts/screening-case-preview.mjs` serves real UI components with in-memory role/state fixtures on loopback port 8092. All `/api/` requests are denied, so visual QA does not send real invitations or scientific decisions.
