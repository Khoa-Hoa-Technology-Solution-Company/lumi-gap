# LumiGap home redesign

## Direction

Research homepage for students and researchers. Consensus informs the centered
search entry; Readwise Reader informs the clear product explanation and the
progression from one question through a research workflow. The existing logo,
routes, APIs and authentication are retained.

References inspected in the browser on 2026-10-02:

- https://consensus.app/
- https://readwise.io/read

The latest user revision removes the research illustration and personal welcome
from home, adds useful information below the search entry, and aligns the search
composer with the supplied compact two-row reference. Authenticated and guest
home share the discovery sections.

## Prior home audit

- Competing actions, repeated card grids and technical pipeline copy weakened
  the search entry.
- The user rejected the project, attention, recommended-paper and community
  activity lists, including their empty states. Those lists remain removed.
- The centered search composition remains; its illustration, greeting and old
  shortcut row are removed in the latest revision.

## Search entry

- Authenticated home has a centered heading, supporting line and a 672px search
  composer that follows the supplied Search-page reference. It no longer
  fetches the current user for a greeting.
- The composer has a single-line search field with a gradient `Search` button.
  Enter submits; an IME composition is allowed to finish before submission.
- The second row contains Filters, paper Type and Source on the left, with
  Semantic/Keyword mode and AI Rerank on the right. Filters still open inline
  for publication range and open access; closing retains choices and Reset
  clears them.
- The composer passes the existing `q`, `mode`, `provider`, repeated `type`,
  `yearFrom`, `yearTo`, `openAccess` and opt-in `rerank` parameters to search.
  AI Rerank is enabled for the authenticated entry and is disabled for guests
  with an accessible sign-in hint.
- Four topic suggestions match the reference: Medicine, Deep Learning,
  Carbon Nanotubes and Economics. Clicking one fills and focuses the field.
- Guest home uses the same working compact composer below its centered hero.
  Search remains usable while library data loads or fails.

## October 3: dedicated literature results route

Search results now have their own `/literature` route. Home stays focused on
the research entry and discovery content; `/home?q=...` and the retired
`/search?q=...` URLs redirect to `/literature` while preserving the complete
query string and hash. The API itself returns the Medicine papers on the new
page for both guest and authenticated users.

- Semantic queries call `/api/v1/search`; keyword queries and year-only library
  links call `/api/v1/papers`. Provider, type, publication years, open access,
  taxonomy scope, relevance floor and opt-in reranking are passed to the API.
- Results include real paper links, metadata, signed-in bookmark/project
  actions, sorting and server pagination. Loading, empty, error/retry and
  rerank sign-in states are visible. New searches reset pagination.
- Composer controls restore from the URL, including custom year ranges, and
  synchronize on navigation. Trend scope is retained when editing the query.
- Requests use AbortSignal; changing a query cancels the old request and its
  result cannot replace the current search. The default Home does not import the paper/action result modules; they load with
  the dedicated literature page.
- Verified with 31 frontend Home/literature tests, TypeScript, targeted ESLint and a
  production build. Live browser checks show Medicine with 5 semantic results
  and 126 keyword results, including page 2 of 13. Reload and 320px reflow were
  checked; the mobile document has no horizontal overflow.
- Paper keywords support both the API's string list and structured keyword
  records, removing empty/duplicate entries that caused React key warnings.
- Screenshots: `artifacts/home-redesign/home-search-medicine-desktop.png` and
  `artifacts/home-redesign/home-search-medicine-mobile.png`.

## Discovery sections

1. **Research workflow:** three keyboard-accessible tabs explain discovering
   literature, connecting evidence and exploring candidate research gaps.
   Each includes concrete capabilities, a short diagram and a working route.
2. **Library insights:** `useHomeOverview()` supplies actual indexed-library
   data. Users switch between publications and citations, select one of the
   last six publication years, and open search with that year range. The
   current year is labelled incomplete. Loading, error/retry and empty states
   are contained within the chart.
3. **Research tools:** paper review, format checking, reports and communities
   are explained through links to the existing tools.
4. **FAQ:** native expandable answers explain search modes, library chart
   coverage, candidate gaps and collaboration.

These sections explain useful capabilities rather than displaying invented
testimonials, partnerships, user counts or outcome metrics.

## Visual and motion rules

- Existing self-hosted Source Sans 3, tinted paper surfaces and LumiGap blue.
  Semantic OKLCH tokens in `features/home/home.css` apply only to home.
- Compact composer width is 672px, with a 24px outer radius and a 32px search
  button. The input and toolbar collapse into comfortable rows below 620px.
- Discovery layouts stack below 768px. Search controls remain usable at 320px;
  the mobile composer has no horizontal overflow.
- IntersectionObserver reveals sections once during scrolling. Chart bars
  grow from their baseline; workflow diagrams animate when changing tabs.
  Buttons, links and FAQ arrows provide restrained feedback.
- Keyboard focus immediately reveals its section. Content remains visible
  when IntersectionObserver is unavailable.
- Reduced-motion preference disables animations and transitions, including
  when that preference changes while the page is open.
- Workflow tabs support ArrowLeft, ArrowRight, Home and End. Every tab keeps
  its associated panel in the DOM; only the active panel mounts its content.

## Retired artwork

`apps/web/src/assets/home/research-orbit.png` and its optimized WebP remain on
disk as previous design assets. Neither home page imports or renders them.

## Verification

- Production build, TypeScript and bundle budget pass. Initial JS graph is
  864.8 KiB against the repository's 900 KiB budget.
- Thirty-one focused Home/literature tests pass, covering route redirects, direct
  result loading, submit and Back navigation, filters, AI reranking, keyboard
  behavior, workflow tabs, chart data and library empty/error states.
- Seven focused locale tests pass, with one unrelated skipped locale case. The
  global static-copy coverage test is excluded from this focused run.
- Targeted ESLint passes for the changed home components and locale files.
- Desktop and 320px mobile views inspected in light and dark themes. English
  and Vietnamese text, compact search controls, workflow keyboard navigation,
  chart controls and FAQ expansion were checked. In live data, selecting
  citations for 2023 shows 10,998 and carries the selected year back to the
  literature results at `/literature?yearFrom=2023&yearTo=2023`.
- Current screenshots are saved as `compact-search-*`, `discovery-home-*` and
  `literature-results-medicine.png` in `artifacts/home-redesign/`. Authenticated-entry visual QA uses an
  isolated render of the actual `ResearchEntry` and `MainLayout` without
  changing the browser login. Temporary preview files are removed after
  verification.

The build and bundle checks establish compilation and payload limits; they are
not measured Core Web Vitals or Lighthouse performance results.

## October 3: reading and chapter navigation

- Added sticky chapter links for workflow, reading, landscape and toolkit.
  IntersectionObserver updates the active chapter; anchor links scroll to the
  section and the closing action returns focus to the search field.
- Added an interactive reading lens with three prompts: frame the question,
  inspect the evidence and identify a limitation. Each selection changes the
  highlighted passage and annotation. The note is explicitly labelled as an
  example workflow, not a published-paper summary.
- Workflow diagrams now have a stage number, contextual header and connected
  footer. Added restrained selection, arrow, search-focus and closing-action
  effects, with reduced-motion support.
- New layouts were checked at 320px, 390px and 980px in the live browser. The
  reading layout stacks on mobile and remains legible in both themes.
- Saved live screenshots: `reading-lens-desktop.jpg` and
  `reading-lens-dark.jpg` under `artifacts/home-redesign/`.
