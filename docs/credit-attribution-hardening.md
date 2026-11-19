# CRediT contribution and authorship hardening

Audit started 11 November 2026. This extends existing contribution, allocation,
mentor feedback, attribution and submission services, not a parallel subsystem.
The later [requirements recheck](credit-attribution-requirements-check.md) records
additional fixes for older-snapshot dispute bypass, viewer-specific pending review,
role-order-only consent changes, and checklist/source-label clarity.

## Audit before implementation

| Area | Existing implementation | Confirmed gap / intended change |
| --- | --- | --- |
| CRediT | All 14 internal enum values exist | Labels duplicated; no shared official identifiers or student-facing role definitions. Add shared metadata preserving enum values. |
| Work recording | Work date, participants, roles, artifact references, immutable history, authenticated reviews | Creator must always be a participant; mentor outside membership cannot record work. Reuse scoped access and permit authorized proposals without claiming roles for creator. |
| Acknowledgement | Peer acceptance and participant acknowledgement are distinct; revisions invalidate old reviews | Corrections can hide a disputed prior revision from submission checks. Preserve unresolved challenges until their affected reviewer responds to the correction. |
| Evidence | Project-scoped link validation; duplicate references removed within record | Clarify provenance/access checks versus scientific validation; verify duplicate records cannot inflate overview. |
| Allocation | Four weighted categories, basis points, roster approval/challenges and finalized revisions | Keep formula and authorship separate; test existing precision and zero shares before changing calculation. |
| Lecturer evidence | Mentor agreements and accepted feedback are recognized | Connect current scoped mentor contributions without granting general membership or library access. |
| Authorship | Ordered list and roles bound to immutable snapshot/checksum; individual decisions | No corresponding author or venue policy metadata; saved declarations implicitly confirm proposer; stale saves have no expected version. |
| Disputes | Contribution disputes, attribution decisions and integrity cases block readiness | Superseding an attribution check can drop another person's unresolved dispute. Carry challenges forward; only the affected person can resolve their decision. |
| Finalization | LaTeX publish gate checks ordered authors and attribution readiness | Check all sealing paths and prevent mutation of a sealed declaration. Ordinary drafting remains allowed. |
| UI | Existing Contributions and manuscript attribution dialogs | Default Contributions view prioritizes percentages; role chooser lacks explanations; no full statement export. Improve existing screens and preserve legacy routes. |
| Historical access | Former contributors can access own records and attribution decisions | Preserve redaction of unrelated evidence and test former-member challenges. |

## Standards and policy

