# Mentor project entry and private team conversation

## Cause

The project route used the member-only project detail endpoint. Accepted mentors have scoped mentorship access rather than project membership, so this endpoint correctly returned 404 while the UI never attempted the existing mentor workspace endpoint. The affected demo mentorship also had an effective policy with no chat permission.

## Implementation

- Fall back to the actor-scoped mentor workspace after member detail returns 403/404. Keep outsiders, expired policies and revoked access unavailable.
- Add a simple mentor project shell with project information and a private team conversation. The existing academic-support route uses the same shell; explicitly shared resources remain available through its resources view.
- Return basic information and active member names/roles. Use only the mentorship/public summary, never the private project description, plan or member email addresses.
- Reuse persistent mentor feedback messages and existing access checks, attribution, retries and draft protection. Conversation mode omits agreements, access configuration and unrelated resource controls.
- Enable only MENTOR_CHAT on the accepted local demo mentor policy through the existing owner configuration service, preserving the policy's other settings and audit trail. This does not add project membership.
- No schema change or migration.

## Verification

- Web: 49/49 tests across mentor entry, conversation, academic mentor page and project navigation suites.
- PostgreSQL: 26/26 mentor-access persistence tests, including mentor/team read and write, outsider/cross-project denial and member departure.
- PostgreSQL runtime boundary audit: 4/4 passed.
- Shared types, backend and web builds passed. Existing bundle-size/Browserslist warnings remain.
- Scoped diff whitespace check passed.
- Published the changed mentor access service and the built web bundle to localhost; retained deployment backups and existing hashed assets. Served index matches the build and all eight entry assets return 200.
- Health, readiness and localhost root return 200.
- Signed in as the accepted demo mentor and opened the originally failing project chat URL. Confirmed project title, working navigation, message composer and five participants (mentor plus four active team members).
- Confirmed basic overview and active team roster. The actual project has no published summary, so the UI shows its explanatory empty state.
- Visually checked desktop and 390px mobile layouts; mobile has no horizontal overflow. Restored the normal browser viewport.
- No test messages were posted to the real conversation; persistence and send behavior were exercised in automated tests.

Screenshots: [desktop](2026-11-05-mentor-project-chat.png), [mobile](2026-11-05-mentor-project-mobile.png).

## Limits

Private team content remains governed by its existing permissions. Existing mentorships without MENTOR_CHAT still require an explicit permission grant. No commit or push was performed.
