# Compact two-reviewer discussion workspace

## Changes

- Both reviewers' names and decisions remain visible by default. A single keyboard accessible “Xem căn cứ” toggle reveals both ballots' reasons, versions and source context together. Long reasons retain the bounded preview and full-text dialog.
- Review revision and adjudication actions sit directly above the conversation. Secondary button treatment keeps sending a chat message as the primary interaction. Existing capabilities, dialogs, endpoints and permission checks are retained.
- The chat composer places its send button beside the input and retains keyboard/mobile guidance, growing input and existing send/IME behavior.
- In desktop paper modals with collapsed ballots, the conversation uses remaining column height, keeping the composer visible while the feed scrolls. Expanding ballot context returns to the reading layout. Smaller screens retain the normal scroll layout and full-width review actions.
- Clarification instructions are shorter. Draft chat text survives expanding and collapsing ballots. Blind review restrictions, read-only cases and adjudication locks remain intact.

## Verification

- 91/91 tests passed: screening workspace (43), conflict resolution (30), screening discussion (18). Tests cover accessible disclosure state, action placement, draft retention, blind ballot restrictions, reassessment, adjudication requests and chat behavior.
- Web production build passed, including TypeScript.
- Browser checks used the real paper modal and components with isolated fixture APIs on port 8096, not a signed-in production session. Checked clarification, revision dialog, long reasons, reviewer B, dark mode and mobile 390 × 844. Sent a fixture chat message and verified its appearance and cleared input.
- Screenshots: `2026-11-04-review-compact-desktop.png`, `2026-11-04-review-compact-mobile.png`, `2026-11-04-review-compact-dark-long.png`.
- Published web assets to the existing localhost container, retaining older hashed assets. No backend changes, workflow changes or database migration for this UI task.