Primary references checked on 11 November 2026:
[ANSI/NISO Z39.104-2022](https://www.niso.org/publications/z39104-2022-credit),
[CRediT roles](https://credit.niso.org/contributor-roles-defined/),
[implementation and persistent role IDs](https://credit.niso.org/implementing-credit/),
[ICMJE authors and contributors](https://www.icmje.org/recommendations/browse/roles-and-responsibilities/defining-the-role-of-authors-and-contributors.html).

CRediT describes work types. Team allocation is a separate agreement. Authorship
depends on the applicable publication policy and individual approval of the exact
snapshot, list and roles. ICMJE guidance is contextual, not imposed on all disciplines.
Peer acknowledgement is not scientific validation. LumiGap's internal submission
gate does not control independent external submissions or decide legal ownership.

## Controlled phases

1. Shared role metadata, audited behavior and compatibility checks.
2. Work evidence, acknowledgement, scoped mentor integration and correction protection.
3. Snapshot attribution, author/acknowledgement consent, readiness and exports, followed
   by database/API, UI, security and rounding regression checks.

Verification results and final file inventory are in the [verification report](credit-attribution-verification.md).
No application data reset, production deployment or automatic commit is authorized.

## Implemented behavior

### CRediT and work records

The existing fourteen enum values are unchanged. `credit-taxonomy.ts` supplies official
NISO persistent role IDs, canonical English labels, Vietnamese names, source-aligned
definitions/summaries, student explanations and examples. Official pages are linked
for the full definitions. Skills, payment credits, contribution types, percentages
and authorship remain separate concepts. No new contribution table was introduced.

The shared role picker supports search, multiple roles and optional examples. The
Contributions workspace opens on work records, with pending acknowledgement and a
role overview beside the existing allocation. Advanced advisor/history/activity tools
use disclosure. A contextual link opens the existing manuscript workspace.

The overview lists a role once per person and separately shows independent peer
acknowledgement. Artifact references are deduplicated across records; duplicate work
records cannot increase the role overview or create automatic authorship. This is
not an estimate of effort, a score or scientific validation.

An owner can propose work for a documented participant without adding themselves as
a contributor. Other creators must include their own actual work. The proposer
cannot acknowledge on another person's behalf. Named participants acknowledge their
own roles; current independent peers may review the work. An all-contributor team
without an independent peer remains explicitly self-recorded.

Effective mentors can create their own records without joining the project. Their
personal list contains only records attributed to them. The editor offers their own
mentor-feedback references and does not load private task/library selectors. Ordinary
members/owners retain existing project-wide permissions. Historical participants can
inspect their own records with unrelated evidence redacted.

Submitting records now retains an evidence fingerprint manifest in the existing
immutable contribution history. Fingerprints cover supported project artifacts:
tasks, manuscripts/snapshots, reports, evidence, mentor feedback, plans/revisions,
gaps, papers/screening, questions, review requests and trend snapshots. They prove
which stored artifact was referenced, not who performed work or whether it is sound.
If a linked artifact changes after submission, positive acknowledgement is refused
and internal readiness explains that a corrected record needs review. Historical
records without such manifests retain their original behavior; no provenance is
retroactively fabricated.

Corrections create new versions and reset obsolete acknowledgements. Prior challenges
remain in history and block readiness until the affected reviewer acknowledges the
correction. Creating a new draft or removing a person from the corrected participant
list does not erase that person's challenge.

### Allocation

The existing four-category matrix and integer basis-point formula were preserved.
Existing database tests cover fractional totals, negotiated zero shares, roster
changes, disputes, independent approvals, finalization and immutable history. Its
percentage does not select authors, order authors or certify contribution quality.

### Authorship and consent

The existing snapshot-specific attribution check stores approved display name,
declared author email/affiliation, optional checksum-valid ORCID, explicit order,
roles/rationale and exactly one corresponding author. These are declarations for
individual review, not verified employment or ORCID OAuth claims. No contact data is
silently read from private academic profiles.

One additive column, `manuscript_attribution_checks.publication_policy`, stores the
applicable policy name/version and acknowledgement-permission requirement. It is
included with the author data and snapshot checksum in the existing SHA-256 digest.
Historical rows default to `{}` and retain their original policy semantics. The
migration is `20261111110000_attribution_publication_policy`; it has been applied only
to the isolated test database.

Saving a proposal does not implicitly approve the proposer. Every proposed author
must explicitly confirm their own information and exact manuscript version. Linked
acknowledged contributors confirm permission when required. For people without an
account, a documented permission note may be supplied; it remains user-provided
evidence, not a verified electronic signature.

Updates require the current check version. Identical saves retain existing consent;
material author/order/role/policy changes create a new check and new approvals.
Changing only the display order of the same CRediT roles is treated as a no-op,
including in acknowledgements; author order remains a material change.
Responses bind to the authenticated account, current check and prior personal
response ID. Identical retries are idempotent; a stale tab cannot overwrite a newer
response. Existing confirmations are never copied to a new declaration. Unresolved
clarifications/disputes are carried forward, with original timestamps and explicit
origin references, including across snapshots in the same manuscript.

In-app notifications link authors, acknowledged people and affected contributors to
`/projects/:projectId/manuscripts/:id/attribution/:snapshotId`. This reuses the existing
attribution dialog in a scoped read/respond page, so former members and mentors do
not need general project access. Notification payloads contain identifiers only,
not manuscript text, private explanations or contact details. No new email sender
was added; these notifications use the existing in-app/push outbox.

Proposed authors can retrieve the compiled PDF of exactly that snapshot for review.
This grant is disclosed when proposing authors and is independent of project/mentor
membership. It does not grant LaTeX source, ZIP/assets, editing, other snapshots or
other project data. If no successful compilation exists, the UI asks the team to
compile the selected snapshot; it never invents a PDF or starts a paid/remote job.
Normal drafting is still available while authorship is pending.

### Disputes, sealing and exports

Existing work, allocation and research-integrity disputes remain authoritative.
The owner cannot clear another participant's attribution response by resaving or
opening a new snapshot. Authorship/contribution integrity cases require documented
institutional administrator resolution; an accused participant cannot self-resolve.
This records an institutional process, not LumiGap's legal or scientific judgment.
Personal author approval is never forced by an administrator.

Internal sealing checks the exact ordered author list and snapshot, reviewed
contributors, required metadata/permissions, individual approvals and outstanding
concerns, then retains the attribution and integrity report IDs. Sealed declarations
are read-only; later concerns use the existing integrity-case workflow. Restoring an
unchanged submission revision preserves its original attribution/integrity references.
Changed Markdown content drops those references rather than claiming old consent.
Uploaded PDF pre-review is an advisory manuscript-review workflow; it is not a claim
that a journal's publication-readiness policy has been satisfied.

Final approved statements are available as copyable text, structured JSON with
official role IDs, and an escaped LaTeX section compatible with the existing editor.
Exports follow the explicitly agreed author order, contain only declared roles and
write a digest-based audit event. No JATS exporter existed in this path, so none was
invented. Copying the LaTeX section does not silently edit the manuscript.

### API additions

All routes reuse authentication, existing actor/project resolution, response envelopes
and existing services. Contribution responses are explicitly private/no-store.

- `GET /api/v1/projects/:id/contributions/work-people`: scoped participant/evidence choices.
- `GET /api/v1/projects/:id/contributions/overview`: deduplicated role overview.
- `GET /api/v1/projects/:projectId/manuscripts/:id/snapshots/:snapshotId/credit-statement`.
- `GET /api/v1/projects/:projectId/manuscripts/:id/snapshots/:snapshotId/attribution-document`: exact review PDF only.

Existing save/decision APIs carry the additive policy, author metadata, expected check
version and expected personal-decision ID. No parallel author-management API or
contribution lifecycle was created.

## Verification and limits

The dedicated runner is:

```powershell
node apps/backend/scripts/test-credit-attribution.mjs --env-file D:\lumi-gap\.env --extended
```

It derives `lumigap_credit_attribution_test` from local configuration, uses local Redis
database 13, disables email delivery and applies only forward migrations. It never
resets the application database. Browser QA uses a production bundle on 8098 and a
temporary API on 8097 with synthetic `example.invalid` users.

Detailed final results and file inventory: [verification report](credit-attribution-verification.md).

Remaining policy boundaries:

- Self-declared work, affiliations and external permission notes are not scientific
  or legal certification. Institutions/venues decide applicable authorship policy.
- Existing historical evidence is retained; no retroactive fingerprint is asserted.
- A changed linked artifact conservatively requires renewed review. There is no AI
  estimate of effort or automatic reconciliation of contested work.
- No new external Git proof service, publisher submission portal or electronic
  signature system was introduced.
- Authorship/contribution disputes can require institutional review; the platform
  cannot compel personal approval or prevent independent external submission.
- Test PDF bytes exercise access control only. Actual TeX compilation is provided by
  the existing compiler and is not replaced or falsely certified by this task.
- No production deployment, localhost:8080 update, commit or push is included.
