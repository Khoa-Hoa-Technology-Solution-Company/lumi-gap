# Shared chat entry for mentors and members

- Mentor chat previously used a separate project overview shell while members entered through ProjectDiscussionPanel. Both now use ProjectDiscussionPanel, the same channel container, MentorAccessWorkspace and persisted message thread.
- Mentor navigation explicitly exposes Trò chuyện nhóm. Chat opens directly with its channel bar, participant disclosure, message history and composer; the unrelated overview header is omitted on this surface.
- Mentor mode permits only the shared mentor channel. Direct internal team/AI channel query parameters still render scoped mentor chat; they do not mount internal team/AI components.
- Member channel permissions and existing shared-resource workflows remain unchanged.

## Verification

- 50/50 web tests passed across mentor entry (8), mentor conversation (17), general chat usability (13), and academic mentor resources (12).
- 27/27 PostgreSQL mentor access tests passed. Added a regression proving canonical UUID and legacy project URLs read the same persisted messages and replies for mentor and member actors.
- Web build/TypeScript and scoped diff whitespace check passed. Existing Browserslist/chunk-size warnings remain.
- Published web entry assets/index-BQDHIsVb.js. Served index matches the build; all eight initial assets return 200.
- Live mentor sign-in: verified the exact canonical URL from the screenshot, the Trò chuyện nhóm navigation action, the channel bar and message composer. Navigated overview to chat successfully. Checked 390px mobile without horizontal overflow and restored viewport.
- No real chat messages were sent. Sending, replies and cross-role history are covered by isolated automated tests.

Screenshots: [desktop](2026-11-05-mentor-unified-chat-desktop.png), [mobile](2026-11-05-mentor-unified-chat-mobile.png).

The member screenshot supplied for this task shows the prior feedback form. Already-open tabs need a refresh to load the newly published shared message component.
