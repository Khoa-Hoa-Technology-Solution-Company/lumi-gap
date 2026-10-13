# Submissions in the project workspace

Submissions already require a project. The primary entry point is now the
**Submissions** section of each project's research workspace, after Artifacts.
The separate header menu entry has been removed.

## Navigation

- List: `/projects/:id?tab=submissions`
- Create: `/projects/:id?tab=submissions&submission=new`
- Detail: `/projects/:id?tab=submissions&submission=:submissionId`

Creation fixes the project and opens the resulting manuscript in the same
workspace. Back and Cancel return to that project's list. Switching project
sections clears the selected manuscript. Existing standalone submission URLs
remain available for saved links and reviewer access.

## Access and data

The API accepts an optional validated `projectId` on submission list and detail.
It resolves both UUID and legacy project IDs, then verifies ownership, active
membership or existing review-management permission. A scoped list includes the
project's submissions regardless of which member created them, with the existing
100-record limit. Without a project scope, the personal author filter is retained.
A scoped detail rejects manuscripts from other projects. Revision/history queries
start after the scoped detail is loaded.

Public project summaries do not render the section. Embedded workflows retain
email verification. Archived projects have no creation or revision actions, and
the creation API rejects them before persisting a file. Existing manuscript
revision, review-request, AI pre-review and history permissions remain in effect.

## Verification

Targeted frontend and backend tests cover project scoping, legacy IDs, outsider
access, archived creation, fixed creation payload, navigation and verification.
Browser checks use read-only navigation and form opening; no real manuscript is
created, uploaded or submitted for review.
