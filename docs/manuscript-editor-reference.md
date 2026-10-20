# Manuscript editor: reference and reuse

## Reference review (2026-10-19)

The requested reference is Overleaf's three-pane writing workspace: files and
outline, source editor, and compiled PDF. LumiGap implements this layout on its
existing manuscript APIs, PostgreSQL persistence, Yjs binding, and isolated compiler.

Reviewed public upstream sources:

- [Overleaf repository and Community Edition architecture](https://github.com/overleaf/overleaf)
- [Overleaf license, GNU AGPL version 3](https://github.com/overleaf/overleaf/blob/main/LICENSE)
- [Source editor entry component](https://github.com/overleaf/overleaf/blob/e039ad26c5bf5422eb57b89fc7e57c75055e631d/services/web/frontend/js/features/source-editor/components/codemirror-editor.tsx)
- [Community Edition deployment dependencies](https://github.com/overleaf/overleaf/blob/main/docker-compose.yml)

Overleaf is an application with its own service contracts and MongoDB deployment,
not a drop-in React editor. Its source is AGPL-3.0 licensed. No Overleaf source,
styles, assets, logo, or branding were copied or vendored into LumiGap. The public
source was inspected to assess integration; the workspace changes are implemented
against LumiGap's existing components. Importing upstream code later would require
reviewing the particular files' licenses and satisfying the applicable obligations.

## Libraries reused

No new dependencies were installed. Existing installed dependencies supply:

| Library | License | Used for |
| --- | --- | --- |
| CodeMirror 6 | MIT | Source, selection edits, LaTeX highlighting and file search |
| Yjs | MIT | Live source, presence, collaborative persistence |
| y-codemirror.next | MIT | CodeMirror/Yjs integration and local undo/redo |
| PDF.js (`pdfjs-dist`) | Apache-2.0 | Private canvas rendering, pages and zoom |

License files remain in the corresponding installed packages. The editor does not
add a public sharing path or bypass existing manuscript authorization.

## Workspace behavior

A team writes at a laptop or desktop in normal room lighting: the source and paper
stay readable on light surfaces, while compact dark controls frame the document.
The application header is omitted only on a manuscript editor route; the project
breadcrumb and back link remain available.

- Resize or collapse panes; choose source/PDF or focused writing from Layout.
- Open files in tabs. Closing a tab never deletes its source or pending edits.
- The selected `.tex` file's outline follows live Yjs text. Headings navigate to
  source lines. This is a lightweight navigation aid, not a TeX parser.
- Formatting buttons insert real LaTeX through CodeMirror and its Yjs binding.
  They are enabled only for writable `.tex`/`.sty` files. BibTeX/plain text retain
  undo, comments and search without offering LaTeX formatting or completions.
- Search uses CodeMirror's built-in file search. Immutable snapshots support search
  and outline navigation without allowing edits.
- Compile uses the existing snapshot/queue/compiler pipeline. Source sync and PDF
  status are separate. A failed or timed-out compile preserves the prior PDF.
  Wall-clock timeouts propagate as a structured `TIMED_OUT` result from the
  isolated compiler through persistence to the UI, and can be retried.
- Mobile switches between Files, Editor and Preview without losing editor state.
- Reopening a resized pane preserves the source editor's minimum width allocation.

Visual editing, public sharing and source/PDF synchronization are not implemented
by this change, so controls for those features are not shown.

## Currency and remaining gaps (audit: 2026-10-19)

The official [6.x release notes](https://docs.overleaf.com/on-premises/release-notes/release-notes-6.x.x)
list Overleaf 6.3.1, released 2026-10-15. LumiGap has **not** installed or imported
that application release. Its manuscript editor reuses the libraries above.

Overleaf offers [TeX Live 2026](https://www.overleaf.com/blog/tex-live-2026-is-now-available).
LumiGap's compiler still uses Debian bookworm's TeX Live 2022, so it must not be
described as the latest TeX toolchain. A toolchain upgrade needs template, font,
output and isolation regression testing; existing projects should retain a known
compiler version. The existing runtime was not silently switched during this audit.

| Area | Current LumiGap limitation |
| --- | --- |
| Toolchain | TeX Live 2022; pdfLaTeX/XeLaTeX and BibTeX; no LuaLaTeX/Biber or per-project TeX Live version selection |
| Source formats | `.tex`, `.bib`, `.txt`, `.sty`; no custom `.cls`/`.bst`, PDF figure upload or ZIP project import |
| Editing | Source editing; no visual editor, SyncTeX or project-wide search |
| Navigation | Lightweight outline for the selected file, not a complete project TeX parser |
| Offline recovery | Pending edits stay in tab memory; no durable IndexedDB recovery after browser termination |
| Compiler status | Configuration availability is advertised; actual compiler outages surface through job errors, not a live availability probe |

These are remaining product capabilities, not controls with mock behavior.

## Verification

- 24 targeted frontend tests pass: manuscript workspace, LaTeX commands/Yjs undo, outline,
  readonly commands, compiler states and private PDF rendering/navigation/zoom.
- Nine real compiler tests cover IEEE conference/science packages, multi-file/BibTeX/image output, Vietnamese,
  diagnostics, isolation, HTTP timeout reporting and recovery after timeout.
- 28 backend tests pass against disposable PostgreSQL/Redis/compiler resources,
  covering HTTP/queue/PDF persistence, duplicate requests, errors, timeout response
  mapping/retry, legacy accounts, private snapshots and permission revocation.
  The adapter timeout test supplies the structured internal response; the Python
  HTTP test above runs a real sandboxed TeX timeout with a shortened test budget.
- PostgreSQL runtime boundary: four tests pass. Backend build passes.
- Frontend TypeScript/production build and targeted ESLint pass.
- Disposable PostgreSQL/Redis/compiler fixture: opened a section file, inserted
  a real section, observed the outline update, navigated to a heading, searched,
  compiled a real PDF, zoomed, reloaded persisted source/PDF, and exercised focus
  layout and comments. No user research data was changed for these checks.
- Tested a 390 × 844 viewport: editor/preview switches preserve state and the
  document does not overflow horizontally.
- Audit browser check: opening `references.bib` disables LaTeX formatting while
  retaining undo/search; hiding Files, growing PDF to 46%, and reopening Files
  at 30% restores PDF to 36% so editor space is retained.

Screenshots use the disposable fixture, not real team content:

- [Desktop](assets/manuscript-editor/desktop.png)
- [Mobile](assets/manuscript-editor/mobile.png)
- [Audit: BibTeX and reopened panels](assets/manuscript-editor/audit-bibtex.png)

## Follow-up audit: downloaded upstream and actual manuscript

The public repository was downloaded with a shallow sparse clone on 2026-10-19.
The checked-out `main` commit is
[`e039ad26c5bf5422eb57b89fc7e57c75055e631d`](https://github.com/overleaf/overleaf/commit/e039ad26c5bf5422eb57b89fc7e57c75055e631d).
It is a reference checkout in ignored local audit storage, not an installed
Overleaf release or copied application code. The published 6.3.1 release and this
public branch must not be treated as identical distributions.

Inspected the CodeMirror editor, `history-ot.ts`, PDF.js preview, history file-diff
helpers, and CLSI's `LatexRunner.js` / `CompileManager.js`. Upstream uses its own
OT/document/history contracts, latexmk orchestration, SyncTeX, additional engines
and bibliography tooling. LumiGap retains its PostgreSQL/Yjs contracts and
isolated compiler. Similar layout and shared underlying libraries do not imply
full Overleaf feature parity.

Fixed during this audit:

- Added `texlive-publishers` and `texlive-science`; the compiler now passes an
  IEEEtran conference fixture with all packages used by the inspected manuscript,
  an algorithm and IEEEtran-style BibTeX.
- Kept each open file's local Yjs undo manager across CodeMirror remounts. Undo
  preserves remote edits and survives switching files or renaming a file while
  its provider remains open. This is session history, not durable undo storage.
- Kept selection comments bound to their original file when the author changes
  files before posting. Verified the real UI opens the original file and resolves
  its collaborative anchor after saving.
- Retained failed reply text and its request key for retry; prevented duplicate
  submission while the reply is pending. Text clears only after success.
- Compile actions reuse a saved snapshot with identical source version and
  manifest. Concurrent team requests and recompilation at the 100-version limit
  are covered by PostgreSQL tests. Explicit manual versions stay separate.
- Matched source/snapshot language handling for LaTeX, BibTeX and plain text.

### Inspected user manuscript

The requested manuscript `test` contains one substantive `main.tex` and default
supporting files. Its earlier compiler failure was missing `IEEEtran.cls`.
After rebuilding the compiler and recreating local services, compiling its
unchanged version 2 now reaches `main.tex:46` and reports missing
`IoT_Components.jpg`. It still has no successful PDF.

The source refers to 25 absent image/PDF assets and 12 absent bibliography files
(`references1.bib` through `references12.bib`). Searches by the document title,
course/class and distinctive diagram names found no verifiable matching public
source bundle. Similar pet-feeder projects are not evidence for the original
figures or citations. No substitute images or invented references were inserted.
PDF figure upload and filenames containing spaces/parentheses also require
additional file-format/path support before this original source bundle can be
used without adaptation. The compiler must not download arbitrary packages or
resources from inside a job.

### Follow-up verification

The counts above total 65 passing checks: 24 frontend, 28 backend, nine compiler,
and four PostgreSQL runtime checks. Shared types, web and backend builds pass;
targeted frontend ESLint passes. The integration suites use disposable databases,
Redis and compiler instances. Local Docker backend/compiler are healthy and
`/ready` returns 200 through both API and web proxy.

Browser checks use synthetic data in an isolated project. They cover switching
files then undoing, real PDF compilation, posting a selected-text comment
while another file is active, replies and resolution, and live source updates
between two separate browser editor connections (the same fixture account). The user's manuscript source stayed unchanged;
only a compilation attempt against its existing snapshot was requested.


Follow-up browser evidence:

- [Comment retained on its original file and resolved](assets/manuscript-editor/audit-comment-anchor.png)
- [PDF after live collaboration](assets/manuscript-editor/audit-collaboration-pdf.png)


## Requested five-fix confirmation

The five fixes above are present in the local runtime. Follow-up checks additionally
reproduced keyboard undo changing Yjs text after write permission was revoked.
LumiGap now guards both keyboard and toolbar Undo/Redo against read-only state,
while retaining history when write permission returns. This guard is needed
because the underlying Yjs undo command does not enforce CodeMirror read-only
state itself. Server authorization remains the persistence boundary.

Added tests using the actual SourceEditor component for switching files/renaming,
retaining remote changes, and read-only Undo/Redo. The workspace regression test
now selects text in the real editor, changes files, submits a comment and asserts
the original file and quote are sent. The latest focused run passes 27 frontend,
28 backend and nine real compiler tests. Frontend production build and targeted
ESLint pass; the updated frontend is installed in local Docker.

## PDF sharpness and demo source repair

The English multi-file demo had eight embedded Type 3 bitmap fonts in its last
successful PDF (source revision 9). Source revision 15 also contained
`\begin{abstract abc}` paired with `\end{abstract}`, which correctly failed LaTeX
compilation. A snapshot preserves that source; a minimal Yjs update corrected
the environment and selected Latin Modern Sans for this demo. Revision 16
compiled successfully through the local queue and Docker worker. `pdffonts`
reports only embedded Type 1 fonts in the resulting PDF.

The compiler includes `cm-super` for scalable legacy T1 fonts and `lmodern` for
new templates. Existing user documents retain their selected font. PDF.js now
renders at least twice the CSS resolution on ordinary displays, with a bounded
16-million-pixel bitmap. Zoom percentages use PDF physical dimensions; fit width
responds to pane resizing. A failed compile explicitly identifies the retained
PDF as the previous successful revision and gives a targeted hint for malformed
abstract environments.

Verification: 28 focused frontend tests, 10 real compiler tests, web/backend builds
and targeted frontend ESLint passed. Browser checks exercised compilation,
50→75→100% zoom and resizing with fit width in an isolated synthetic project.
At 100%, the 816×1056 CSS page used a 1632×2112 canvas bitmap.

- [PDF after font and renderer correction, synthetic browser fixture](assets/manuscript-editor/pdf-scalable-font-fit.png)

## Continuous manuscript PDF preview

Manuscripts now show consecutive PDF pages in one keyboard-accessible scroll
region. The toolbar stays outside that region and shows the current page, zoom
and fit width. Previous/Next controls remain available for the separate academic
evidence viewer, which retains its existing single-page mode.

Page placeholders preserve document height; an IntersectionObserver renders
pages within 600px of the viewport and releases distant canvases. Zoom and fit
width retain the reading position rather than jumping to an earlier page.
The renderer still uses pixels only, with PDF scripts, forms and annotation
actions disabled. Focused tests cover scroll position, page counting, offscreen
canvas release, returning to a page and zoom anchoring.

Verification: 29 frontend tests, production build and targeted ESLint pass.
The browser fixture compiled a real four-page PDF and verified scrolling in both
directions (1/4 through 4/4), offscreen canvas release and retaining page 4 during
zoom. Updated frontend installed in local Docker.

- [Continuous PDF scrolling, synthetic browser fixture](assets/manuscript-editor/pdf-continuous-scroll.png)
