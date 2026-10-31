# Independent paper screening — V5 implementation and verification

Date: 2026-10-31. Scope: Project → Papers → Đọc & đánh giá tài liệu.

## Existing workflow audit

The existing V3/V4 rounds already provided immutable reviews/final decisions/audits, blinded responses, independent adjudicators, owner-approved lecturer packets, reviewer revisions and separate unanimous group decisions. Reused these models, project/account locks, HTTP validation, rate limiters, research history and membership checks.

Missing behavior addressed here:

- No-settings projects defaulted to open collaborative opinions with an extra finalizer step.
- Adding a paper did not create/assign a screening round.
- A proposal required its author to confirm again; the other reviewer could not explicitly decline it.
- Uncertainty could not receive a separate shared request for information.
- Reviewers could not request adjudication from their evaluation panel.
- Accepted evidence was preserved but did not visibly return to review when its source decision changed.
- Screening audit events were absent from the contribution participation feed.

## Implementation

### Defaults and assignment

Future rounds use workflow version 5. For an unconfigured project, recommend two independent reviewers; a one-person team starts with one reviewer. The first screening write persists that recommendation as configuration version 1. Subsequent membership changes do not silently change the configured reviewer count. GET requests do not initialize rounds or save rules.

The default stages are title/abstract → full text. Explicit collaborative or protocol settings are honored; existing round snapshots and historical decisions retain their previous rules.

All three paper-add paths initialize the same workflow inside their existing transaction: catalog add, manual/DOI import, and forum citation add. Duplicates do not start another round. Assignment uses the existing deterministic greedy algorithm: retain valid work, prefer non-proposers, minimize pending workload, then total workload, then stable ID. When a protocol requires more people than are eligible, it records the unfilled slots and waits; it does not fabricate reviewers or reduce the requirement.

Existing never-started papers have a member-accessible **Bắt đầu đánh giá độc lập** action. Historical classifications require explicit confirmation and a preserved legacy snapshot. Existing started rounds are never silently replaced.

### Reviews, discussion and decisions

- Only assigned active members submit a review. Until all slots are complete, other choices/comments and derived decision metrics stay hidden, including from Owner.
- Unanimous binary independent reviews produce one separate automatic outcome; no Owner approval. SIMPLE V5 uses the same transitions for its one reviewer.
- Title/abstract inclusion in V5 is always preliminary, including an abstract-only protocol. It cannot authorize evidence acceptance or official synthesis. Configured full-text stages advance automatically and require a full-text reference when reviewing.
- Binary disagreement opens discussion. UNSURE produces `NEEDS_MORE_INFO`, never a binary inclusion/exclusion.
- In V5 both sides discuss before a shared proposal. Submitting with explicit consent records the author's confirmation; remaining reviewers must accept independently. Older V3/V4 rounds retain their separate author-confirmation semantics.
- Choices: keep, exclude, or need further information. The proposal and completion record identify the exact immutable review versions. Each confirmation is an attributable timestamped audit event.
- The other reviewer can decline with a reason. The proposal becomes invalid; the underlying conflict, personal reviews and discussion remain. Revision, reassignment of the adjudicator or a newer proposal invalidates stale acceptance.
- Reviewers can request adjudication after discussion. Owner receives an in-app notification and must explicitly assign an eligible independent person. The Owner's own review never gives an overriding vote.
- A frozen optional authorized-adjudicator list restricts candidates and is rechecked when deciding. Live membership, active account, accepted mentorship, permissions and shared packet approval remain mandatory.
- Lecturer decisions allow keep, exclude or further information. A decision creates a separate versioned record, never Review #3. The scoped packet still excludes unrelated project resources.
- When no independent adjudicator is available, a reviewer may advance to full text only if the frozen protocol explicitly permits it and discussion is complete. The abstract round remains `NEEDS_MORE_INFO`, inactive, with no fabricated final decision. The full-text round visibly identifies the provisional transition. Original disagreement is not reported as resolved.

### Evidence, contribution and notifications

When an included source loses eligibility, accepted evidence becomes PENDING with a new preserved revision and explanation. Claims, source links, annotations and old accepted snapshots remain. The Evidence Matrix displays a source warning; acceptance still requires current source eligibility. No findings are generated by screening.

