# Mentor conversation as messaging

## Changes

- Both the member's mentor channel and the mentor's project workspace now render the same message thread, using the existing ProjectChatMessage, ProjectChatComposer and chat scroll hook.
- Own messages align right; others align left with author/time and day separators. Replies retain the existing replyToId, with a compact quote preview. Long content wraps inside the bubble.
- Replace the feedback form, CRediT picker and repeated explanatory blocks with a compact message composer and Send action. Enter sends on desktop, Shift+Enter inserts a line break, IME composition does not send, and touch devices keep multiline entry.
- Preserve the existing 5,000-character mentor message limit, backend validation, persistent feedback records, permissions, attribution, draft protection and idempotent retries. The shared composer retains its original 2,000-character default for other chat surfaces.
- Load older message pages above the conversation, deduplicate IDs, display chronological order and preserve scroll position. Refresh from the authorized API every five seconds. Readers away from the end get a new-message affordance.
- Retain formal feedback, agreement and contribution workflows in the existing shared-resources view. Conversation presentation does not delete or rewrite historical data.
- The single available mentor no longer requires a selector; multiple relationships still have an explicit selector. Participant details remain available in a compact disclosure.

## Verification

- 48/48 tests passed across mentor conversation (16), mentor project entry (7), general project chat usability (13), and academic mentor resources (12).
- Covered both author alignments, chronology, reply submission, pagination/deduplication, incoming refresh, short messages, IME, failed drafts, revoked permissions, deep links and existing resource workflows.
- Production web build and TypeScript passed, with existing Browserslist/chunk warnings. Scoped diff whitespace check passed.
- Published final web entry assets/index-Cfr48jLR.js to localhost; served index matched the build and all eight initial assets returned 200.
- Live mentor URL verified with participant disclosure, empty message history and compact composer. Desktop and 390px mobile checked; no mobile horizontal overflow. Restored viewport.
- No real project messages were posted during verification. Message send/reply behavior was checked by automated tests against the existing API contract. Backend persistence and permission logic were unchanged in this task.

Screenshots: [desktop](2026-11-05-mentor-messages-desktop.png), [mobile](2026-11-05-mentor-messages-mobile.png).
