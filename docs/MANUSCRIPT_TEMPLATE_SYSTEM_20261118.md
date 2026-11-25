# Manuscript creation and LaTeX template audit

Verified on 2026-11-18 in `D:\lumi-gap`. Local development only; no commit, push,
production deployment, database reset or historical migration repair.

## Problems confirmed before implementation

- A template dropdown and gallery duplicated the same selection.
- Every template appeared for every document type. API and service validation
  accepted combinations such as a thesis with a Beamer template.
- Document types lacked Presentation. The report's persisted identifier was
  `TECHNICAL_REPORT`; it must remain valid for existing drafts.
- Template labels and descriptions were independently hardcoded in components.
- CSS illustrations were reused across layouts instead of showing compiled output.
- Research report sources used section headings under `report`, producing chapter
  zero numbering. The basic article lacked an abstract environment.
- New manuscripts did not retain a versioned initialization manifest.
- A failed creation followed by edited input reused the previous idempotency key.
- A real citation in REVTeX failed: its generated `paperNotes.bib` was in the job's
  build directory, outside BibTeX's configured source search path. Empty-reference
  template smoke tests had not exercised this case.

## Implemented UX and canonical mapping

One dialog, without wizard steps. A required title and document type lead to one
native radio-card template picker. Description is optional. Template search appears
only after expanding the six compatible paper templates; search never widens the
document-type filter. The publisher group is collapsed initially. A separate
disclosure opens the selected template's compiled preview and class documentation.

| Document type | Default | Other compatible options |
| --- | --- | --- |
| Research Paper | Basic research paper (`ARTICLE`) | IEEE Conference, Elsevier Article, Springer LNCS, REVTeX, Blank |
| Research Proposal | `PROPOSAL` | Blank |
| Research Report (`TECHNICAL_REPORT`) | `REPORT` | Blank |
| Thesis / Dissertation | `THESIS` | Blank |
| Presentation | Beamer (`PRESENTATION`) | Blank |
| Other | `BLANK` | Optional custom type name, up to 80 characters |

Changing type selects its default when the previous selection is incompatible and
announces the change. A compatible Blank selection may be retained. Typed title and
description remain intact. The existing source-ZIP dialog is reused through a
secondary link, including the existing unsaved-input confirmation.

The footer stays reachable within one dialog scroll surface. Existing theme tokens,
Vietnamese/English localization, disabled/loading/error states, keyboard radio
navigation and focus rings are retained. Preview failure has an explicit fallback.

## Registry, initialization and data safety

`packages/shared-types/src/manuscript-templates.ts` is the shared source for types,
labels, defaults, compatibility, descriptions, category, recommendation, class,
source URL, dependency license, required packages, preferred engine, preview asset,
compatibility status and starter version. These are LumiGap-authored starters using
installed LaTeX classes, not copies of publisher or Overleaf example projects.

All ten starters retain actual `main.tex` source. Depending on the template they
also create section/chapter files and `references.bib`. Blank creates just its main
source; unnecessary empty section folders are avoided. Existing source initialization
and collaborative Yjs storage are reused. Report headings now use chapters and the
basic article includes an abstract.

Creation remains one existing authorized, project-locked database transaction.
The DTO and direct service path reject invalid type/template pairs and custom names
outside Other. Source-path validation remains mandatory. Initialization failure rolls
back the manuscript and files. An unchanged retry retains its key; changed input gets
a new client key. Server-side receipts still detect conflicting retries.

New drafts persist the registry version, class, main file, origin and checksum of
their initial sources. The initial workspace revision retains this metadata as well.
Compiler preference is recorded at creation; later saved compiler settings are not
overwritten. Thesis and Beamer prefer XeLaTeX for Unicode authoring; the other
starters prefer pdfLaTeX. All three engine choices were verified for every starter.
Custom labels and template metadata survive snapshot/copy restoration.

No post-writing template replacement or conversion endpoint was introduced. Existing
draft sources, bibliography, images, collaboration updates, reviews and historical
snapshots are never rewritten by this feature. Historical combinations remain
readable/restorable; new creation rules apply to new requests.

## Compilation results

All ten templates passed the real isolated compiler with all three engines on both
installed releases. Each cell below represents real pdfLaTeX, XeLaTeX and LuaLaTeX
success, not a mock or filename-only check.

| Template | Class | TeX Live 2022 | TeX Live 2025 | Real BibTeX citation, both releases |
| --- | --- | --- | --- | --- |
| Basic article | `article` | 3/3 | 3/3 | PASS |
| Proposal | `article` | 3/3 | 3/3 | PASS |
| Report | `report` | 3/3 | 3/3 | PASS |
| IEEE Conference | `IEEEtran` | 3/3 | 3/3 | PASS |
| Beamer | `beamer` | 3/3 | 3/3 | Not used by this starter |
| Thesis | `memoir` | 3/3 | 3/3 | PASS |
| Elsevier | `elsarticle` | 3/3 | 3/3 | PASS |
| Springer LNCS | `llncs` | 3/3 | 3/3 | PASS |
| REVTeX | `revtex4-2` | 3/3 | 3/3 | PASS after compiler fix |
| Blank | `article` | 3/3 | 3/3 | Not used by this starter |

Evidence: `docs/audits/2026-11-18-manuscript-templates/compile-results.json`
(60 engine/release cases) and `compile-bibliography-results.json` (20 additional
compiles, including 16 with bibliography exercised). `compile-preferred-results.json`
retains another 20 compiles with the final preferred engines used for preview
generation. Bibliography checks use
explicitly synthetic developer fixtures, never fabricated publication data in a
user's manuscript. Generated PDFs remain in ignored `.cache/manuscript-template-audit`.

