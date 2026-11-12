# Consistent screening decision controls and published ballots

## Changes

- Shared `ScreeningDecisionChoices` presents compact, wrapping native radio options for initial review, pre-publication editing, post-discussion revision, collaborative library assessment, adjudication and legacy finalization.
- Choice colors reuse the screening semantic tone tokens in light and dark themes. Native labels, fieldset legends, keyboard navigation, disabled options and required validation remain available. Options have a minimum 44px height and do not stretch across the form.
- Existing choices, allowed actions, validation, API requests and historical data remain unchanged.
- Published independent ballots show each review once in the team list, with a “Bạn” label on the current reviewer's ballot. The redundant personal summary is omitted when that same review is already in the published team list and cannot be edited independently.
- The personal form and edit action remain available while the other reviewer has not submitted. Inconsistent or incomplete responses that omit the personal review from the team list retain the personal summary.
- Collaborative finalized reviews likewise omit the duplicate personal summary while retaining both reviewers in the shared list.

## Verification

- 114 focused tests passed across screening workspace (47), conflict resolution (32), collaborative library (9), adjudication (26). The workspace suite was rerun after adding the edit-action guard.
- Web production build, TypeScript and bundle budget check passed. Existing chunk-size and Browserslist warnings remain.
- Real component fixture checked on desktop and at 390px width. Confirmed visible selected states, arrow-key navigation, wrapping without horizontal overflow, the disabled current conclusion during revision and no duplicate personal heading after finalization.
- Screenshots use isolated fixture data, without submitting any real review or message.
- Local web build published with the existing backup/publish helper; entry assets checked over HTTP.

## Screenshots

- `2026-11-05-review-choices-desktop.png`
- `2026-11-05-review-choices-mobile.png`
- `2026-11-05-review-choices-revision.png`
- `2026-11-05-published-ballots.png`
