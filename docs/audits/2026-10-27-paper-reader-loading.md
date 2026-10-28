# Project paper reader loading

Scope: opening a paper from a project's Literature (`tab=papers`) list.

## Findings and changes

- The reader rendered loading skeletons above the actual summary, empty abstract text and notes. Removing the skeletons when the detail request completed shifted the content and replaced individual fields. Render one loading layout, then reveal the complete reader body after that request settles. Keep an accessible dialog title and loading status, and preserve the existing summary fallback on failure.
- The shared dialog applied slide and zoom entrance animations; the reader also transitioned all CSS properties. Disable those entrance animations for this reader and limit its transition to shadow. Reserve scrollbar space to prevent horizontal text movement.
- All reader labels now translate during React rendering. Exclude the reader from deferred DOM translation so publication titles, abstracts and other research content are not rewritten after paint. Translate the DOI tooltip explicitly.
- Mount the AI analysis panel only when its tab is selected. Opening the overview no longer starts an unused analysis fetch or polling in a hidden tab.

## Verification

- Literature flow and DOM translation: 30 tests passed, including slow-load and failed-load reader regressions.
- Web production build and typecheck passed.
- Scoped ESLint passed with four existing unused-symbol warnings in the literature component; whitespace checks passed.
- Browser coverage uses GET-only isolated fixtures for delayed loading, cached reopening, switching papers, analysis-tab fetching, error fallback and mobile overflow. No real data writes or AI analysis commands are sent.
- Playwright: 2 passed at 1440 × 1000 and 390 × 844 (mobile with reduced motion). Confirmed the reader's computed animation is `none` in both cases. Screenshots are saved as `reader-loading.png` and `reader-ready.png` under `apps/web/test-results/browser/project-paper-reader-*/`.
- Rebuilt the local web image and deployed it to port 8080.
