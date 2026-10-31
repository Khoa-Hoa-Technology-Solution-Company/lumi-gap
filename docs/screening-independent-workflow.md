# Independent screening and scoped lecturer adjudication

Implemented: 2026-10-31. New rounds use `workflowVersion: 5`.

V5 adds automatic initialization/assignment on paper addition, persisted two-reviewer defaults
(one reviewer for a sole researcher), author consent plus the other reviewer's response,
non-binary resolutions, reviewer adjudication requests, authorized adjudicator lists,
protocol-permitted provisional full-text advancement, evidence review flags and sanitized
participation activity. See [the V5 audit and executed test mapping](audits/2026-10-31-screening-v5.md).

The detailed V3/V4 compatibility rules below continue to describe older round snapshots.
V3 independent rounds receive the independent-review access and agreement safeguards below;
their existing configured reviewer cohorts remain intact. Pre-V3 snapshots retain legacy behaviour.
Existing round snapshots retain their previous rules; ordinary COLLABORATIVE and SIMPLE review remain available.

## Workflow

| Situation | State | Behaviour |
|---|---|---|
| No submitted review | Chờ đánh giá | Wait for assignments/reviews |
| Some assigned reviews submitted | Đang đánh giá | Wait for every assigned reviewer, including additional reviewers above the minimum |
| All assigned reviewers INCLUDE | Qua sàng lọc | Record immutable CONSENSUS final with no human resolver |
| All assigned reviewers EXCLUDE | Loại sơ bộ at title/abstract; Đã loại at full text | Record criteria-based exclusion reasons |
| Completed votes include UNSURE | Cần xem xét thêm | Obtain information and reopen relevant reviews; adjudication cannot bypass uncertainty |
| Completed INCLUDE and EXCLUDE votes | Có bất đồng | Discuss before adjudication |
| An eligible adjudicator is explicitly assigned | Đang phân xử | Wait for a reasoned final decision |

When the frozen protocol requires TITLE_ABSTRACT followed by FULL_TEXT, inclusion automatically
opens a new full-text round and carries forward still-active reviewers. The prior round and final
remain in history. Evidence extraction and official analysis are blocked until full-text inclusion.

## Reviewers and adjudicators

- Automatic assignment preserves valid existing assignments, prioritizes people other than the proposer,
  then balances pending work, total assignments and stable ID. Small teams can include the proposer;
  manual assignments remain available.
- Independent reviews stay hidden until all assigned reviewers submit and the required count is met,
  including if a client attempts to configure independent review as non-blind. Early unblinding cannot bypass this.
- V4 assigns exactly the configured number of reviewers (default two). Once reviews have been disclosed,
  ordinary reviewer intake is closed permanently for that round, including after a personal review is reopened.
  Protocols requiring more reviewers must specify that count before starting a new round.
- At least two assigned reviewers representing both INCLUDE and EXCLUDE must contribute to discussion
  after the latest review submission before adjudication can be assigned.
- The owner manages assignment but has no default adjudication authority in V3.
- An adjudicator must be an active eligible team member or an accepted lecturer with effective
  PAPERS_VIEW and PAPERS_COMMENT permission. Current assigned reviewers cannot adjudicate their own round.
- Choosing the proposer requires explicit acknowledgement and a recorded reason.
- Under either policy, reviewers can propose a separate group decision and reason, without changing their
  personal opinions. Every assigned reviewer must then explicitly confirm the exact proposal. Proposal
  creation does not count as confirmation. Under CONSENSUS policy adjudication remains unavailable.
- Reviewers can reopen their own submitted review with a reason, before or after publication. Owners retain administrative reopening.
  Reopening preserves old reviews/finals, increments the review revision, clears adjudicator assignment,
  revokes shared adjudication packets and invalidates group-agreement confirmations. If reviews had already
  been disclosed, it marks the round unsuitable for independent-agreement/Kappa metrics. Other current
  reviews and discussions are hidden again until the revised cohort completes; prior knowledge cannot be undone.
- Archived and completed projects cannot receive new screening commands.

## Lecturer sharing and access

1. The lecturer first accepts the normal mentorship invitation and has effective paper permissions.
2. After reviewer discussion, the owner chooses the lecturer and previews the current packet. The owner
   may select up to 20 comments from the 50 most recent round discussions; none are selected by default.
3. The owner explicitly approves sharing before assignment. A changed round version requires review again.
4. The system stores an immutable share and assignment audit, then creates a durable in-app notification.
5. The lecturer opens `/academic-support/projects/:projectId/screening/:roundId` and records
   INCLUDE/EXCLUDE with a reason and confirmation.

The packet contains paper title/abstract/year/DOI, phase, frozen criteria/questions and current review
submissions and only explicitly selected discussion snapshots. It does not include reviewer account IDs,
the remaining team discussions, project descriptions, other
papers, manuscript source or datasets. Review comments/full-text references are part of the explicitly
approved packet and may contain information the reviewers wrote; anonymity is not inferred from prose.

The lecturer does not become a ProjectMember. General screening detail, board, history and other
project endpoints remain inaccessible without their own authorization. Packet read and resolution
recheck assignment, current mentorship eligibility, permissions and live share under project/account
locks. A generic PAPER share cannot impersonate an adjudication packet: an immutable assignment audit
must refer to its share ID, its JSON schema must validate, and its review IDs/revisions/content and
protocol criteria must still match. Changes or revocation block further use.

