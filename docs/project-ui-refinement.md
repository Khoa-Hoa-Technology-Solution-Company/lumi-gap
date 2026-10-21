# Project interface and shared header

The projects index and project detail use Source Sans 3, LumiGap blue, and
the existing semantic theme tokens. Both align to a 1280px content width.
The project workspace uses a 250px project navigator beside the selected
project, with readable 14–22px controls and a 36px project title.

## Shared application header

`apps/web/src/layouts/app-header.css` owns the MainLayout header styling.
Home and application routes use the same 80px floating header, 44px logo,
18px navigation labels and 1280px maximum width. Navigation collapses
below 1280px. On phones the header is 68px tall with a 36px logo.
Home retains its photo hero placement in its own stylesheet.

## Projects

- The index keeps its search, status filter, invitation flow and creation dialog.
- The index opens the most recently updated non-archived project, or the first
  available archived project. Respect explicit links and current filters.
  Wait for invalidated project data before choosing a default after removal.
- Keep a compact project navigator on the left across detail routes. Each real
  link opens that project in the adjacent content area. Show name, stage and
  readable paper/team counts with nouns, a neutral selected background and a small blue icon.
  Omit the repeated Workspace eyebrow and unfiltered results footer. Separate
  the navigator from the content with spacing rather than a vertical rule.
  Avoid oversized project cards and duplicate management introductions.
- Keep the project navigator simple: heading, create action, a white search field
  with a visible border, then the project list. Do not add ownership, status or
  sorting controls to this sidebar unless explicitly requested. Order the list
  by recent updates. Search uses the URL so refresh and a return preserve it.
  Clear obsolete scope, status and sort parameters from workspace URLs while
  keeping the search, selected section and open project.
  Search matches every entered word across name, description and research field,
  regardless of order, whitespace or Vietnamese accents. Show live result counts;
  clearing search restores the list without changing the open project. Empty
  search results stay left aligned and suggest another name or research field.
  Counts use actual data; loading or failure must not invent zero counts.
- Keep creation and incoming invitations in the project navigator. Failed
  creation retains form input. Invitation responses remain explicit.
- Project switching preserves search and the selected section,
  but drops submission IDs and screening filters belonging to the old project.
  Remount project-local forms when the project ID changes.
- Below 768px, replace the left list with a native project selector above the
  content. Offer the entire library even if a desktop filter hides the selected
  project. Avoid a second sidebar with the project's individual sections.
- Public project summary links remain public and do not load a guest's personal
  library. Index authentication and verification gates remain in place.
- Detail pages use a title, settings action and status metadata. The project
  breadcrumb remains on standalone public views and is omitted beside the list.
- Project detail uses horizontal tabs, leaving the full width for research.
  Group navigation into two labeled rows. Research follows Literature, Research
  Gaps, Artifacts, then Submissions. Collaboration follows Chat, Members,
  Contributions, then Academic Support. Keep member management beside contribution
  attribution, and academic mentoring after team work. Each destination opens
  directly with one click; do not hide these pages behind an extra category menu.
  Use a quiet divider and a moving active underline, without an enclosing pill bar.
  All eight sections and their URL parameters are retained. Tabs use Left/Right,
  Home and End keys with roving focus. Overflow stays within the navigation;
  phones and narrow content panels use a labeled grouped select.
- Empty literature starts with the action-oriented heading Add papers to this
  project, left-aligned with project navigation. Search is the primary action;
  saved papers and DOI use secondary rows with visible helper descriptions.
  Screening criteria and a How this library works disclosure sit alongside the
  source actions on wide panels and below them on narrow panels. Show No screening
  criteria yet instead of two zero counters. Explain reading, notes, inclusion
  decisions and reuse of selected evidence in plain task language. Avoid duplicate
  headings, decorative library icons and a large centered welcome stack.
