"""PDF/OCR -> Docling semantic/layout IR -> editable LaTeX.

The default source is standalone. original.pdf is a reference for comparison,
never a page background for reconstructed content. No model is downloaded and
no document is sent to a remote service by this converter.
"""
from __future__ import annotations

import base64
import csv
import json
import math
import shutil
import subprocess
from io import BytesIO, StringIO
from zipfile import ZIP_DEFLATED, ZipFile

from app.pdf_to_latex import prepare_pdf
from app.pdf_structured_layout import clean, extract_document
from app.pdf_structured_render import render


def ocr_lines(page):
    if not shutil.which("tesseract"):
        raise ValueError("OCR is not installed on the conversion server")
    if page.width * page.height * 4 > 12_000_000:
        raise ValueError("Scanned page is too large for OCR")
    image = page.to_image(resolution=144).original.convert("RGB")
    png = BytesIO()
    image.save(png, format="PNG")
    try:
        result = subprocess.run(
            ["tesseract", "stdin", "stdout", "-l", "eng+vie", "--psm", "3", "tsv"],
            input=png.getvalue(), stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            timeout=20, check=True,
        )
    except (subprocess.SubprocessError, OSError) as exc:
        raise ValueError("OCR could not read this page within its limits") from exc
    if len(result.stdout) > 2_000_000:
        raise ValueError("OCR output exceeds conversion limits")
    groups = {}
    try:
        for row in csv.DictReader(StringIO(result.stdout.decode("utf-8")), delimiter="\t"):
            if row["level"] != "5" or not row["text"].strip():
                continue
            x, y, width, height = (int(row[key]) / 2 for key in ["left", "top", "width", "height"])
            confidence = float(row["conf"])
            if (not math.isfinite(confidence) or width < 0 or height <= 0 or x < 0 or y < 0 or
                    x + width > page.width + 2 or y + height > page.height + 2):
                raise ValueError("OCR returned invalid page coordinates")
            word = {"text": clean(row["text"]), "x0": x, "x1": x + width, "top": y, "bottom": y + height,
                    "size": max(4, min(72, height * 0.9)), "fontname": "OCR", "confidence": max(0, confidence) / 100}
            # Keep boxes/confidence: OCR table reconstruction needs the same
            # coordinate system as native glyphs, not just a flat text string.
            word["chars"] = [{**word}]
            key = (row["block_num"], row["par_num"], row["line_num"])
            groups.setdefault(key, []).append(word)
    except (KeyError, TypeError, UnicodeError) as exc:
        raise ValueError("OCR returned invalid structured text") from exc
    lines = []
    for words in groups.values():
        words.sort(key=lambda word: word["x0"])
        lines.append({"text": " ".join(word["text"] for word in words),
                      "top": min(word["top"] for word in words),
                      "bottom": max(word["bottom"] for word in words),
                      "words": words, "chars": [char for word in words for char in word["chars"]]})
    return sorted(lines, key=lambda line: line["top"])


def convert_structured(data: bytes) -> dict:
    reader, _, normalized = prepare_pdf(data)
    document = extract_document(normalized, ocr_lines)
    files, blocks, word_count = render(document)
    files["original.pdf"] = data
    # Retained for backwards-compatible downloads, but never loaded by main.tex.
    files["original-layout.tex"] = (r"\documentclass{article}\usepackage{pdfpages}" + "\n" +
        r"\begin{document}\includepdf[pages=-,fitpaper=true]{original.pdf}\end{document}").encode()
    warnings = sorted(set(document.warnings))
    files["conversion-notes.txt"] = (
        "LumiGap structured reconstruction: pdfplumber 0.11 + Docling Core 2.99 semantic models.\n"
        "No Docling ML pipeline, downloaded weights, remote OCR or remote document service is used.\n"
        "Native glyph/rule boxes and OCR word boxes map to a top-left PDF-point semantic/layout IR.\n"
        "Source page dimensions, approximate margins, typography families, alignment and block spacing are retained.\n"
        "Ruled and high-confidence aligned numeric borderless tables are real editable LaTeX tables.\n"
        "Fonts are substituted by family; text reflows when edited. Pagination can change after edits.\n"
        "Table inference, OCR, merged cells and multi-column reading order require human review.\n"
        "Printed equations/reference text are preserved, not guessed as recovered formula/BibTeX source.\n"
        "Vector-only illustrations may require manual recovery; original.pdf is only a comparison reference.\n"
        + json.dumps(document.summary(), ensure_ascii=False) + "\n" + "\n".join(warnings)
    ).encode("utf-8")
    if len(files) > 200 or sum(map(len, files.values())) > 20_000_000:
        raise ValueError("Converted manuscript exceeds import limits")
    archive = BytesIO()
    with ZipFile(archive, "w", ZIP_DEFLATED) as target:
        for name, content in files.items():
            target.writestr(name, content)
    if archive.tell() > 10_000_000:
        raise ValueError("Converted manuscript exceeds import limits")
    return {"archive": base64.b64encode(archive.getvalue()).decode(), "pageCount": len(reader.pages),
            "wordCount": word_count, "warnings": warnings, "preview": files["pages/page-1.tex"].decode()[:12_000],
            "blocks": blocks, "layout": document.summary()}
