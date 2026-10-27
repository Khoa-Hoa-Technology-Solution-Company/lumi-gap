# PDF to editable LaTeX with layout priority

- Reuse private manuscript ZIP import, project contribution authorization, existing
  BullMQ AI worker, pdfplumber/pypdf and isolated TeX compiler. No external OCR/LLM.
- Upload at most 5 MB / 100 pages (100,000 words). A background job reconstructs positioned words,
  font style, size and color, over a PDF graphics layer with text removed.
- Compile the converted `main.tex` in the existing isolated compiler while still
  in the import job. Show the actual compiled PDF beside the original before
  explicitly creating a new manuscript. Keep compilation failures distinct from
  conversion failures; never substitute the original PDF for missing output.
  Store preview PDFs privately with the same one-hour TTL and authorization as
  the conversion source. No persisted manuscript is created by previewing.
  Keep text extraction (Docling) under advanced options and explain that it is
  intended for rewriting or OCR rather than preserving page layout.
  Preserve a private original PDF and a separate exact facsimile main document.
  This facsimile embeds PDF pages and does not make their contents editable.
- Default to XeLaTeX. Each page has its own source; positioned words remain
  editable but do not reflow. Font substitutions, formulas, scans and references
  need explicit warnings. No promise of recovering the original semantic TeX.
- Job payloads contain identifiers only. Raw upload and conversion ZIP use Redis
  TTLs of one hour, scoped to actor and project. Recheck write access at upload,
  processing, result access and acceptance. No automatic manuscript creation.
- Idempotent upload/accept; never overwrite existing manuscripts. Durable accepted
  files, versions and collaboration use existing PostgreSQL manuscript persistence.
- Verify converter with real PDFs and compiler; test bad input, TeX escaping,
  permissions, revocation, idempotency, expiry and explicit acceptance.
