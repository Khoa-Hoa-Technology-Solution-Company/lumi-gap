# Mentor chat, participant profiles and personal tasks

## Changes

- Participant popup rows link to the existing public academic profile route in a new tab, with `noopener noreferrer`, keyboard focus and an explicit accessible label.
- Mentor navigation reuses `ProjectSectionNav`, restricted to overview, tasks and chat. Keyboard navigation and the mobile selector operate on the permitted sections only.
- Mentor chat uses the same heading, channel label and conversation components as the member workspace. Internal team and AI channels remain unavailable to scoped mentors.
- `/projects/:projectId?tab=tasks` opens the mentor's personal task workspace, with the existing status vocabulary and assigned adjudication tasks.
- Added authenticated `GET /projects/:id/mentor-access/tasks`, with existing parameter/query validation, pagination and private/no-store caching.
- The backend resolves the authenticated user and project, verifies live accepted mentorship, and filters tasks by both project and assignee. Deleted, unassigned, other people's and other projects' tasks are excluded. Client-supplied assignee filters are rejected.
- Direct assignment allows the mentor to read their own task summary; TASKS_VIEW still governs shared project resources. Submission links additionally require SUBMISSIONS_VIEW, and the existing submission endpoint continues checking access.
- The task view is a read projection. Existing workflows update statuses; it does not grant project administration or create/edit permissions. No migration or historical data changes.

## Verification

- Web: 93 tests passed across mentor entry, conversation, academic mentor page, navigation and workspace coordination; the final scoped rerun passed all 40 mentor tests.
- PostgreSQL: all 28 mentor access tests passed, including task scope, canonical/legacy project URLs, permission revocation, HTTP authentication, invalid queries and no-store caching.
- Shared types build, backend production TypeScript compilation and web production build passed.
- Published the three changed backend modules and web assets on localhost, preserving deployment backups. Served web entry matches build and all eight entry assets return HTTP 200.
- Browser verified the real demo mentor's shared chat/navigation, participant profile links, and personal tasks at the supplied legacy project URL. This mentor currently has no assigned project or adjudication tasks, so the honest empty state is displayed.

## Screenshots

- [Participant profile links](2026-11-05-mentor-participant-profile-links.png)
- [Mentor personal tasks](2026-11-05-mentor-own-tasks.png)
