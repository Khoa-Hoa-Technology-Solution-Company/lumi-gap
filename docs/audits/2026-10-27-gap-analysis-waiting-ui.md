# Research gap analysis: waiting experience

## Finding

The worker in `apps/backend/src/modules/gaps/project-gap-discovery.ts` first extracts each source, then synthesizes the comparison, then generates candidate gaps. The old UI showed one spinner and a paper counter below the source selector. Consequently, `3 / 3 papers analyzed` looked finished even while synthesis or generation was still running.

## Changes

- A dedicated progress panel appears above the source selector.
- Three visible stages distinguish source extraction, comparison and candidate generation. Completed stages have check marks; the current stage is numbered and described; future stages are labeled.
- The extraction counter uses the saved analysis total, including when resuming a teammate's run. Its progress bar measures papers only and disappears for comparison/generation. No overall percentage or completion estimate is invented.
- The copy explicitly explains why comparison continues after all papers have been read.
- Sending a request and waiting in the worker queue have different messages. Leaving the page is suggested only after enqueueing has succeeded.
- Removed the duplicated button spinner. The active step has a subtle opacity animation, disabled with reduced motion.
- Starting another analysis hides the previous success notice while the new request is pending. Existing selections and retry behavior are preserved.
- English/Vietnamese strings, responsive vertical steps on mobile, semantic ordered stages, current-step labeling, a live status description and a labeled extraction progress bar.

No changes to workers, persistence, analysis cost, AI prompts or provider requests. This improves visibility of the existing process; it does not shorten inference time.

## Verification

- 21 project discovery unit tests and 12 locale tests passed.
- Scoped ESLint passed.
- Web build/typecheck passed. Existing warnings about chunks larger than 600 kB remain.
- Two Chromium browser tests passed against local web: desktop and mobile with reduced motion. Tests cover extraction counts, comparison at 3/3, generation, completion, reload/resumption, duplicate-action disabling and absence of horizontal overflow. Screenshots inspected in light/dark themes.
- Browser tests mock all API GETs and reject writes, using a synthetic account/project. They neither invoke AI nor spend credits and do not validate live provider latency or real project access.
- Rebuilt and recreated only the local web container. HTTP 200 and deployed `index.html` matches the final build (SHA-256 `a431ad944ae3965ef61cfd013583b1cb54b2897595e80b5d0287eb99d53b3aab`). Both browser tests passed again against that deployment. No commit or push.

Commands:

```powershell
pnpm --filter web test -- src/features/projects/__tests__/project-gap-discovery.test.tsx src/i18n/__tests__/locales.test.ts
pnpm --filter web build
pnpm exec playwright test --config apps/web/playwright.config.ts project-gap-progress.spec.ts
```

Screenshots: [desktop](2026-10-27-gap-progress-desktop.png), [mobile](2026-10-27-gap-progress-mobile.png), [dark](2026-10-27-gap-progress-dark.png).
