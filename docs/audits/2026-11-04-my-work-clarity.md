# My Work card clarity — 2026-11-04

## Findings

The supplied screenshot repeats each task in a status badge, a colored callout, a footer badge and an action label. A dropdown repeats the quick filters. Long author lists compete with paper titles. Public ballots occupy nested boxes even before the reader needs them. A statement task inherits clarification wording from the underlying round.

## Changes

- One category button group replaces the duplicated dropdown and quick filters. Categories use task kinds and protocol classification, including automatic obligations. A selected empty category retains its reset button after refresh.
- Cards retain one status badge and a plain next-step instruction. The title is prominent; author and publication metadata are secondary. More than two authors expand through a native disclosure.
- Disclosed reviewer ballots expand on demand. Hidden ballots remain absent. Instructions distinguish clarification, binary conflict, exclusion-reason mismatch, statements and assigned adjudication.
- The footer groups submitted counts, the segmented progress bar, backend deadline and primary action. Extend/release remain available under existing permissions. Mobile stacks the primary action across the card width.
- Evaluated cards use the same shell and preserve separate personal and group results. No API, persistence, permission or workflow changes.

## Verification

- Targeted Vitest run: **101 passed, 8 suites**. Includes claims, expiry, extension/release, privacy, automatic task filtering, clarification, statement priority, metadata disclosures, independent counters, filter reset after completion, case navigation and shared task views.
- `pnpm build`: TypeScript and production build with bundle budget checks passed.
- CUA: desktop, dark mode and 390px mobile; category filters, long-author disclosure and public-ballot disclosure operated successfully. Mobile document width 375px within a 390px viewport, with full-width primary actions. Evaluated cards also fit without horizontal overflow.
- Frontend published to the existing localhost web container, preserving older hashed assets. Served index matched the build; all 8 entry assets returned HTTP 200.
- Browser verification uses the actual components with fixture API data. The private Project session is signed out; authenticated live Project interactions were not verified in this pass.

## Evidence

- [Desktop](2026-11-04-my-work-clarity-desktop.png)
- [Mobile](2026-11-04-my-work-clarity-mobile.png)
- [Dark](2026-11-04-my-work-clarity-dark.png)

No automatic commit or push. Existing unrelated workspace edits preserved.
