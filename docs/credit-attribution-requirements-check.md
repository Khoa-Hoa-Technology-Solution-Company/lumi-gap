# CRediT requirements recheck

Rechecked against the user's complete CRediT contribution, research attribution and
manuscript authorship request on 11 November 2026. This checks the working source,
not the older application still served on localhost:8080.
The user subsequently requested the local update; it is now applied and verified.
See [local Docker update](credit-attribution-local-update.md) for migrations, backups,
runtime checks and the separately pending older OpenAlex migration.

## Completion assessment

The required application workflows are implemented in the existing contribution,
allocation, mentorship, attribution and sealing services. The previous passing
suites were not sufficient to close the review: this recheck found and corrected
two uncovered defects, plus unnecessary consent invalidation for role ordering.

| Original requirement | Implementation and verification evidence |
| --- | --- |
| 1. Audit and reuse architecture | Initial audit table in `credit-attribution-hardening.md`; existing services/models reused. No parallel contribution or author-management subsystem. |
| 2. Official CRediT taxonomy | Exactly 14 existing codes; NISO role IDs, English/Vietnamese labels, source-aligned definitions/summaries, student explanations/examples and official links in shared `credit-taxonomy.ts`. Tests assert enum compatibility and unique IDs. Full original definitions remain available through source links. |
| 3. Work recording and evidence | Existing record form supports title, description, work date, participants, multiple roles, related task/artifacts, creator, current acknowledgement state and revision history. Supported linked artifacts are permission-checked and fingerprinted. External narrative remains user-provided. |
| 4. Individual acknowledgement | Authenticated own-role acknowledgement and independent peer acceptance remain separate; self-recorded work is explicit. Correction versions preserve prior responses and invalidate obsolete review. Owner cannot act for another participant. |
| 5. Work/evidence integration | Tasks, papers, evidence, manuscripts/snapshots, reports, mentor feedback and other supported workspace references are reused. Role and artifact overviews are deduplicated. Activity does not automatically grant scientific credit or authorship. Activity-based suggestions are optional in the request. |
| 6. Separate allocation | Existing weighted, basis-point allocation retained, with category weights, rationale, zero shares, approval/challenge/finalization history. Calculator and matrix workflow regressions pass. No conversion from percentages to author order. |
| 7. Lecturer contributions | Effective mentors can record their own substantive work and feedback references without membership. Real accepted shared-feedback integration is tested. A mentor relationship alone grants no authorship. |
| 8. Explicit authorship policy | Ordered authors, corresponding author, name/email/affiliation, optional ORCID, roles, rationale, acknowledgements and justified omissions use the existing snapshot declaration. Venue policy is explicit; ICMJE is guidance, not a universal eligibility algorithm. |
| 9. Exact-version consent | Snapshot/checksum, list/order/roles and policy are version-bound. Everyone explicitly responds for themselves. Stale writes and stale personal decisions are rejected. Material changes reset consent; changing only the order of the same role set now preserves consent. |
| 10. Non-author/former contributors | Detected contributors must be dispositioned as authors, acknowledged people or justified non-authors. Required acknowledgement permission is checked. Former contributors retain scoped review/challenge access without general project/source access. |
| 11. Disputes | Objections survive replacement declarations and snapshots. A newer objection now also blocks selecting an older previously approved snapshot. Only the affected person's later response clears their personal objection; serious integrity cases require an unaccused institutional administrator's documented resolution. |
| 12. Internal submission readiness | Exact author order, individual approvals, contributor review, metadata, acknowledgement permission, contribution evidence and unresolved concerns gate sealing. Ordinary drafting stays available. The UI names responsible people and now retains each concern's reason and relevant screen instead of collapsing concerns into a generic message. |
| 13. Statement export | Approved text, canonical-role JSON and escaped LaTeX section are available in agreed author order with exact check/snapshot metadata and audit event. No automatic source insertion or new publisher portal. No existing JATS export path required extension here. |
| 14. UX and languages | Existing workspace opens on work, with Pending, Overview and Allocation plus advanced disclosure. Shared searchable role picker; compact read-only roles; desktop/mobile QA. Static evidence-source labels now pass through translation individually. |
| 15. Security/data integrity | Existing auth, actor binding, scoped resource access, project transaction locks, expected versions, idempotency, immutable history, private responses and audit events are preserved. Cross-project, former-member, mentor and concurrency cases are tested. |
| 16. Verification | Real isolated PostgreSQL and authenticated HTTP suites, frontend tests, runtime audit, types/build and scoped lint are documented below and in `credit-attribution-verification.md`. Synthetic PDF bytes cover access, not actual TeX rendering. |

## Defects found during this recheck

1. **An older snapshot could bypass a newer objection.** The cross-snapshot merge
   previously skipped a person's objection whenever the selected snapshot already
   contained any response by them, including an older approval. It now includes the
   latest unresolved objection even then, without importing positive approval from
   another snapshot. Regression tests verify old-snapshot sealing and statement
   export both fail, and a later personal resolution does not confirm other authors.
2. **Pending was a project status filter rather than the viewer's pending actions.**
   Creators and people who had responded still appeared; additional independent
   reviewers were invited after one had already accepted. A parameterized, scoped
   query now identifies actual outstanding participant/independent reviews before
   search, counting and pagination. Archived projects return no pending actions.
3. **Role display order reset valid approvals.** Comparing role arrays positionally
   treated the same role set as a material change. No-op comparison now ignores role
   order for authors and acknowledgements while preserving author order, all other
   metadata and the original digest. Removing a role still requires new approval.

Two new database regressions failed against the previous source, with all 37
existing base tests passing: `apps/backend/scratch/credit-recheck-before.log`.
After fixing those defects, all 83 backend cases passed. Adding the role-order
regression increases the final backend set to 84.

The checklist review also found that distinct concerns for the same person were
deduplicated into a single generic sentence, hiding the actual reasons. The UI now
keeps each reason and identifies Contributions, Allocation, the current declaration
or institutional review as appropriate. A frontend regression covers two distinct
concerns and translated evidence sources.

## Verification for this recheck

- Backend: **84 passed** (40 base + 44 extended), seven files,
  `apps/backend/scratch/credit-requirements-final.log`.
- Frontend: **85 passed**, four files,
  `apps/web/scratch/credit-requirements-tests.log`.
- The four PostgreSQL-only runtime checks passed in the original final verification;
  this recheck does not change persistence/runtime configuration.
- Final TypeScript/build/lint results are recorded in the linked verification report.

## What remains outside this completion claim

- No migration or source update was applied to the application database or
  localhost:8080. Seeing the new behavior there requires the normal local update.
- No commit, push or production deployment was performed for this request.
- Actual TeX compilation with a real manuscript was not exercised; PDF access tests
  use synthetic bytes and the existing compiler remains responsible for rendering.
- No external Git proof service, electronic signature, arbitrary publisher-policy
  engine, legal ownership ruling or control over external journal submission is
  claimed. Publication policy, institutional investigation and external permission
  evidence still require human judgment.

See [implementation/audit](credit-attribution-hardening.md) and
[full verification and file inventory](credit-attribution-verification.md).