The compiler change adds only this job's fixed `lumigap-build` directory to
`BIBINPUTS`. Landlock, seccomp, restricted file I/O, no shell escape, resource limits,
private temporary directories and internal authentication are unchanged. A dedicated
REVTeX regression passed in both compiler images; the full 2022 compiler suite
passed 20 cases, including shell-escape/private-file protections.

The ten public WebP previews were rendered from actual starter PDFs using illustrative
text. They are static assets, not compiled when opening the form. The UI explicitly
labels their illustrative nature. IEEE and REVTeX show their actual column layouts,
Beamer its landscape slides, and Blank its real empty page. No third-party preview
image or template source was copied into the app.

## Database and API

New migration: `20261118100000_manuscript_template_registry`.

- Adds nullable `document_type_label` and `template_metadata` to `draft_workspaces`.
- Extends the existing document-type check with `PRESENTATION`.
- Restricts custom labels to nonempty Other labels of at most 80 characters.
- Keeps all persisted identifiers and all old records unchanged.

The new migration was applied alone to local PostgreSQL through a temporary,
single-migration Prisma configuration, after checking the existing schema and absence
of unfinished migrations. All 77 preexisting draft rows were compared before/after
(excluding the newly added null columns), and previous migration records were
unchanged. The previously reported unrelated migration-history divergence was not
repaired or replayed. Fresh integration databases replayed the complete checked-in
migration chain independently and were removed only by their generated test names.

No API endpoint was added. Existing manuscript creation accepts the new Presentation
value and optional `documentTypeLabel`; existing DTOs expose optional label/metadata.
Existing ZIP import, permissions, snapshot, review and repository APIs are reused.

## Verification

- Backend registry, HTTP validation and ZIP-security suites: 40 tests passed.
- New fresh-PostgreSQL creation/metadata/security/rollback/retry suite: 13 passed.
- Existing manuscript persistence regression: 26 passed, including CRDT updates,
  source ZIP/repository round trips, immutable snapshots and sealed peer review.
- Existing mentor review workflow: 13 passed; one optional interactive-browser
  scenario was skipped. These cases cover shared v1, feedback, private v2,
  resubmission and multi-project mentor queues with scoped access.
- Web manuscript regression suites: 226 tests passed across 29 files.
- Real compiler: 60 starter compiles plus 20 bibliography-mode compiles passed.
- Compiler security/regression suite: 20 passed on 2022; the added REVTeX case also
  passed on 2025.
- Shared types compile, backend/web typechecks, scoped ESLint and backend/web builds
  passed. Backend build also passed its four PostgreSQL runtime-boundary tests.
- Direct browser checks used the actual creation component in an ignored local QA
  harness: 1440×900, 1024×768, 390×844; light/dark; expansion, scoped search, IEEE
  preview assets, type changes, default selection, keyboard arrows, visible footer
  and no horizontal overflow. This is form-level browser verification, not a claim
  that an authenticated user completed the full review workflow in that browser.

## Files and reproduction

Core changes:

- `packages/shared-types/src/manuscript-templates.ts`, `manuscript.ts`.
- `apps/backend/prisma/collaboration.prisma` and the new migration.
- `apps/backend/src/modules/workspaces/dto/manuscript.schema.ts`.
- `apps/backend/src/modules/workspaces/manuscript.service.ts`, `manuscript-source.ts`.
- `apps/backend/compiler/server.py`, `test_compiler.py`.
- `apps/web/src/features/manuscripts/manuscripts-panel.tsx`, `manuscript-templates.tsx`,
  `manuscript-import.tsx`, `manuscript-creation.css`.
- `apps/web/src/i18n/locales/manuscripts.ts` and ten public preview assets.
- Colocated creation, registry, persistence, HTTP and compilation regression tests.
- `apps/backend/scripts/test-manuscript-templates.mjs`,
  `verify-manuscript-templates.ts`, `render-manuscript-template-previews.py`.

From `apps/backend`, with existing loopback compilers configured in the environment:

```powershell
node scripts/test-manuscript-templates.mjs --regression
node --import tsx scripts/verify-manuscript-templates.ts --all-engines --previews
node --import tsx scripts/verify-manuscript-templates.ts --bibliography
python scripts/render-manuscript-template-previews.py
```

The renderer needs PyMuPDF and Pillow only for developer asset preparation. Application
users do not need them. The smoke CLI refuses to report success when no compiler is
configured. Local API/web continue to use the existing lightweight launcher with
`-Compiler` for PDF functionality.

## Sources, licenses and limitations

Sources consulted directly:

- [IEEE Author Center](https://journals.ieeeauthorcenter.ieee.org/create-your-ieee-journal-article/authoring-tools-and-templates/)
  and [IEEEtran / LPPL](https://ctan.org/pkg/ieeetran).
- [Elsevier elsarticle / LPPL](https://ctan.org/pkg/elsarticle).
- [Springer author instructions](https://link.springer.com/series/558/information-for-authors-and-editors)
  and [current llncs distribution / CC BY 4.0](https://ctan.org/tex-archive/macros/latex/contrib/llncs).
- [REVTeX / LPPL](https://ctan.org/pkg/revtex).
- [Beamer and its licenses](https://ctan.org/pkg/beamer).
- [Overleaf Gallery](https://www.overleaf.com/latex/templates), consulted for navigation
  conventions only; no gallery sources/assets were redistributed.

Dependency licenses describe the class distributions, not a new license grant over
LumiGap's source. Installed older package releases keep their own notices. Starter
version 2.0.0 is the LumiGap initialization version, not a publisher package version.
Using a class does not guarantee acceptance at any venue; students must check the
current venue instructions. No templates remain known to fail the verified matrix.
Other deployments still need the same classes/packages and configured sandbox workers.
Automatic conversion of an existing manuscript remains deliberately unsupported.
