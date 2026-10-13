# Project interface and shared header

The projects index and project detail use Source Sans 3, LumiGap blue, and
the existing semantic theme tokens. Both align to a 1280px content width,
with 40px desktop titles and readable 15–18px controls and metadata.

## Shared application header

`apps/web/src/layouts/app-header.css` owns the MainLayout header styling.
Home and application routes use the same 80px floating header, 44px logo,
18px navigation labels and 1280px maximum width. Navigation collapses
below 1280px. On phones the header is 68px tall with a 36px logo.
Home retains its photo hero placement in its own stylesheet.

## Projects

- The index keeps its search, status filter, invitation flow and creation dialog.
- The index uses project dockets rather than a sparse six-column table.
  Each docket separates project identity and an open-workspace action from
  its paper/member inventory. Empty descriptions offer a useful starting point.
  Dates follow the interface language. Counts use actual project data.
- Search and status filters sit in a lightly tinted toolbar. A literature
  shortcut below the collection connects discovery with project work.
- Smaller screens move inventory below each project and retain count labels.
- Detail pages use a breadcrumb, title, settings action and status metadata.
- Project detail uses horizontal tabs, leaving the full width for research.
  All eight sections and their URL parameters are retained. Tabs use Left/Right,
  Home and End keys with roving focus. Overflow stays within the navigation;
  phones use a labeled grouped select. No vertical workspace sidebar.
- Empty literature pairs a readable introduction with three distinct source
  actions: search, saved papers and DOI. A horizontal workflow strip explains
  collection, screening and synthesis. Screening criteria remain directly below.
- Use Source Sans 3 and the existing LumiGap blue/navy palette. Surface contrast,
  spacing and hierarchy carry the design; avoid oversized rounded outer frames,
  decorative metrics, tiny text and irrelevant dashboard charts.
- Existing permissions, archived read-only behavior and mutations are retained.

Verify both themes, keyboard navigation, and phone layouts when editing these
surfaces. Keep header rules in the shared stylesheet so lazy-loaded page CSS
does not change navigation appearance between routes.

## Follow-up audit

- Reveal selected tabs by scrolling only their horizontal row. Avoid
  `scrollIntoView`, which can move the entire page on short displays.
- Source actions expose their helper descriptions to assistive technology.
- Read-only literature uses one content column when source actions are absent.
- Project and member counts have singular English forms. Failed project
  requests do not present a fabricated zero-workspace count.
- Vietnamese covers gaps, research artifacts, contributions and activity.
  Contribution activity dates follow the selected interface language.
  The contribution form includes Vietnamese CRediT roles and translated
  success/error messages.
