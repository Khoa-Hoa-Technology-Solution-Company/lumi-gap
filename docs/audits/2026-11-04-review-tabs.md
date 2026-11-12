# Two tabs for screening ballots and discussion

## UI

- “Hai phiếu đánh giá” shows both permitted ballots, rationale and version information directly. Removed the redundant rationale disclosure.
- “Trao đổi” dedicates the workspace to the saved conversation and composer.
- Reassess and request-adjudication actions remain above the tabs, governed by existing capabilities and available from either tab.
- Accessible tabs use linked tab/panel IDs, selected state, roving tabindex, arrow keys and Home/End navigation. Hidden panels leave the accessibility and focus order.
- The conversation stays mounted so tab switching retains draft text and reading position. Hidden discussion disables its query and live subscription; returning to discussion resumes updates. Followers are repositioned after the hidden feed becomes visible.
- Paper modal links with `section=discussion` select the discussion tab through explicit props. Other openings start at the ballots tab.
- Desktop discussion uses remaining height to keep the composer visible; mobile uses normal scrolling.

## Verification

- 93/93 web tests passed across screening-workspace (43), screening-conflict-resolution (32) and screening-discussion (18).
- Includes shared actions, keyboard tabs, hidden panels, safe long rationale rendering, retained chat draft, query activation and the actual modal discussion deep link. Existing request/reassessment and permission cases remain passing.
- Production build passed with TypeScript.
- Browser verified both tabs, retained draft and 390px mobile with actual components using fixture APIs on port 8096. No live project messages were sent.
- Screenshots: `2026-11-04-review-tabs-ballots.png`, `2026-11-04-review-tabs-discussion.png`, `2026-11-04-review-tabs-mobile.png`.
- Published built frontend assets to localhost, keeping previous hashed files for existing tabs. No API, workflow, permission or database changes.
