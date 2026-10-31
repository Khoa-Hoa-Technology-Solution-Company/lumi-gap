# PDF → LaTeX

Open **Project → Manuscripts → PDF → LaTeX**. Select a PDF (5 MB,
1–100 pages), choose a mode, convert, compare the compiled PDF beside the original, then explicitly accept to create
a separate manuscript. The existing project contribution permissions apply.

## Compiled preview

The same background import job sends the converted `main.tex` and its source
files to the existing isolated XeLaTeX compiler. The preview shows the resulting
PDF with continuous scrolling and zoom. It never substitutes `original.pdf` or
the facsimile `original-layout.tex` for the converted output. No manuscript or
snapshot is created until the user accepts.

Conversion and compilation have separate states. A conversion can remain usable
when compilation fails or the compiler is unavailable; the UI explains the
missing preview and exposes compiler diagnostics when available. Users may still
import the source to correct it in the editor. Preview downloads recheck project
write access, account, requester, job completion and expiry. PDF bytes use a
private Redis key with the original one-hour deadline and are rendered through
the existing canvas viewer, without active PDF scripts or annotations.

## Conversion modes

**Preserve PDF layout** remains the default, for the user's layout-first preference.

The default `main.tex` uses **XeLaTeX**, loads `pages/page-N.tex` and places
editable words at their original coordinates over a graphics-only PDF layer.
Substitute fonts retain serif/sans/monospace, bold/italic, size, color and word
width. Edits do not automatically reflow. Check the compiled output against the
private `original.pdf`, especially equations, special symbols and spacing.

`original-layout.tex` embeds the original pages via `pdfpages` for a facsimile;
this mode does **not** make PDF text editable. PDF annotations/form appearances
are not reconstructed. Flatten form fields before import. No bibliography keys,
equation environments or original semantic LaTeX can be recovered automatically.
All-image scans require the editable-content mode. Image-only pages in a mixed document are
retained with a warning. Nonzero page origins, positive PDF UserUnit scales and
cropped pages are normalized to the visible page in physical PDF points.
Text outside the visible crop is excluded. Page rotation metadata is transferred
to content; text that remains rotated is still unsupported in layout mode.
Invalid/oversized physical page boxes and undecodable glyphs fail explicitly.

**Extract editable content · Docling** reconstructs editable content with
approximate layout. Native PDF/OCR boxes become a semantic/layout intermediate
model, validated using **Docling Core 2.99.0** document/table types. A separate
application renderer preserves source page dimensions, approximate margins,
font families/sizes, alignment and measured block spacing. It replaces the old
upstream serializer, whose default page geometry and missing table spans lost
important layout information. Paragraphs reflow; no per-word positioning or
full-page background is used by structured `main.tex`.

Ruled tables use bounded snap/join/intersection tolerances for fragmented rules.
Borderless recovery requires repeated aligned columns and numeric data, with
minimum row/header checks. Weak candidates remain text. Tables retain real cells,
proportional wrapping columns, numeric alignment and row/column spans. Larger
tables use `longtable`; ordinary receipts use compact `tabular`. Source page
breaks are explicit, but edits can cause additional pages. Raster figures are
packaged as PNG crops. `source-map.txt` records normalized top-left PDF-point
boxes, source page, reading order, style, inferred confidence and table cells.
The IR and renderer are independent modules.

Pages with no text use **local Tesseract OCR**, with English and Vietnamese
language data installed in the Python image. OCR pages are explicitly flagged;
the full-page scan is not inserted again behind its extracted text. Scanned
tables can be inferred from aligned OCR boxes; uncertain OCR remains flagged.
Blank/unreadable scans fail
explicitly. Hidden OCR text layers are treated as extracted text, and full-page
raster backgrounds are omitted in this mode to avoid duplicate text.

This uses **Docling Core's semantic models**, not Docling's full ML PDF pipeline. It
does not claim neural layout detection or formula recognition. No model weights
are downloaded. The current Docker host has about 3 GB RAM shared across all
services; adding every PDF ML framework is inappropriate for that runtime.

## Optional AI

The unchecked **Use AI to identify document structure** option sends at most 300
characters per text block (at most 500 blocks sampled across the document) to the user's configured AI
provider, through `modules/llm` and `withUserAi`. It returns only block IDs and
`heading`, `paragraph`, `metadata`, `total`, `note` or `footer` labels, at most
100 corrections. It cannot infer or rewrite table cells. Unknown IDs, duplicates,
extra fields, free-form text, commands and mismatched source blocks are rejected.
Text, numbers, references, order, figures and table cells cannot be edited by
this AI step. If the provider is unavailable or output is invalid, the usable
deterministic extraction is kept and the preview says AI assistance was not used.
The existing editor's AI tools remain available after import for explicit edits.
The converter does not recover scientific meaning or invent bibliography data.

## Automatic structured-output comparison

After successful structured compilation, the same job compares the original and
real generated PDF through the authenticated local `/internal/pdf-comparison`
service. The isolated process has a 25-second wall timeout. Up to five evenly
sampled pages are checked for text-token coverage, exact normalized numeric
occurrences, content bounds and coarse rendered layout similarity. Page counts
are also compared. Missing scan text has no trustworthy baseline, so text/numeric
metrics are omitted. The UI shows concrete warnings for unmatched numbers/text,
changed pagination, uncertain blocks and layout differences. An unavailable
comparison is explicitly reported and does not prevent source review/import.

These checks do not certify correctness, table-cell relationships, scientific
meaning or OCR accuracy. Always inspect the paired original/compiled previews.
Layout mode does not run this comparison or change its source generator.

The AI cache is scoped to the actor, document/options digest and provider;
its TTL is one hour. It stores label results, not PDF bytes or extracted prose.
No external PDF upload/conversion service is involved. Local conversion uses no
LLM. The optional AI step uses existing platform/personal provider credentials.

## Runtime and privacy

The backend enqueues `manuscript_pdf_import` on the existing `worker:ai-jobs`.
The Python service exposes an authenticated `/internal/pdf-to-latex` endpoint.
The parser supports up to 100 pages and 100,000 words, with existing archive,
source-file and output-size limits still enforced. It runs in a separate process
with a 1.5 GB address-space limit, 240 CPU seconds and a 300-second wall-clock
timeout. The backend waits at most 310 seconds. Timeout kills its process group,
including OCR children. One conversion runs per Python service process; a busy
service returns 503 for the existing queue's exponential retries. OCR is capped
at 20 seconds per page. Native parsing and ML-independent extraction retain
the existing page, character, ZIP and file-size bounds.

Raw uploads and ZIP results live in private Redis keys for at most one hour.
Queue metadata holds identifiers and hashes, not document contents. Results are
visible only to the requesting account with current write access. Processing and
acceptance recheck permissions; removed members cannot retrieve or import results.
Acceptance reuses the transactional/idempotent manuscript ZIP import, PostgreSQL
files, history and collaborative editing. Existing manuscripts are not modified.

Rebuild/recreate backend, web, worker-ai-jobs and ai-reviewer for deployment.
The compiler Compose overlay grants `worker-ai-jobs` access to the isolated
compiler network and its fixed endpoints for temporary preview compilation.
No new environment variables or migrations are required. Measured before/after
results of the structured mode are in [the validation record](pdf-structured-validation.md).
