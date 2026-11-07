# Saved reviewer discussion after final decisions

- Removed the Screening AI panel and its automatic AI-result query from paper round detail. Existing backend AI data/API are retained.
- Independent finalized rounds now display their existing reviewer conversation below the result. Both reviewers can read messages with author attribution, timestamps and pagination. Hidden-review protection remains in place.
- Completed conversations have no composer, live stream or polling; reopening the paper loads the saved history through the authorized history endpoint. Discussion deep links point to the same section.
- Existing chat was already persisted in Screening audit records. The missing view was caused by a UI predicate limited to unresolved conflicts/collaborative rounds and by no history component in the independent final-result branch.
- Corrected the hidden reviewer-intake message so finalized rounds no longer claim that reviewers can still edit ballots.

Verification:

- 80/80 web tests passed across discussion, round workspace and conflict resolution.
- Targeted PostgreSQL persistence test passed: both reviewers retrieve exactly the same stored messages after consensus; 37 unrelated tests skipped in this targeted run.
- Production web build passed.
- Playwright fixture checks passed for both reviewers, INCLUDED/EXCLUDED results, and 1280px/390px viewports: all saved messages present, no composer or AI panel, no page errors or horizontal overflow.
- Updated localhost web assets and verified index/chunk HTTP 200, matching built index, removed AI panel and deployed saved-discussion copy. No runtime backend or database changes.