Finals remain separate from reviews and have immutable review references, author/source, reason,
version and time. Reopening hides the old final from the current decision form without deleting history.
Expected versions, per-request keys and project serialization prevent stale or duplicate resolutions.

## Using it

In the paper library, open protocol management, select **Độc lập**, set at least two reviewers,
choose the desired stages and save. Start a new round and use automatic or manual assignment.
Existing rounds continue according to their frozen protocol. To adjudicate, complete the reviews,
discuss the disagreement, then use **Giao người chốt**. With a lecturer, review and approve the packet.
For a two-person team with no independent adjudicator, discuss and explicitly confirm a separate group decision, or invite an eligible
lecturer; neither reviewer silently gains authority to override the other.

## Group-decision persistence and concurrency

The existing immutable `screening_audit` log stores `AGREEMENT_PROPOSED`, each actor's
`AGREEMENT_CONFIRMED`, and the resulting `GROUP_AGREEMENT`. Proposals snapshot the frozen rule version,
current review IDs/revisions (through immutable review references), reviewer cohort, decision and reason.
A final `ScreeningFinalDecision` with source CONSENSUS and no individual resolver is created only after
every reviewer confirms. Personal reviews, initial disagreement and Kappa inputs are never rewritten.
The same stage-advancement and full-text eligibility rules apply to agreed decisions.

All commands run under the existing project transaction lock, version check and idempotency key.
The serialized round version orders proposals; transaction timestamps alone cannot establish ordering
when requests wait for a lock. Replacing a proposal requires everyone to confirm again. Reopening a
review or assigning an adjudicator invalidates prior proposals; archived/completed projects reject writes.
No additional migration is required for these immutable event records.

Selected discussion content is resolved server-side from audit IDs scoped to the exact project and round.
The lecturer packet validates the approved IDs and immutable content, rather than trusting text submitted
by the browser. Changing the selection clears sharing consent in the UI and requires approval again.

## V4 verification (2026-10-31)

- Isolated PostgreSQL screening suite: 56 passed, covering blind access, exact reviewer count,
  intake closure after reopening, personal revisions, separate confirmations, stale/concurrent proposals,
  immutable history, unchanged dissent/Kappa, full-text advancement and selected lecturer discussion.
- Screening calculator/DTO unit suite: 16 passed. PostgreSQL runtime audit: 4 passed.
- React screening/library/adjudication suites: 41 passed (including 13 adjudication/agreement cases).
- Backend production build, web TypeScript check and production build passed; scoped lint passed.
- Exercised both simulated reviewers in the browser: one confirmation does not finalize; both confirmations
  finalize while keeping the two differing personal opinions. Checked the 412px layout with no horizontal overflow.
- Evidence: `docs/audits/2026-10-31-screening-v4-*.log`,
  `docs/audits/2026-10-31-screening-v4-agreement-desktop.png`,
  `docs/audits/2026-10-31-screening-v4-agreement-mobile.png`.
- Tests use an isolated database/in-memory UI. Real project decisions were not changed for verification.
- Local backend, web and compiled notification worker were updated. `/ready` reported PostgreSQL/Redis
  ready and the web endpoint returned HTTP 200. Opened the authenticated real project's library and
  protocol configuration read-only. It still uses COLLABORATIVE v0; use a new INDEPENDENT round to
  activate this workflow, rather than retroactively changing its existing scientific records.

## Prior V3 verification

- Isolated PostgreSQL regression: 133 tests passed; subsequently expanded screening suite: 46 tests passed
  (45 screening cases overlap the earlier run; one additional multi-reviewer discussion case).
- Screening calculator/DTO unit suite: 16 passed; PostgreSQL runtime audit: 4 passed.
- React screening/library/adjudication/notification suites: 83 passed.
- Backend build, web TypeScript check and production build passed.
- Scoped lint passed without errors or warnings.
- Tested lecturer packet GET with authenticated session, unauthenticated denial, `private, no-store`,
  and denial of the general round-detail endpoint. Tested simultaneous resolution and stale versions,
  revoked shares/policy, forged shares, completed projects, reviewer reopening and old-final visibility.
- Desktop and 412px mobile UI inspected using an in-memory fixture; submitted its simulated conclusion.
  No real project invitations, reviews or scientific decisions were changed for verification.
- Opened the authenticated real project's library and protocol view read-only after local deployment;
  confirmed the new state filters and access to protocol settings render successfully.
- Migration `20261031160000_screening_independent_workflow` applied to isolated test and local application
  databases through `prisma migrate deploy`. Local backend/web/notification worker rebuilt/restarted;
  `/ready` reports PostgreSQL and Redis ready, port 8080 responds 200.

Evidence: `docs/audits/2026-10-31-screening-v3-*.log`,
`docs/audits/2026-10-31-screening-v3-conclusion.png`,
`docs/audits/2026-10-31-screening-v3-mobile.png`.

The new assignment notification is verified in-app; email and push delivery are not claimed.
The previously recorded local SMTP/HTTP-origin configuration limitation is unchanged.
