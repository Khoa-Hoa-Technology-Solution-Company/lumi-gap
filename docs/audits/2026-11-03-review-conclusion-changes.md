# Editing ballots versus changing conclusions

## Behavior

- Before the other reviewer submits, the caller can edit the submitted ballot and retain its conclusion; revisions preserve the original.
- Once both reviewers submit, the conflict action is named `Đổi kết luận của tôi`. The current conclusion is disabled and labelled `Hiện tại`; no alternative is selected automatically. Saving requires another conclusion and a written reason.
- Changing to EXCLUDE allows choosing an actual exclusion criterion saved in the round.
- An open edit form becomes unavailable if the peer submits while the user is typing. The draft remains available for copying.
- Backend guards run within the existing transactional Screening command: reassessment cannot retain the current conclusion after another effective reviewer has submitted, and ordinary ballot edits cannot bypass that boundary before unblinding. Finalized/locked-round restrictions and review history are retained.

## Verification

- Web: 60/60 tests passed (`screening-conflict-resolution`, `screening-workspace`), including all three current choices, criterion selection, pre-peer edits and an in-flight edit losing eligibility.
- PostgreSQL: 70/70 persistence tests passed (`screening-case`, `screening-slots`) in the isolated test database. Existing differing-exclusion-reason coverage now verifies rejecting same-conclusion updates and resolving through adjudication.
- Web production build and backend TypeScript emission passed.
- Playwright exercised both A and B at 1280px and 390px with an isolated modal fixture: current choice disabled, written reason alone insufficient, alternative choice enables saving.
- Published web assets/index and the compiled backend service module to localhost. Previous index/backend module backed up; existing hashed assets retained. No application data migration or history deletion.
