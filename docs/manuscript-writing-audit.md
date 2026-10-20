# Manuscript writing audit — 2026-10-20

## Verified scope

| Area | Implementation and verification |
| --- | --- |
| Source editor | CodeMirror, LaTeX highlighting, command/citation completion, selection formatting, search/replace and per-file Yjs undo; read-only undo remains blocked |
| Collaborative source | PostgreSQL receipts, concurrent CRDT edits, source synchronization and authorization checks; source saving is distinct from PDF compilation |
| Files and templates | Nested `.tex` files via `input` and `include`; `.bib`, `.sty`, `.cls`, `.bst`, `.txt`; immutable snapshots, source ZIP export and restoration |
| Research citations | Project literature supplies canonical metadata/keys; insertion preserves manual bibliography entries; pending insertion uses the original anchored selection |
| LaTeX content | Real fixtures cover equations, labels/references, tables, PNG figures, IEEEtran, algorithmic, natbib, custom class/package/style files and BibTeX |
| Languages/fonts | pdfLaTeX and XeLaTeX; new templates handle Vietnamese/English with T1/T5 Latin Modern or fontspec/DejaVu Serif |
| PDF | Real compiler output, private authorized download, continuous preview, zoom, stale-source labels and retained previous PDF after a failed build |
| Team review | Comments, replies, immutable versions, mentor feedback, formal review and revocation tests |
| Writing AI | Operation rules, source anchors/revisions, citation/DOI validation, explicit acceptance and rejection; test provider is mocked |

## Corrected in this audit

- BibTeX was skipped when citations appeared only in `include` child auxiliary
  files. The compiler now inspects job-local auxiliary files, including nested
  chapters and `nocite`, before running BibTeX and the remaining TeX passes.
- Local `.cls` and `.bst` template files were rejected. They now persist and
  compile through the existing file pipeline; class/package diagnostics can
  navigate to source lines.
- Manual citation insertion read the cursor after its network request. It now
  captures Yjs anchors before awaiting, rechecks the text/context, active editor,
  permission and synchronization, and refuses to overwrite an edited selection.
  Prose citation buttons are enabled only for `.tex` files.
- New templates explicitly support Vietnamese under either engine. Existing
  manuscripts keep their authored preamble and fonts.

## Verification and limits

Tests use disposable PostgreSQL, Redis and compiler instances. They do not edit
the user's manuscript. Compiler tests execute the real installed TeX programs,
including filesystem/network/shell restrictions and recovery after timeouts.
AI integration tests use a mocked provider; no live model quality claim is made.

This is not complete Overleaf feature parity or a complete TeX distribution.
The current runtime is TeX Live 2022 on Debian bookworm with the packages named
in `apps/backend/compiler/Dockerfile`; it does not dynamically install packages.
In particular:

- Biber/biblatex, LuaLaTeX, automatic index/glossary generation and shell-dependent
  minted workflows have not been implemented/tested here.
- Bulk source ZIP import and PDF/EPS figure uploads are not supported by the
  current manuscript upload UI/API. Raster images are normalized to PNG.
- Completion offers common commands and project citation keys; it is not a TeX
  language server with exhaustive package-aware completions or live compilation.
- There is no SyncTeX mapping between PDF coordinates and source code.
- Offline edits remain in the open tab until synchronization; there is no durable
  offline storage across closing the browser.
- Existing user files still need valid LaTeX, their referenced files and installed
  packages. Successful compilation does not establish scientific correctness.
