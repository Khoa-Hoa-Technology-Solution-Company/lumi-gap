# Structured PDF to LaTeX: validation record

Date: 2026-10-20. All fixture people, receipts, order numbers and measurements are synthetic. No user document or credential is included.

## Scope and setup

Only the structured conversion implementation was upgraded. The existing coordinate-preserving converter is covered by the old regression suite. Validation used the existing reviewer container dependencies and the real XeLaTeX manuscript compiler; no package was installed for these tests.

The two Vietnamese receipts were authored with XeLaTeX and DejaVu Sans, then converted from their PDFs. They have the same content and dimensions (595.28 by 708.66 PDF points); one has ordinary complete table rules and the other is borderless. Their reproducible TeX sources and PDFs are in `apps/ai-reviewer/tests/fixtures/pdf-structured/`.

The fixture helper `pdf_structured_fixtures.py` generates other PDFs using existing pypdf/Pillow dependencies. The 18-row table has genuinely fragmented horizontal rules with a two-point gap. The merged table has a two-column heading and a two-row data cell. These are separate fixtures from the regular ruled receipt.

## Semantic regression tests

`test_pdf_structured_layout.py` covers:

- Exact Vietnamese text, order identifier, amounts and row/column relationships.
- Borderless-table recovery, including a wrapped header and product name.
- Fragmented rules, 18 data rows, row spans and column spans.
- Original page dimensions, font family and numeric alignment.
- Reflowable paragraphs, semantic headings and numbered lists.
- Ordinary prose columns remaining prose rather than false tables.
- Printed equation preservation with an explicit formula-recovery limitation.
- Escaping input that resembles LaTeX commands and special characters.
- Standalone raster figure packaging without a page background.
- Vietnamese OCR with exact fixture identifier/amount checks and review warnings.
- Three-page source provenance.

The complete relevant suite also includes existing layout conversion/normalization, cropping, rotated pages, 100-page limits, encryption/forms, comparison metrics, authenticated comparison routes and timeout cleanup.

Reproduction inside an existing reviewer image with the checkout mounted at `/workspace`:

```sh
cd /workspace/apps/ai-reviewer
PYTHONPATH=.:tests python3 -m unittest discover -s tests -p 'test_pdf*.py' -v
```

The final deployed reviewer passed all **46 tests in 12.978 seconds**, after Docker recovery and deployment of the frozen final converter. Only tests/fixtures were copied into `/tmp/lg-validation/tests`; application modules were imported from the deployed `/app`. This includes the final table-font, numeric-form and sparse-scan refinements. The earlier interrupted Docker run is superseded by this successful full rerun.

Exact deployed-container command:

```sh
docker exec -w /app -e PYTHONPATH=/app:/tmp/lg-validation/tests lumi-gap-ai-reviewer-1 python3 -m unittest discover -s /tmp/lg-validation/tests -p 'test_pdf*.py' -v
```

Root validation additionally passed 23 relevant backend tests, six frontend tests, shared-types/backend/frontend builds, and targeted frontend ESLint.

## Application persistence and authorization integration

The final scratch-environment run passed **11 integration tests**, with one external-AI test intentionally skipped, in 25.07 seconds. It used real PostgreSQL, Redis, the reviewer and manuscript compiler. Disposable resources were cleaned after the completed run. The final log is `apps/backend/uploads/pdf-structured-final-integration.log`.

The run verifies real structured conversion → compilation → PDF comparison → private preview → persisted manuscript import, including editable tables. It also covers requester isolation, permission revocation, duplicate acceptance, expiry, failed/unavailable compilation, and unavailable comparison retaining the actual compiled preview. The 100-page case converted, previewed and imported all 100 pages, including its final page. It does not substitute the source PDF when generated-source compilation fails.

These completed results supersede the earlier integration run interrupted by the Docker daemon restart.

## Actual compilation and editability

Every compile payload omitted `original.pdf`, `original-layout.tex` and any PDF background. Only reconstructed TeX and local raster figures were supplied. The compiler generated real PDFs; successful source conversion was not treated as proof of a successful PDF compile. All ten cases below were rerun against the final deployed converter after the complete 46-test pass.

