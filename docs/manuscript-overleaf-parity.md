# Manuscripts: Overleaf comparison and implementation

Checked 2026-10-20. Reference: [Overleaf Community Edition](https://github.com/overleaf/overleaf), local inspected revision `e039ad26c5bf5422eb57b89fc7e57c75055e631d`.

This is LumiGap's implementation, retaining project authorization, PostgreSQL,
CodeMirror/Yjs and BullMQ. It does not embed an Overleaf server. Overleaf source is
AGPL-3.0; its README distinguishes Community Edition from Server Pro (including
tracked changes). The inspected compiler and SyncTeX behavior informed this work;
no upstream source files or snippet datasets were copied into the product.

## Latest upgrade: saved settings, collaboration history and connectors

The October 20 upgrade covers each requested area with working application
flows; the bounds below describe what is still different from hosted Overleaf.

- **Compiler:** revision-checked per-manuscript engine/release preferences,
  independent of saved source and PDF state. Choices survive reload. Compilation
  without explicit choices uses persisted settings, then the last compilation
  settings for legacy drafts, then pdfLaTeX/2022 when no compilation exists.
  Available releases remain the two installed Debian environments.
- **Visual tables:** edit plain cells from Source or Visual mode, preserving
  simple `table`/`table*` floats, placement, centering, captions, labels, vertical
  borders and `hline`/booktabs rules. Unsupported cell macros, spanning/nested
  tables and custom column types remain protected source. The modal applies only
  on confirmation and checks the captured Yjs range against current content.
- **Tracked changes:** direct inline review and 100,000-character scoped
  proposals, with existing revision checks, attribution and explicit acceptance.
  This is proposal-based review, not a record of every collaborator keystroke.
- **History:** a dated snapshot list, project/file comparisons, and new full-state
  snapshots retaining team comments, replies, resolutions, suggestions, compiler
  choices and original authors. Restore creates a new manuscript with usable Yjs
  anchors. Old snapshots remain source-only. Bounds are 200 comments, 1,000
  replies, 500 proposals, 40 MB retained CRDT state and 20 MB proposal text; a
  snapshot exceeding those limits is clearly marked source-only.
- **GitHub:** explicit inspect/pull/push using a stored Git-blob baseline and
  file-level three-way conflict detection, including deletions. Conflicts require
  a local/remote choice. Pull updates current files transactionally after sealing
  a recovery snapshot; push retains unrelated remote files and never forces a
  branch. Source version and binding revision checks reject stale plans. A failed
  remote publication can leave the inspected merge saved locally, recoverable
  from the pre-sync snapshot. It never implies the GitHub branch was updated.
- **Zotero/Mendeley:** fetch actual authorized library metadata, preview BibTeX
  and explicitly import a separate `.bib` file. Zotero supports user/group
  libraries and explicit 100-item pages; Mendeley follows validated next links.
  Bibliography configuration stays explicit. Imported metadata is not presented
  as independently verified research evidence.
- **Dropbox:** import a ZIP into a new manuscript; export an immutable source
  ZIP after inspecting the remote revision. A changed revision rejects overwrite.
  This is file transfer, not ongoing synchronization of a Dropbox folder.
- **Templates/complex inputs:** additional memoir, Elsevier, Springer LNCS and
  APS templates; passive data/style files; SVG/EPS conversion inside the compiler.
  No project scripts, shell escape or internet package execution is enabled.

Apply `20261020050000_manuscript_preferences_history`, generate Prisma, and
rebuild the API, worker, web and both compiler images. Existing source,
verification, project membership and mentorship records are preserved.

For the new GitHub App callback flow, see
[GitHub manuscript connection](github-manuscript-connection.md). GitHub App
credentials are encrypted server-side and authorize only that user's requests;
manual GitHub tokens and other provider credentials retain the behavior below.

Manual external-provider credentials remain in dialog memory, clear on close, and go
directly to fixed provider HTTPS origins with redirects disabled. They never
enter LumiGap persistence, source exports, URLs or logs. OAuth authorization and
durable provider sessions for Zotero/Mendeley/Dropbox, a native LumiGap Git protocol endpoint, automatic text
merging and background synchronization are not implemented. Authenticated live
provider operations require credentials and remain unverified in this audit;
protocol tests use fixtures and no external repository/library was published.

### Upgrade verification

The final upgrade suites passed 203 tests: 107 frontend tests, 52 API/AI/compiler/
socket tests, 21 disposable PostgreSQL persistence tests, 19 real compiler sandbox
tests against the 2025 environment, and four PostgreSQL runtime-boundary tests.
Backend/shared-types and web production builds, targeted ESLint and scoped
`git diff --check` passed. The additive migration was applied to the local runtime;
both compiler images and API/worker/web assets were rebuilt and deployed.

Disposable browser checks confirmed saved engine selection after reload, an
actual four-page XeLaTeX PDF under the 2025 environment, and editing a floated
table through the visual grid/modal while preserving its caption and label.
GitHub and library/storage dialogs opened with the expected credential fields;
no external credentials or publication were used. A subsequent final browser run
was interrupted by Docker Desktop daemon failures and PostgreSQL timeouts, so
that run does not establish a fresh end-to-end UI pass or a final table/PDF
screenshot. The AI worker in that disposable environment also failed to start
during the database interruption. The passing automated suites above completed
before that infrastructure failure.

After restarting Docker Desktop, the local API returned `ready` with successful
PostgreSQL and Redis probes at 08:42 UTC. Running API/web image IDs matched the
newly staged local tags, and both compiler services were healthy. The interrupted
preview was stopped, its tab closed, and its exact disposable database removed.

## Implemented workflows

| Capability | Implementation |
| --- | --- |
| Collaborative source editor | Existing Yjs rooms, remote cursors, per-file Undo/Redo, durable server receipts |
| Files and folders | Existing create, rename/move, delete, set main file; new multiple source/figure uploads |
| Import external project | New source ZIP import from Manuscripts; fresh manuscript, optional main file path, retry receipt |
| Project templates | Article, proposal, report, IEEE conference, Beamer, blank, memoir thesis, Elsevier, Springer LNCS and APS |
| Source assets | UTF-8 TeX/bibliography/styles, passive data/config files; raster, private PDF, sandbox-converted SVG/EPS figures |
| Source paths | Nested paths, spaces and parentheses; unsafe and reserved compiler paths rejected |
| Compiler engines | pdfLaTeX, XeLaTeX and new LuaLaTeX |
| Bibliographies | BibTeX plus new automatic biblatex/Biber selection |
| Index/glossary | New MakeIndex for generated `.idx`, `.glo` and `.acn` with the standard glossaries style |
| PDF | Existing continuous, lazy page rendering, zoom, fit width, download and last successful output |
| Source/PDF navigation | New SyncTeX: Find in PDF; double-click PDF to return to source; Enter on a focused canvas locates page center |
| Search | Existing in-file search/replace; new authorized project-wide literal search with file/line navigation |
| Completion | Expanded commands, environment names, packages, classes, file paths, citations, local labels and snippets |
| Comments | Existing selection anchors, replies, resolution and immutable mentor/reviewer feedback |
| History | Snapshot timeline, file/project comparison and restore-as-new-draft; new snapshots retain team comments, replies, proposals and compiler settings |
| Browser recovery | New user/project/file-scoped IndexedDB recovery, replaying original server receipts after reopening |
| Writing AI | Existing operations, context/citation validation and explicit acceptance preserved |
| Suggested edits | Persistent before/after proposals, attribution, automatic scoped tracking, revision-checked accept/reject, concurrent acceptance and stale-anchor protection |
| Visual writing | Prose/headings, protected citation/math tokens, grid editing of simple tables (including floats/caption/label/rules), equation modal; unsupported structures stay source blocks |
| Template gallery | Searchable built-in templates with illustrative layout previews; uses existing creation and compilation |
| GitHub synchronization | Direct API import/export plus explicit two-way sync, stored baseline, file conflict choices, local recovery snapshot and non-force push |
| External libraries/storage | Direct Zotero/Mendeley bibliography preview/import; Dropbox ZIP import and revision-protected export |

## Use

1. Project → Manuscripts → **Nhập dự án ZIP**, or create with a template.
2. ZIP import detects root `main.tex` or a unique document class. A single enclosing
   directory is removed. If several main documents exist, enter the path explicitly.
   Unsupported files are listed after import. No project `.latexmkrc` executes.
3. Upload source files or figures from Files. Source uploads keep their filename
   and do not overwrite collaborators' files. Figure replacement remains explicit.
4. Choose an engine and Compile PDF. Biber is selected from generated `.bcf`;
   standard indexes and glossaries are processed before the final TeX passes.
5. Select a source line and **Tìm trên PDF**, or double-click rendered PDF text.
   This uses the exact successful compilation's sidecar. Navigation is disabled
   when source edits make the PDF stale. Old PDFs require one new compilation.
6. Search via the magnifying glass in Files. Search waits for local saves and
   returns up to 100 matching lines. It is literal search, not regular expression
   execution. History comparison reads an authorized immutable source snapshot.

## Persistence and deployment

Apply additive migration `20261020010000_manuscript_synctex` with
`pnpm --filter backend db:migrate:deploy`, generate the Prisma client, and rebuild
the API/worker, compiler and web. The new nullable `synctex_data` column is capped
at 2 MB. Existing PDF rows remain readable. Source snapshots do not change.

Use the existing compiler Compose overlay documented in
[manuscript-compilation.md](manuscript-compilation.md). No JavaScript package was
added. The compiler image adds LuaTeX, Biber/biblatex and complete DejaVu variants.

## Bounds and differences

- This is not full equivalence with every Overleaf CE or hosted/Pro feature.
  Visual writing supports prose/headings and a conservative inline subset, not
  arbitrary WYSIWYG TeX. Tracked editing automatically saves one bounded proposal for a selected range
  or a small file; it does not record every keystroke as a separate revision or
  provide unbounded inline tracked changes across arbitrary files. GitHub sync
  requires explicit conflict decisions. A native Git protocol server, automatic
  background provider sync, public share-link collaboration, the full hosted
  template catalogue and arbitrary historical TeX Live releases are not implemented.
- Arbitrary data/config extensions, project scripts, arbitrary
  shell escape and internet package installation are unsupported. Shell-dependent
  packages such as minted cannot run. The document's missing figures/references
  cannot be inferred or fabricated by importing a template.
- Compilation offers installed TeX Live 2022 (Debian bookworm) and 2025/dev
  (Debian 13), not a claim of the newest frozen upstream TeX Live. The predefined index/glossary tools do not cover every custom
  glossary/bibliography build configuration. TeX log warnings remain distinct from
  errors and from scientific verification.
- SyncTeX locates a nearby typeset node, not an exact character; comments/macros
  without output may have no location. Sidecar access follows exact snapshot
  permissions and is rechecked after the private compiler query.
- ZIP bounds: 10 MB compressed, 20 MB extracted, 200 supported files, 500 KB per
  text source and 5 MB per figure. Central-directory preflight, CRC validation,
  UTF-8 decoding and collision checks precede the atomic import transaction.
  Encrypted/ZIP64 archives and symlink entries are rejected.
- PDF figures stay private binary assets. Downloads use attachment disposition;
  browser preview never executes PDF scripts. The isolated TeX job parses figures.
- Browser recovery requires IndexedDB. Storage failure produces a visible warning.
  Recovery is removed only after durable receipts, on account change, or when
  opening an expired record (7 days). It does not grant offline authorization to
  a revoked member. Server saving and local recovery remain separate guarantees.
- Source comparison displays at most 1,500 lines; large changed blocks use a
  bounded comparison. Source ZIP download retains the complete files.

## Review, visual writing and GitHub (2026-10-20)

Apply `20261020020000_manuscript_suggestions` in addition to the SyncTeX migration.
Source proposals are separate database records. Creation checks an exact source
sequence; acceptance resolves server-derived Yjs anchors, compares the original
and surrounding context, and records one attributed source update transactionally.
The existing project lock serializes source writes and acceptance. A second
acceptance is idempotent, reversing a decision is rejected, and removing a member
immediately removes access to proposals. Mentors/reviewers keep snapshot feedback;
they do not gain source-edit or proposal access. History is capped at 500 proposals
per manuscript, 100,000 characters per original/replacement.

Visual writing keeps CodeMirror mounted and applies accepted block edits through
the existing Yjs/undo path. It preserves every byte outside the targeted block.
Unknown commands and complex environments remain source blocks. Simple tables
and equations expose structured editing tools. Recognized inline citations, labels, references and math are atom tokens.
Protected inline tokens must remain identical and in order when saving a visual block. Nested formatting is bounded. The rich-text editor never executes user HTML or TeX. A changed source prevents
saving a stale block. Visual drafts require Save or Cancel and use the existing
unsaved-work protection.

GitHub supports repository/branch selection, public/private source import,
per-blob SHA verification, and export preview listing exactly which files will
be added or updated. Imports create a fresh manuscript through the same atomic
ZIP validation path. Export reads an immutable authorized snapshot, retains the
remote base tree (no implicit deletions), and creates a branch by default. An
existing source branch is updated with `force: false`; concurrent remote work
or branch protection rejects the update. No push happens during preview.

Manually entered GitHub tokens stay in dialog memory, clear on close, and go only to the fixed
`https://api.github.com` origin with redirects disabled. Public source blobs are downloaded from the fixed `https://raw.githubusercontent.com` origin at the inspected commit, without forwarding the token, then checked against their Git blob hashes. They never enter LumiGap
requests, persistent storage or URLs. Export requires repository Contents write
permission; public import does not require a token. Limits are 200 supported files,
6 MB total for GitHub import and a 10,000-entry non-truncated repository tree.
Unrelated/unsupported files are listed as skipped. This connector deliberately
does not run Git hooks, remote scripts or force pushes. Private-data export to a
public repository is explicitly shown before the publish action.

The newer [GitHub App callback](github-manuscript-connection.md) uses encrypted
server-side credentials instead of a manually entered token, keeping the same
source-transfer and conflict workflow.

## Verification

Meaningful regression coverage includes hostile/corrupt ZIP rejection, atomic
import retries, exact text export, preserved JPEG paths, membership revocation,
real HTTP import → BullMQ → LuaLaTeX/Biber → private PDF → bidirectional SyncTeX,
all new templates, actual index/glossary/PDF-figure compilation, Lua sandbox
restrictions, IndexedDB receipt recovery and bounded line comparisons.

Existing AI, authorization, collaborative source, comments and compilation
regressions are run alongside these changes. Integration databases and browser
fixtures are disposable and do not edit users' manuscripts.

The checks passed: 49 backend unit tests, 54 database/HTTP/queue integration
tests, 19 actual compiler tests and 85 frontend tests (207 relevant tests), plus
the four PostgreSQL runtime-boundary checks. Backend and web production builds
and targeted ESLint checks passed.

A disposable browser project was used to import a ZIP, compile with LuaLaTeX and
Biber, search sources, compare a version and navigate in both directions between
source and PDF. The mobile layout was checked at 390 × 844 without horizontal
overflow. [Editor verification screenshot](assets/manuscript-editor/overleaf-zip-synctex.png).


The latest disposable browser session verified visual paragraph editing (including
escaped percent/ampersand characters), a proposed heading remaining unchanged
until acceptance, and a successful four-page PDF after acceptance. Toolbar controls
were also checked at 390 px. [Visual writing and PDF](assets/manuscript-editor/visual-writing-review.png).
GitHub transport tests cover pinned commits, public downloads without token
forwarding, blob integrity, export base trees, non-force updates, branch conflicts
and quota errors. A live public import was attempted but GitHub's unauthenticated
API quota was exhausted; live authenticated private import/export remains
unverified without user-supplied credentials. No repository was published during
verification. The dialog supports cancellation and explains quota exhaustion.

The final browser run also created an IEEE manuscript from the gallery and compiled its two-column PDF. Cancelling a file switch retained the visual draft. [IEEE compilation](assets/manuscript-editor/ieee-template-verified.png).

## Automatic tracked editing and project comparison (2026-10-20 follow-up)

Apply `20261020030000_manuscript_suggestion_revisions` after the migrations above.
Existing suggestions start at revision 1. No source or comment data is rewritten.

**Theo dõi thay đổi** opens an independent CodeMirror buffer for the selected
range, or the whole file when at most 100,000 characters. Idle typing autosaves
a persistent proposal; **Lưu đề xuất** saves immediately. The shared Yjs source
changes only after an explicit acceptance. **So sánh thay đổi** shows the draft
diff, and **Xem các đề xuất** opens the existing team review workflow. Saved
proposals remain visible after reload; unsaved text is retained in the open
tab and guarded on navigation, not promised as durable offline proposal recovery.

Only the original author can update a pending proposal. Every update checks
current membership, archival status, source anchors and the expected proposal
revision under the project transaction lock. Review requires the exact revision
shown to the reviewer. Serial client saves replay an uncertain create/update
verbatim before sending newer typing, including when typing reverts to a previous
value. Failed autosaves stop until explicit Retry. Oversized text is retained
without truncation; permissions and hidden source actions cannot bypass review.

History now compares entire immutable manifests against another version or a
sealed saved working draft. It reports added, removed, renamed and modified files,
text diffs, binary checksums, title changes and main-file changes. Renames use
stable file IDs. Text comparisons remain bounded to 1,500 displayed lines.

Follow-up verification: 94 frontend tests, 11 HTTP route tests and 17 disposable
PostgreSQL persistence tests passed. Coverage includes lost responses with newer
typing, StrictMode autosaves, over-limit text, revoked permissions, simultaneous
save/accept, stale revision rejection, and same-file comment navigation. Backend
and frontend builds, targeted ESLint and the PostgreSQL runtime audit passed.

The disposable browser flow verified two autosaved revisions, unchanged shared
source before acceptance, acceptance followed by a real four-page PDF, rejection
without source mutation, and whole-project history comparison of the changed
introduction. The final 390 × 844 layout had no horizontal overflow.
[Tracked editing and real PDF](assets/manuscript-editor/tracked-editing-verified.jpg) ·
[Mobile tracked editing](assets/manuscript-editor/tracked-editing-mobile.jpg).


## Inline review and structured source tools (2026-10-20)

Pending proposals open directly beside their source in CodeMirror. The before/after
widget identifies the author and revision, and uses the existing server review
workflow. Relative Yjs anchors, original text and surrounding context must match.
Changed source hides inline controls; the review panel retains pending proposals.
At most 30 pending proposals in the current file are decorated to bound rendering.
All history remains accessible in the panel.

**Soạn bảng** creates or edits simple plain-text `tabular` blocks (1–20 rows,
1–8 columns, l/c/r alignment), including table floats, basic captions/labels,
vertical rules and booktabs/hline row rules. It escapes LaTeX special characters. Unsupported
macros, formatting, nested/spanning cells and complex tables remain in source.
**Soạn công thức** previews bounded display math with KaTeX; trusted HTML,
URLs and image commands are disabled. KaTeX is a preview subset, not a substitute
for TeX compilation. Both tools require explicit application, revalidate captured
source/access and use the existing collaborative source/undo path.

Selectable compiler environments and final-pass diagnostics are documented in
[manuscript-compilation.md](manuscript-compilation.md).

Verification: 99 frontend tests, 45 API/AI/compiler/socket tests and 17 persistence
tests passed, plus four runtime-boundary tests. Six actual WebSocket authors
merged simultaneous edits, replayed a receipt, reconnected and lost write access
after membership/session revocation. A 259,338-byte, 14-file synthetic source
compiled to a 60-page, 251,644-byte PDF with resolved bibliography/references in
about 2.2 seconds locally. This is a bounded local fixture, not a production load
or availability benchmark.

Remaining differences include a complete WYSIWYG TeX editor, arbitrary complex
table editing, Git remote/automatic merge, the complete frozen upstream TeX
catalogue, and tested multi-instance production collaboration. These changes
do not establish full parity with hosted Overleaf.


Browser verification accepted an inline proposal, inserted an escaped plain-text
table and a displayed fraction/sum, then compiled a real four-page PDF. A 390 px
viewport had no document overflow; malformed math disabled Apply and displayed a
syntax message. [Verified editor and PDF](assets/manuscript-editor/structured-writing-verified.png)
· [Mobile syntax validation](assets/manuscript-editor/structured-writing-mobile.png).
Backend/web builds and targeted lint passed. The local Docker runtime has the new
migration, matching built assets, both private compiler endpoints and a ready API.
