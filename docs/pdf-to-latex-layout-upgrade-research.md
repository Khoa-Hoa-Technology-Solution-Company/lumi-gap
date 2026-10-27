# Structured PDF → LaTeX: implementation audit and upstream decisions

Inspected 2026-10-20. This supplements [the earlier upstream evaluation](pdf-to-latex-upstream.md). Existing upstream source checkouts were inspected in ignored scratch storage; no upstream installation scripts were run or code copied into LumiGap.

## What the existing mode actually does

Before this upgrade, `apps/ai-reviewer/app/pdf_to_latex_structured.py` extracted native PDF objects with **pdfplumber** and scanned text with local **Tesseract**. It constructed **Docling Core** document/table types and used the upstream LaTeX serializer. The full neural Docling extraction pipeline and its model weights were not installed. Calling this a full Docling ML conversion would overstate the implementation.

Versions read from the running `lumi-gap-ai-reviewer-1` container:

| Package | Runtime version |
| --- | --- |
| docling-core | 2.99.0 |
| pdfplumber | 0.11.10 |
| pypdfium2 | 5.14.0 |
| pypdf | 6.19.0 |
| Pillow | 12.3.0 |

The local upstream checkouts remain pinned to Docling `d01c9c0991920924cf17f6b8366079ac035ffc38` (declared 2.140.0) and Docling Core `a1a81965908133e97101801416aa576bc4a26c0b` (declared 2.103.0). These are inspected revisions, not a claim about the newest available releases.

## Confirmed causes of layout loss in the old implementation

These findings come from reading LumiGap's converter, rather than inferring from screenshots:

- Every source page was reflowed into a fixed 11-point article with 22 mm margins and a substitute serif font. Source page dimensions, orientation, content margins and font sizes were discarded.
- Short lines triggered paragraph breaks. The paragraph macro added `\medskip`; headings used ordinary section spacing. Dense single-page receipts therefore accumulated artificial vertical whitespace.
- Only default `page.find_tables()` was used. Fragmented rules and credible borderless tables had no recovery pass.
- Empty/merged positions were flattened to blank one-cell values. The renderer replaced upstream column specifications with equal widths, losing actual column proportions and numeric alignment.
- Events were sorted by vertical coordinate alone. This does not establish reading order for columns or key/value groups.
- Text outside table boxes was joined character by character, risking lost word boundaries. Figure crops could include surrounding text.
- Tesseract TSV word X coordinates, width and confidence were discarded after line grouping. Scans therefore lost information needed to detect columns or review uncertain OCR.
- Printed mathematics was escaped as text. No genuine symbolic formula reconstruction was available.

## Upstream findings and integration decisions

### Docling Core: keep the semantic types, own layout rendering