| Case | Resulting pages | Compile | Outside-page characters | Overfull/missing-glyph warnings |
| --- | ---: | --- | ---: | --- |
| Fragmented rules, 18 rows | 1 | Pass | 0 | 0 |
| Prose | 1 | Pass | 0 | 0 |
| Heading and numbered list | 1 | Pass | 0 | 0 |
| Printed equation | 1 | Pass | 0 | 0 |
| Vietnamese scan | 1 | Pass | 0 | 0 |
| Three-page document | 3 | Pass | 0 | 0 |
| Embedded raster figure | 1 | Pass | 0 | 0 |
| Escaped special/LaTeX-like text | 1 | Pass | 0 | 0 |
| Merged table row and column | 1 | Pass | 0 | 0 |
| Edited receipt | 1 | Pass | 0 | 0 |

The edited receipt replaces the short subtitle with a six-sentence paragraph, lengthens a product name so its cell wraps, and adds a new table row with `75.000`, quantity `2`, and `150.000`. The actual recompiled PDF contains all three modifications and retains one page. This verifies ordinary text reflow and editable table rows, rather than positioned words or a raster copy of the source.

Machine-readable compile results are in `assets/pdf-structured/regression-compilation.json`. All twelve compiled regression pages were rendered and visually inspected in `assets/pdf-structured/regression-contact-sheet.png`; no overlapping/clipped text or broken table structure was observed on these fixtures.

## Same-document before/after

The running old converter was captured before deploying new modules. It already kept both receipt outputs to one page, so these fixtures do not support a claim of reducing two pages to one.

| Measure | Old ruled receipt | New ruled receipt | Old borderless receipt | New borderless receipt |
| --- | --- | --- | --- | --- |
| Pages | 1 | 1 | 1 | 1 |
| Page dimensions | Default A4 | Original 595.28 x 708.66 pt | Default A4 | Original 595.28 x 708.66 pt |
| Genuine editable tables | 1, equal columns | 1, measured columns | 0, flattened paragraphs | 1, four columns/four logical rows |
| Product/amount alignment | Lost | Preserved by column | Lost | Preserved by column |
| Footer at bottom | No | Yes | No | Yes |
| Whole-document serif substitution | Yes | No; available family substitute | Yes | No; available family substitute |

The comparison images use the same physical scale for original, old output and new output:

- `assets/pdf-structured/receipt-ruled-comparison.png`
- `assets/pdf-structured/receipt-borderless-comparison.png`

The exact compiled PDFs, reconstructed TeX, source archives and measurements are adjacent. Final deployed comparison results are saved in `assets/pdf-structured/receipt-comparison-metrics.json`; the upstream research/implementation report `pdf-to-latex-layout-upgrade-research.md` explains their limits. Text and numeric overlap are 1.000 for both upgraded receipts. Coarse visual similarity improved from 0.7776 to 0.9627 for the ruled receipt and from 0.5585 to 0.9283 for the borderless receipt. Both have zero coarse content-bound deviation. This is a fixture result, not a general accuracy guarantee.

## Remaining limits

- Full Docling model inference is not installed: this pipeline combines existing local extraction/OCR with Docling Core semantic types and a dedicated renderer.
- Font family/style can be approximated using available Unicode fonts; arbitrary embedded PDF fonts are not copied or promised to be identical.
- Mixed emphasis within a line, complicated columns, diagrams and uncertain borderless/scan tables require review. Warnings identify these cases.
- Printed mathematical notation is preserved; original symbolic equation source and bibliography semantics cannot generally be recovered from a PDF.
- OCR has no trustworthy native-text baseline on image-only documents. Passing the synthetic Vietnamese scan does not establish accuracy on arbitrary scans.
- Visual comparison samples at most five pages and uses coarse thumbnails. It does not certify every glyph, reading order or scientific correctness.
- Layout-aware block spacing deliberately permits reflow after edits. Complex documents can change page count.

No production source or user document was automatically rewritten during validation. These evidence files and regression fixtures can be removed independently of application data.