Meaningful screening participation is projected into the existing contribution activity feed with the actual actor, paper and version. The projection contains no review choices/reasons/private text. Automatic agreement does not award the last submitter authorship for other reviewers. It does not calculate scores, quality or contribution percentages. Assignment, stage advancement and other administrative details remain in the screening audit.

In-app assignment, pending agreement and adjudication-request notifications link to the project paper. Lecturer assignment retains its dedicated scoped packet link. No automatic lecturer invitations or email delivery are introduced.

## API and authorization

Prefix: `/projects/:id/research/screening-v2`.

| Endpoint | Authorization / purpose |
| --- | --- |
| `POST /papers/:paperId/begin` | Active member; explicit legacy re-screen confirmation; no automatic historical replacement |
| `POST /rounds/:roundId/agreement` | Assigned submitted reviewer; complete visible cohort; V5 discussion and author consent |
| `POST /rounds/:roundId/agreement/confirm` | Exact outstanding reviewer; proposal ID and expected round version |
| `POST /rounds/:roundId/agreement/decline` | Another assigned reviewer; reason, proposal ID and expected version |
| `POST /rounds/:roundId/request-adjudication` | Assigned reviewer after discussion; protocol permits adjudication |
| `POST /rounds/:roundId/advance-full-text` | Assigned reviewer; explicit protocol permission; discussion; no eligible adjudicator |
| `POST /rounds/:roundId/finalizer` | Owner manages explicit assignment and approves scoped lecturer sharing |
| `POST /rounds/:roundId/resolve` | Assigned independently eligible adjudicator; current membership/permissions/packet; reason and version |
| `PUT /config` | Owner; versioned future rules, permitted adjudicators, conservative advancement |

All writes use the shared limiter, strict Zod body validation, project/account locking, transaction and idempotency mechanisms. Removed members cannot submit, accept or adjudicate. Archived/completed projects reject writes. Concurrent stale decisions cannot create another final result. No tokens, credentials or independent review text are added to notifications.

## Additive migrations

- `20261031190000_screening_more_information`: extends the final-decision CHECK to preserve non-terminal `NEEDS_MORE_INFO` resolutions.
- `20261031200000_screening_protocol_permissions`: adds `authorized_adjudicator_ids` and `allow_conservative_full_text` to settings.

No data deletion, review rewriting, trigger removal, foreign-key removal or destructive migration. Existing immutable review/final/audit protection remains.

## State transitions

```text
Add / explicitly begin → NOT_REVIEWED, assigned cohort
Some reviews → IN_REVIEW (choices remain blind)
All INCLUDE → INCLUDED for this stage → FULL_TEXT when configured
All EXCLUDE → EXCLUDED for this stage
Any UNSURE → NEEDS_MORE_INFO
INCLUDE versus EXCLUDE → NEEDS_RESOLUTION
Discussion → proposal → other reviewer confirms → separate shared resolution
                    ↘ declines → continue discussion, no result overwritten
Discussion → request → explicitly assigned independent adjudicator → ADJUDICATING
Adjudication → INCLUDED / EXCLUDED / BACKGROUND / NEEDS_MORE_INFO
Permitted conservative advancement → unresolved abstract history + fresh FULL_TEXT round
Authorized own revision → new review revision, stale proposals revoked, recompute
```

## Executed verification

- Isolated PostgreSQL screening suite: **67 passed** (including new V5 coverage).
- PostgreSQL mentorship/access/relationship/screening regression: **155 passed** across four suites. This run preceded the final first-write default-freezing refinement; the screening suite was rerun after that refinement.
- Screening/library/adjudication UI plus notification destinations: **95 passed** (46 screening/library/adjudication and 49 notification tests).
- Calculator / DTO boundaries: **16 passed**.
- PostgreSQL runtime audit: **4 passed** as part of backend build.
- Backend build, web TypeScript/build and scoped ESLint: see adjacent `2026-10-31-screening-v5-*.log` files.
- Browser: simulated A proposes; B declines; B proposes a replacement; A explicitly confirms; both original dissenting reviews remain. Desktop and 412 px mobile checked; measured document width 397 px at a 412 px viewport, no horizontal overflow.

Browser fixtures deny all real `/api/` requests. PostgreSQL operations run against the isolated `_test` database. The actual project's scientific reviews/decisions were not edited for testing.