`DoclingDocument` supports hierarchy, ordered content, tables, pictures and source provenance; bounding boxes are optional. Its body tree expresses reading order. These are suitable structured extraction inputs. [Official document model](https://docling-project.github.io/docling/concepts/docling_document/).

The pinned 2.99.0 `TableCell` has bounding boxes, row/column spans and grid offsets. `Formatting` carries bold/italic/script flags, but no PDF font size/family. LumiGap must retain those extra properties in its own intermediate layout model. [Table model](https://github.com/docling-project/docling-core/blob/v2.99.0/docling_core/types/doc/items/table/table_data.py), [formatting model](https://github.com/docling-project/docling-core/blob/v2.99.0/docling_core/types/doc/common/formatting.py).

The 2.99.0 LaTeX table serializer uses left-aligned columns, removes cell line breaks and emits a floating table. It explicitly lacks span support. Its default document preamble uses A4/11pt. The inspected 2.103.0 checkout still lacks table span rendering. Updating the exporter alone would not restore receipt layout. Keep semantic data separate from an application renderer that controls wrapping, widths, spans, alignment and page geometry. [Pinned serializer source](https://github.com/docling-project/docling-core/blob/v2.99.0/docling_core/transforms/serializer/latex.py).

Docling and Docling Core source are MIT licensed; models have their own licensing and resource requirements. The inspected full Docling package includes optional model/runtime dependencies. No full-model integration is claimed here. [Docling license](https://github.com/docling-project/docling/blob/d01c9c0991920924cf17f6b8366079ac035ffc38/LICENSE), [Core license](https://github.com/docling-project/docling-core/blob/v2.99.0/LICENSE), [package definition](https://github.com/docling-project/docling/blob/d01c9c0991920924cf17f6b8366079ac035ffc38/pyproject.toml).

### pdfplumber: reuse existing metadata and table recovery

The existing dependency exposes page geometry, character font/size/coordinates and graphical edges. Its default table strategy uses lines; alternative text/explicit strategies and snap/join/intersection tolerances allow bounded recovery passes. Crop candidate regions before text-based detection; reject weak candidates rather than turning ordinary paragraphs into tables. Normalize top-left coordinates across native text, OCR and semantic provenance. pdfplumber does not perform OCR itself and documents limited support for OCR table extraction. [Official API and table settings](https://github.com/jsvine/pdfplumber#extracting-tables).

### PyMuPDF: researched, not required by this upgrade

PyMuPDF provides layout, rendering, table and OCR integration capabilities, but upstream distributes it under AGPL or commercial terms. Adding it is unnecessary for metadata and thumbnail rendering already available in installed dependencies. This avoids an extra runtime and license decision; it does not imply PyMuPDF lacks the requested capabilities. [Official features and licensing](https://pymupdf.readthedocs.io/en/latest/about.html#license-and-copyright).

### pypdfium2 and Pillow: reuse for bounded comparison

Use the existing PDFium renderer and Pillow for page thumbnails. Explicitly close native page/bitmap handles; run rendering in the isolated worker process, because PDFium is not thread-safe. Comparison must be bounded by input size, page count, sampled pages and pixels. Visual similarity is a layout aid, not evidence of correct content or editability. [Official lifecycle and threading guidance](https://pypdfium2.readthedocs.io/en/stable/python_api.html).

## Implemented comparison and real receipt check

`app/pdf_comparison.py` compares the original bytes with actual compiled PDF bytes. It samples at most five evenly spaced pages per document, renders thumbnails up to 256 pixels on the long side and compares coarse ink masks instead of counting matching white background. It reports source-word recall, symmetric numeric multiset overlap, page-count changes and normalized content-bound deviation. Scans without native text omit text/numeric scores. Inputs are limited to 5 MB/100 source pages and 20 MB/1,000 compiled pages; the isolated caller supplies a hard process deadline in addition to cooperative checks. No dependency was added.

The final before/after PDFs produced by the validation agent, including the footer and wrapped-cell fixes, were compared against `original.pdf` in the same source archives using the running PDF dependency versions above. These replace the preliminary measurements taken before those fixes:

| Fixture | Source → generated pages, before / after | Word recall, before → after | Numeric overlap, before → after | Coarse visual similarity, before → after |
| --- | --- | --- | --- | --- |
| Receipt with ruled table | 1 → 1 / 1 → 1 | 1.000 → 1.000 | 0.938 → 1.000 | 0.778 → 0.963 |
| Borderless receipt | 1 → 1 / 1 → 1 | 1.000 → 1.000 | 0.938 → 1.000 | 0.559 → 0.928 |

These are synthetic test receipts, not a general accuracy benchmark. Both final upgraded outputs have zero coarse content-bound deviation and no `LAYOUT_DIFFERENCE` warning; their only comparison warning is the persistent `VISUAL_COMPARISON_LIMITED` caveat. A high score cannot certify reading order, every glyph or editability. Artifacts are under `docs/assets/pdf-structured/`.

The comparison module's 14 real-PDF unit tests passed in the existing container, including changed/dropped/added numeric occurrences, scans, hidden cropped text, moved content, malformed/encrypted/oversized inputs, five-page sampling of a 100-page source and a 100-to-101-page reflow. No application container was restarted for these tests.

## Limits that must remain explicit

- Confidence-filtered heuristics cannot recover every borderless or merged table.
- OCR confidence and bounding boxes do not guarantee exact Vietnamese names, amounts or equations. Retain source values and require comparison where extraction is uncertain.
- Embedded fonts may lack Unicode mappings or redistribution rights. Substitute available Unicode fonts and flag substitution; do not package arbitrary extracted fonts.
- Native text tokens, numeric occurrences, page count and content bounds are complementary checks. A textless scan has no independently trustworthy text baseline; omit unavailable metrics instead of reporting perfect preservation.
- Page samples and coarse image comparison cannot detect all missing content, scientific mistakes or reading-order errors. The original PDF and real compiled output remain necessary for review.
