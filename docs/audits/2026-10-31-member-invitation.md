# Project member invitation entry point

## Findings and changes

The members tab already supported consent-based invitations, but its action was labelled “Mời cộng tác” inside the members card and was absent from the project settings subtab. The invitation form also required choosing between project membership and mentorship before entering a recipient.

- Extracted the existing invitation form into `project-member-invite.tsx`.
- Added a single “Mời thành viên” action to the team page header, available on both People and Project settings. The action remains available when the separate team list request fails.
- Removed the member/mentor selector. The member form directly accepts an email or an existing account selected from search. A separate link leads to Academic Support for lecturer invitations.
- Preserved pending invitation, resend, cancellation, acceptance, ownership and archived-project rules. The server remains the authority; nobody is added until accepting.
- Prevented duplicate submission and mentor-link navigation during an active send. Closing/reopening clears an old form error; a failed send preserves the current recipient.
- No API, schema, database migration or existing membership changes were needed.

## Executed checks

- Web: 25 tests passed across `project-members-tab`, `project-team-settings`, `project-settings-forms`.
- Backend: 15 validation/authorization rule tests passed across `project-workspace.schema`, `project-workspace.rules`. These are unit tests, not a new persistence integration run.
- Web TypeScript and scoped ESLint passed.

The web production build passed and was deployed to the existing local web container at port 8080. No migration or backend restart was needed.

Browser: the actual project's existing action was inspected read-only before deployment. Its login session subsequently expired. Post-change interaction was verified in an isolated visual fixture that blocks all real API requests: the header action opens the member form, a simulated send creates a pending invitation, and the members list remains unchanged. Screenshots: `2026-10-31-member-invitation-desktop.png` and `2026-10-31-member-invitation-dialog.png`. No invitation was sent from the actual project. This is not a claim of a new end-to-end email or multi-user persistence test.