- Use Source Sans 3 and the existing LumiGap blue/navy palette. Surface contrast,
  spacing and hierarchy carry the design; avoid oversized rounded outer frames,
  decorative metrics, tiny text and irrelevant dashboard charts.
- Literature uses restrained color accents: blue for finding papers and DOI
  lookup, muted orange for saved sources and screening criteria, and navy for
  headings. Small source icon surfaces and matching hover/focus states clarify
  the actions. Keep body copy neutral, page surfaces pure white, and dark mode
  accents readable. Do not expand these accents into broad colored blocks.
- Existing literature has one toolbar containing search and a single
  screening-status selector.
  Search covers title, author, year and venue. Default ordering is recently added.
  Keep counts in the heading summary only. Do not repeat status cards, status tabs,
  a progress bar, a sort selector or an advanced filter panel above the papers.
  Full-width paper rows show title, author, venue, publication year and
  screening status. Show evidence and note counts only
  when present. Selecting a row opens a centered reading dialog on desktop and
  a viewport-fitting dialog on phones; fetch its full record only when opened.
  Keep bulk-selection controls separate from opening the reader. The reader
  keeps its paper selected when a screening decision changes the filtered list,
  and closing it restores focus to the row or search when the row disappeared.
- Directory and workspace backgrounds, hovered rows, icons and empty states
  use pure white `#FFFFFF` in light mode, with neutral gray `#F5F5F5` for secondary
  surfaces and hover states. Never introduce cream, ivory, beige or warm white
  backgrounds unless the user explicitly requests them. Keep dark mode surfaces
  dark. Reserve blue for active
  action accents, links and the compact primary action; avoid large blue fills.
  Selected project tabs use a small neutral surface. Use one light divider below
  section navigation; avoid enclosing each content block with horizontal rules.
- On project routes, the shared header uses opaque pure white without tinted
  transparency or backdrop blur in light mode. The directory table header also
  uses pure white, with dividers carrying its hierarchy. Header shadows are
  neutral black rather than colored. Preserve the dark theme overrides.
- Existing permissions, archived read-only behavior and mutations are retained.

Verify both themes, keyboard navigation, and phone layouts when editing these
surfaces. Keep header rules in the shared stylesheet so lazy-loaded page CSS
does not change navigation appearance between routes.

## Follow-up audit

- Reveal selected tabs by scrolling only their horizontal row. Avoid
  `scrollIntoView`, which can move the entire page on short displays.
- Source actions expose their helper descriptions to assistive technology.
- Read-only literature hides source actions and keeps criteria available to view.
- Project and member counts have singular English forms. Failed project
  requests do not present a fabricated zero-workspace count.
- Project navigation animates only the right content area. The project list
  and shared header stay still; links navigate immediately and reduced motion
  skips animation. Project tab/filter updates do not replay the page transition.
- Switching project sections reveals the content with an opacity fade (200 ms)
  and moves the active tab marker (220 ms). Only section changes trigger it;
  initial loading, searches and background refreshes remain stationary. Rapid
  changes cancel the previous animation, reduced motion skips both effects,
  and the mobile section selector uses the same content reveal.
- Loading project details use the loaded workspace's width and header geometry.
  Fetch failures offer retry and a route back to the directory.
- Vietnamese covers gaps, research artifacts, contributions and activity.
  Contribution activity dates follow the selected interface language.
  The contribution form includes Vietnamese CRediT roles and translated
  success/error messages.

## Directory design references

- [NN/g, Data Tables: Four Major User Tasks](https://www.nngroup.com/articles/data-tables/):
  support finding, comparing, opening and acting on records.
- [NN/g, Left-Side Vertical Navigation](https://www.nngroup.com/articles/vertical-nav/):
  vertical navigation supports broad hierarchies but consumes content space.
- [W3C, Tables Tutorial](https://www.w3.org/WAI/tutorials/tables/): use captions,
  row and column headers to preserve data relationships for assistive technology.
