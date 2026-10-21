"""Bounded diagnostics for the original PDF and a real compiled PDF.

Metrics describe sampled pages, not scientific correctness or editability. A
textless scan has no trustworthy text baseline and gets no text/number score.
The caller must run this in its isolated, time-limited PDF worker: PDFium is not
thread-safe and a cooperative deadline cannot interrupt native PDF decoding.
"""
from __future__ import annotations

import math
import re
import time
import unicodedata
from collections import Counter
from io import BytesIO
from statistics import mean

import pdfplumber
import pypdfium2
from PIL import Image, ImageChops, ImageFilter

MAX_SOURCE_BYTES = 5 * 1024 * 1024
MAX_GENERATED_BYTES = 20 * 1024 * 1024
MAX_PAGES = 100
MAX_GENERATED_PAGES = 1_000
MAX_SAMPLE_PAGES = 5
MAX_PAGE_CHARS = 50_000
MAX_THUMBNAIL_SIDE = 256
COARSE_SIDE = 64
TIME_BUDGET_SECONDS = 20

_WORD = re.compile(r"[^\W\d_]+(?:[’'\-][^\W\d_]+)*", re.UNICODE)
_NUMBER = re.compile(r"[+\-−]?\d+(?:[.,]\d+)*(?:[%‰])?", re.UNICODE)
_LIGATURES = str.maketrans({"ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl", "ﬃ": "ffi", "ﬄ": "ffl"})


def _check_deadline(deadline: float) -> None:
    if time.monotonic() > deadline:
        raise ValueError("PDF comparison exceeded its time limit")


def _sample_indices(page_count: int) -> list[int]:
    count = min(page_count, MAX_SAMPLE_PAGES)
    if count == 1:
        return [0]
    return [round(index * (page_count - 1) / (count - 1)) for index in range(count)]


def _normalize_text(text: str) -> str:
    text = unicodedata.normalize("NFC", text).translate(_LIGATURES)
    # Hyphenation inserted by line wrapping should not become a missing word.
    return re.sub(r"(?<=\w)-[ \t]*\n[ \t]*(?=\w)", "", text).casefold()


def _number_counter(text: str) -> Counter[str]:
    # Normalize Unicode digits and the mathematical minus, but preserve decimal
    # separators and every occurrence. Do not round or reinterpret money/IDs.
    normalized = "".join(str(unicodedata.decimal(char)) if char.isdecimal() else char for char in text)
    normalized = normalized.replace("−", "-")
    # A space used between three-digit groups is a typographic separator. Never
    # join across a newline, where adjacent cells/rows can contain distinct data.
    normalized = re.sub(r"(?<=\d)[\u00a0\u202f](?=\d{3}(?:\D|$))", "", normalized)
    return Counter(_NUMBER.findall(normalized))


def _ratio(matched: int, total: int) -> float:
    return round(max(0.0, min(1.0, matched / total)), 4)


def _visible_page(page):
    # pdfplumber text extraction uses the media box by default, whereas the
    # rendered PDF shows the crop box. Do not count hidden margin text as lost.
    crop = page.cropbox or page.bbox
    box = (max(page.bbox[0], crop[0]), max(page.bbox[1], crop[1]),
           min(page.bbox[2], crop[2]), min(page.bbox[3], crop[3]))
    if box[0] >= box[2] or box[1] >= box[3]:
        raise ValueError("PDF comparison found invalid page bounds")
    return page.crop(box, strict=False)