### Local delivery

Both additive migrations were applied to the isolated test database and local application database. Local migration status reports all 109 migrations up to date. Backend and web production artifacts were deployed to the existing local containers; backend readiness confirms PostgreSQL and Redis, and the web responds at port 8080.

Read-only verification on the actual project loaded its four papers, preserved the historical reviews, exposed the explicit start action for an unstarted paper, and kept evidence extraction disabled until eligible. No actual project review or scientific decision was submitted during this check.

The final dialog description was made neutral across legacy collaborative and independent rounds. Its focused library suite (9 tests), web TypeScript and scoped ESLint were rerun successfully after this copy change.

### Mapping the requested 29 scenarios

All references below are executed cases in `screening.persistence.test.ts` unless UI is stated.

| # | Scenario | Coverage |
| --- | --- | --- |
| 1 | Add enters screening | V5 adds and auto-assigns; both catalog add and manual import |
| 2 | Three members prefer non-proposers | V5 two non-proposers; V3 prioritization |
| 3 | Two members include proposer | V5 two-person defaults |
| 4 | One-person mode | V5 one-person defaults, automatic exclusion and versioned reopen |
| 5 | Separate independent submissions | V4 exact cohort; simultaneous submissions |
| 6 | Hide the other choice | V4 hidden choices; choices/comments/derived metrics hidden from Owner |
| 7 | No third ordinary review | Closes intake after completion and reopening; exact-cohort validation |
| 8 | Automatic agreement | V3 unanimous INCLUDE/EXCLUDE; V5 title/full-text progression |
| 9 | Contradictory conflict | V5 proposal/adjudication fixtures require NEEDS_RESOLUTION |
| 10 | Uncertainty nonbinary | V3 unsure; V5 separate shared further-information resolution |
| 11 | Discussion | V5 discussion prerequisite; V3 opposing sides; paged discussion/history |
| 12 | Proposal | V5 author consent; separate versioned resolution |
| 13 | A cannot approve as B | V5 second attempt by author rejected |
| 14 | B accepts | V5 acceptance and one concurrent outcome; UI confirmation |
| 15 | B rejects / continues | V5 decline; UI stale decline and retained draft |
| 16 | Two confirmations and review versions | V5 confirmation timestamps; immutable GROUP_AGREEMENT and review IDs |
| 17 | Stale proposal after edit | Supersedes proposals and invalidates on review revision |
| 18 | Independent adjudication | V3 eligible adjudicator; V5 authorized list recheck |
| 19 | No Review #3 from adjudicator | V5 further-information decision preserves exactly two reviews |
| 20 | Owner reviewer cannot override | V3 explicit independent adjudicator, reviewer excluded |
| 21 | Unauthorized denied | HTTP/auth/role checks; cross-project tests; V5 authorized list |
| 22 | Removed members denied | Leaving/revocation; member/account authorization and scoped mentor revocation |
| 23 | Versioned edits | Own unpublished revision; V3 published own reopen |
| 24 | Reopened finals preserve history | V3 final/revision history; append-only trigger tests |
| 25 | Abstract versus full-text | V5 two-stage test; configured stages and required full-text references |
| 26 | Legacy retained | Explicit collaborative compatibility; legacy classifications and migration on populated tables |
| 27 | Audit/evidence participation | V5 sanitized actor activity; accepted evidence reset with preserved history |
| 28 | Concurrency | Simultaneous submissions, finals, proposals, confirmations and idempotent retries |
| 29 | Browsing/search/filter/evidence links | PostgreSQL author/keyword search and pagination; library UI navigation; Evidence Matrix source flags |

## Boundaries

- Existing explicit COLLABORATIVE rounds retain their original finalizer behavior. This change does not manufacture independent assessments from old opinions.
- Reassignment preserves submitted history and replaces unfinished unavailable assignments before disclosure. Intake stays closed after disclosure; reviewers revise through the authorized reopening flow.
- Advanced PRISMA reporting and a separate workload analytics redesign remain optional and were not added.
- In-app notifications are covered; SMTP delivery was not exercised.
- Browser testing uses simulated accounts; real authorization, transactions, evidence and persistence are tested separately against PostgreSQL. This is not a claim of a full multi-user browser test against the live project.
