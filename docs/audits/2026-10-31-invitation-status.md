# Project invitation status and owner permissions

## Diagnosis

Read-only inspection of the reported local project found two distinct recipient
accounts with similar names. One invitation was accepted and has an active
membership; the other remains pending and has no membership. No accounts were
merged and no real invitation was accepted, cancelled or rewritten during this
investigation.

A separate navigation bug made this confusing: `project_invitation` notifications
opened `/projects`, whose landing route automatically selects the most recent
project. Opening a notification therefore appeared to join a project, even though
it never submitted an invitation response.

## Changes

- Invitation notifications open `/projects?view=invitations`. This view bypasses
  automatic project selection and presents explicit accept/decline actions.
- Incoming invitation cards identify the recipient email, supplied only by the
  authenticated recipient endpoint. Empty, loading and retry states are included.
- Acceptance/decline refreshes the corresponding project, team and inbox caches,
  including responses from email token links.
- Team lists refresh every 10 seconds while pending invitations exist, pause in
  background tabs and refresh on window focus. Polling stops when none remain.
- The invitation form independently checks the authenticated user against the
  project's owner ID. Its search and submit handlers are also guarded. Regular
  members see an explanation of the owner-only invitation policy.
- The backend's existing transactional `MANAGE_MEMBERS` authorization remains the
  source of truth for invite, resend, cancel and the legacy add-member endpoint.
  Being a Lecturer does not grant those permissions.
- Added Vietnamese copy for the incoming invitation flow.

## Verification

- 107 frontend tests passed across navigation, notifications, invitation actions,
  settings and real TanStack Query cache/polling behavior.
- Four PostgreSQL persistence tests passed in the separate local
  `lumigap_mentor_access_v1_test` database. Covered separate accounts, correct
  recipient identity, concurrent acceptance, disappearance from pending lists,
  and denied member/Lecturer invitation management.
- Shared types build, web TypeScript, backend TypeScript, backend compilation,
  targeted ESLint and production web build passed.
- Browser fixture verified recipient email and explicit consent with synthetic
  data; screenshot: `2026-10-31-invitation-inbox.png`. The live user tab was at the
  login screen, so no live-account invitation was submitted through the browser.
- Updated local web/backend containers; both port 8080 and backend `/ready`
  returned HTTP 200. No database migration was needed for this change.

Focused persistence command:

```powershell
node apps/backend/scripts/test-mentor-access.mjs --project-invitations
```

The runner derives a separate local test database and disables email delivery.
It must not be redirected to the application database.