def _thumbnail(page) -> Image.Image:
    width, height = page.get_size()
    if not all(math.isfinite(value) and 0 < value <= 20_000 for value in (width, height)):
        raise ValueError("PDF comparison found unsupported page bounds")
    scale = min(1.0, MAX_THUMBNAIL_SIDE / max(width, height))
    bitmap = page.render(scale=scale)
    try:
        # The PIL image can share the native bitmap. Copy before closing it.
        rendered = bitmap.to_pil().convert("L").copy()
    finally:
        bitmap.close()
    if max(rendered.size) > MAX_THUMBNAIL_SIDE + 1:
        rendered.close()
        raise ValueError("PDF comparison render exceeds its pixel limit")
    canvas = Image.new("L", (MAX_THUMBNAIL_SIDE, MAX_THUMBNAIL_SIDE), 255)
    canvas.paste(rendered, ((canvas.width - rendered.width) // 2, (canvas.height - rendered.height) // 2))
    rendered.close()
    return canvas


def _snapshot(data: bytes, maximum_bytes: int, deadline: float, max_pages: int = MAX_PAGES) -> tuple[int, list[dict]]:
    if not isinstance(data, bytes) or not 0 < len(data) <= maximum_bytes or not data.startswith(b"%PDF-"):
        raise ValueError("PDF comparison input exceeds its limits or is not a PDF")
    _check_deadline(deadline)
    snapshots = []
    try:
        with pypdfium2.PdfDocument(data) as document:
            page_count = len(document)
            if not 1 <= page_count <= max_pages:
                raise ValueError(f"PDF comparison supports 1–{max_pages} pages")
            indices = _sample_indices(page_count)
            # Parse only sampled pages, and release each extraction cache.
            with pdfplumber.open(BytesIO(data), pages=[index + 1 for index in indices], unicode_norm="NFC") as extracted:
                if len(extracted.pages) != len(indices):
                    raise ValueError("PDF comparison could not match sampled pages")
                for index, parsed_page in zip(indices, extracted.pages):
                    _check_deadline(deadline)
                    page = document[index]
                    try:
                        text_page = page.get_textpage()
                        try:
                            if text_page.count_chars() > MAX_PAGE_CHARS:
                                raise ValueError("PDF comparison page contains too much text")
                        finally:
                            text_page.close()
                        visible = _visible_page(parsed_page)
                        if len(visible.chars) > MAX_PAGE_CHARS:
                            raise ValueError("PDF comparison page contains too much text")
                        text = visible.extract_text(x_tolerance=2, y_tolerance=3) or ""
                        if len(text) > MAX_PAGE_CHARS:
                            raise ValueError("PDF comparison extracted text exceeds its limit")
                        _check_deadline(deadline)
                        snapshots.append({"text": _normalize_text(text), "image": _thumbnail(page), "size": page.get_size()})
                    finally:
                        page.close()
                        parsed_page.close()
            return page_count, snapshots
    except ValueError:
        for snapshot in snapshots:
            snapshot["image"].close()
        raise
    except Exception as exc:
        for snapshot in snapshots:
            snapshot["image"].close()
        # Keep document text, filenames and parser details out of API errors.
        raise ValueError("PDF comparison could not read the document") from exc


def _ink_mask(image: Image.Image) -> Image.Image:
    ink = image.point(lambda value: 255 if value < 225 else 0)
    coarse = ink.resize((COARSE_SIDE, COARSE_SIDE), Image.Resampling.BOX)
    ink.close()
    mask = coarse.point(lambda value: 255 if value >= 18 else 0)
    coarse.close()
    return mask


def _visual_metrics(source: Image.Image, generated: Image.Image) -> tuple[float, float] | None:
    source_mask, generated_mask = _ink_mask(source), _ink_mask(generated)
    try:
        source_ink = sum(source_mask.histogram()[1:])
        generated_ink = sum(generated_mask.histogram()[1:])
        if not source_ink and not generated_ink:
            return None
        source_bounds, generated_bounds = source_mask.getbbox(), generated_mask.getbbox()
        if not source_bounds or not generated_bounds:
            return 0.0, 1.0
        # Allow one coarse grid cell of displacement. Measure ink overlap,
        # not the white background that dominates a typical academic page.
        source_near = source_mask.filter(ImageFilter.MaxFilter(3))
        generated_near = generated_mask.filter(ImageFilter.MaxFilter(3))
        try:
            hits_a = ImageChops.multiply(source_mask, generated_near)
            hits_b = ImageChops.multiply(generated_mask, source_near)
            try:
                matched = sum(hits_a.histogram()[1:]) + sum(hits_b.histogram()[1:])
            finally:
                hits_a.close()
                hits_b.close()
        finally:
            source_near.close()
            generated_near.close()
        similarity = matched / (source_ink + generated_ink)
        bounds_deviation = sum(abs(left - right) for left, right in zip(source_bounds, generated_bounds)) / (4 * COARSE_SIDE)
        return similarity, bounds_deviation
    finally:
        source_mask.close()
        generated_mask.close()


def compare_pdfs(original: bytes, generated: bytes) -> dict:
    """Compare at most five evenly spaced pages per PDF, without writing files.

    Page indices are independently sampled when page counts differ; resulting
    coverage is diagnostic only and PAGE_COUNT_CHANGED always requests review.
    Numeric coverage is symmetric multiset overlap, so additions and dropped
    repeated amounts both lower it. Text coverage measures source word recall.
    """
    deadline = time.monotonic() + TIME_BUDGET_SECONDS
    source_snapshots: list[dict] = []
    generated_snapshots: list[dict] = []
    try:
        source_pages, source_snapshots = _snapshot(original, MAX_SOURCE_BYTES, deadline)
        generated_pages, generated_snapshots = _snapshot(generated, MAX_GENERATED_BYTES, deadline, MAX_GENERATED_PAGES)
        result = {"status": "compared", "sourcePages": source_pages, "generatedPages": generated_pages,
                  "comparedPages": min(len(source_snapshots), len(generated_snapshots)),
                  "warnings": ["VISUAL_COMPARISON_LIMITED"]}
        warnings = result["warnings"]
        if max(source_pages, generated_pages) > MAX_SAMPLE_PAGES:
            warnings.append("COMPARISON_SAMPLED")
        if source_pages != generated_pages:
            warnings.append("PAGE_COUNT_CHANGED")
        source_text = "\n".join(snapshot["text"] for snapshot in source_snapshots)
        generated_text = "\n".join(snapshot["text"] for snapshot in generated_snapshots)
        source_words, generated_words = Counter(_WORD.findall(source_text)), Counter(_WORD.findall(generated_text))
        if source_words:
            coverage = _ratio(sum((source_words & generated_words).values()), sum(source_words.values()))
            result["textCoverage"] = coverage
            if coverage < 0.96 or sum(generated_words.values()) > sum(source_words.values()) * 1.25:
                warnings.append("TEXT_CONTENT_REVIEW")
        else:
            warnings.append("TEXT_METRICS_UNAVAILABLE")
        source_numbers, generated_numbers = _number_counter(source_text), _number_counter(generated_text)
        if source_text.strip() and (source_numbers or generated_numbers):
            result["numericCoverage"] = _ratio(sum((source_numbers & generated_numbers).values()),
                                               max(sum(source_numbers.values()), sum(generated_numbers.values())))
            if source_numbers != generated_numbers:
                warnings.append("NUMERIC_CONTENT_REVIEW")
        visual, bounds, aspect_differences = [], [], []
        for source_snapshot, generated_snapshot in zip(source_snapshots, generated_snapshots):
            _check_deadline(deadline)
            metrics = _visual_metrics(source_snapshot["image"], generated_snapshot["image"])
            if metrics is not None:
                visual.append(metrics[0])
                bounds.append(metrics[1])
            source_size, generated_size = source_snapshot["size"], generated_snapshot["size"]
            source_aspect, generated_aspect = source_size[0] / source_size[1], generated_size[0] / generated_size[1]
            aspect_differences.append(abs(source_aspect - generated_aspect) / max(source_aspect, generated_aspect))
        if visual:
            result["visualSimilarity"] = round(mean(visual), 4)
            result["contentBoundsDeviation"] = round(mean(bounds), 4)
            if result["visualSimilarity"] < 0.65 or result["contentBoundsDeviation"] > 0.08 or max(aspect_differences) > 0.04:
                warnings.append("LAYOUT_DIFFERENCE")
        return result
    finally:
        for snapshot in source_snapshots + generated_snapshots:
            snapshot["image"].close()
