"""Map Docling Core semantic items to measured PDF/OCR layout metadata.

No remote inference or model download is involved. pdfplumber supplies native
glyphs/rules; OCR supplies word boxes. Ambiguous structure is retained as text.
"""
from __future__ import annotations

import re
from collections import Counter
from io import BytesIO
from statistics import median

import pdfplumber
from docling_core.types.doc import DoclingDocument, DocItemLabel
from docling_core.types.doc import TableCell as DoclingCell, TableData

from app.pdf_structured_model import Block, Document, Page, Table, TableCell, TextStyle

NUMERIC = re.compile(r"^[\s\d.,+−\-()%/₫đĐ$€£¥:%]+$")
LIST_MARKER = re.compile(r"^\s*(?:([•●▪◦\-–])\s+|(\d{1,3})[.)]\s+)(.+)$")


def clean(text: str) -> str:
    if "\ufffd" in text or "(cid:" in text:
        raise ValueError("PDF text cannot be decoded reliably; upload an OCR copy")
    return " ".join("".join(c for c in text if c.isspace() or (ord(c) >= 32 and c != "\x7f")).split())


def box_for(chars, fallback=(0.0, 0.0, 0.0, 0.0)):
    if not chars:
        return fallback
    return (min(float(c["x0"]) for c in chars), min(float(c["top"]) for c in chars),
            max(float(c["x1"]) for c in chars), max(float(c["bottom"]) for c in chars))


def inside(char, box):
    x, y = (float(char["x0"]) + float(char["x1"])) / 2, (float(char["top"]) + float(char["bottom"])) / 2
    return box[0] - 0.3 <= x <= box[2] + 0.3 and box[1] - 0.3 <= y <= box[3] + 0.3


def text_style(chars, default=None):
    default = default or TextStyle()
    useful = [c for c in chars if c.get("text", "").strip()]
    if not useful:
        return default
    sizes = [min(72.0, max(4.0, float(c.get("size", default.size)))) for c in useful]
    font = Counter(str(c.get("fontname", "")) for c in useful).most_common(1)[0][0]
    name = font.lower()
    family = "mono" if any(s in name for s in ("mono", "courier", "typewriter")) else (
        "sans" if any(s in name for s in ("sans", "helvetica", "arial", "gothic")) else "serif")
    size = median(sizes)
    return TextStyle(size=size, leading=size * 1.15, family=family,
                     bold=sum("bold" in str(c.get("fontname", "")).lower() for c in useful) > len(useful) / 2,
                     italic=sum(any(s in str(c.get("fontname", "")).lower() for s in ("italic", "oblique")) for c in useful) > len(useful) / 2,
                     source_font=font[:160])


def line_text(chars):
    result, previous = [], None
    for char in sorted(chars, key=lambda c: float(c["x0"])):
        text = char.get("text", "")
        if previous is not None:
            gap = float(char["x0"]) - float(previous["x1"])
            if gap > max(1.5, float(char.get("size", 11)) * 0.18) and result and not result[-1].endswith(" "):
                result.append(" ")
        result.append(text)
        previous = char
    return clean("".join(result))


def split_wide_gaps(lines, body, page_width, warnings, page_number):
    result = []
    for index, line in enumerate(lines):
        groups, previous = [[]], None
        for char in sorted(line.get("chars", []), key=lambda c: float(c["x0"])):
            if previous is not None and float(char["x0"]) - float(previous["x1"]) > max(body.size * 4, page_width * 0.075):
                groups.append([])
            groups[-1].append(char)
            previous = char
        if len(groups) == 1:
            result.append(line)
            continue
        # This is block-level column separation, never per-word positioning.
        # Metadata siblings can share one reflowable horizontal row.
        texts = [line_text(group) for group in groups]
        metadata = all(":" in text and len(text) < 200 for text in texts)
        tag = f"p{page_number}r{index}" if metadata else ""
        if not metadata:
            warnings.append(f"MULTICOLUMN_REVIEW_PAGE:{page_number}")
        for chars, text in zip(groups, texts):
            result.append({**line, "chars": chars, "text": text, "row_group": tag})
    return result


def numeric(text):
    inspected = re.sub(r"\b(?:VND|USD|EUR|GBP|JPY|CNY|AUD|CAD)\b", "", text, flags=re.IGNORECASE).strip()
    return bool(re.search(r"\d", inspected) and (NUMERIC.fullmatch(inspected) or
                re.fullmatch(r"[+−\-]?\d+(?:[.,]\d+)?[eE][+−\-]?\d+", inspected)))


def column_alignment(cells, column):
    values = [cell.text for cell in cells if cell.column == column and cell.row > 0 and cell.text]
    if values and sum(numeric(text) for text in values) >= max(1, len(values) * 0.75):
        # Quantities are centred only with a matching header. A short integer
        # can be a currency amount too; its digit count is not a safe signal.
        header = " ".join(cell.text for cell in cells if cell.column == column and cell.row == 0).casefold()
        quantity = bool(re.search(r"\b(?:quantity|qty|count|số lượng|sl)\b", header))
        return "center" if quantity else "right"
    return "left"


def ruled_tables(page, body, warnings, page_number):
    # Joining short rule fragments is bounded to a few glyph widths. Broad
    # tolerances would merge independent receipt boxes into invented cells.
    found = page.find_tables(table_settings={"snap_tolerance": 3, "join_tolerance": 6,
                                            "intersection_tolerance": 5, "edge_min_length": 5})
    if len(found) > 25:
        raise ValueError("PDF has too many tables")
    result = []
    for source in found:
        if len(source.rows) < 2 or len(source.columns) < 2:
            continue
        xs = sorted(set(round(float(x), 2) for box in source.cells for x in (box[0], box[2])))
        ys = sorted(set(round(float(y), 2) for box in source.cells for y in (box[1], box[3])))
        rows, cols = len(ys) - 1, len(xs) - 1
        if not rows or not cols or cols > 20 or rows * cols > 500:
            raise ValueError("Table exceeds editable conversion limits")
        cells = []
        for box in source.cells:
            left, top, right, bottom = (round(float(v), 2) for v in box)
            chars = [c for c in page.chars if inside(c, box)]
            crop = page.crop(tuple(box))
            # extract_text preserves spaces inside multiline cell labels.
            text = clean(crop.extract_text(x_tolerance=2, y_tolerance=3) or "")
            cells.append(TableCell(text, ys.index(top), xs.index(left),
                                   ys.index(bottom) - ys.index(top), xs.index(right) - xs.index(left),
                                   tuple(box), style=text_style(chars, body)))
        if sum(bool(c.text) for c in cells) < 2:
            continue
        for cell in cells:
            cell.alignment = column_alignment(cells, cell.column)
        first = [c for c in cells if c.row == 0]
        header = bool(first and (any(c.style.bold for c in first) or
                               (not any(numeric(c.text) for c in first) and
                                any(numeric(c.text) for c in cells if c.row > 0))))
        table = Table(rows, cols, cells, [xs[i + 1] - xs[i] for i in range(cols)],
                      header_rows=int(header), confidence=0.98)
        measured_style = text_style([c for c in page.chars if inside(c, source.bbox)], body)
        result.append(Block("table", tuple(source.bbox), style=measured_style, table=table))
    return result


def word_rows(words, size):
    rows = []
    for word in sorted(words, key=lambda w: (float(w["top"]), float(w["x0"]))):
        center = (float(word["top"]) + float(word["bottom"])) / 2
        candidates = [r for r in rows[-3:] if abs(r["center"] - center) <= max(3, size * 0.35)]
        if candidates:
            row = min(candidates, key=lambda r: abs(r["center"] - center))
            row["words"].append(word)
        else:
            rows.append({"center": center, "words": [word]})
    for row in rows:
        parts, previous = [], None
        for word in sorted(row["words"], key=lambda w: float(w["x0"])):
            if previous is None or float(word["x0"]) - float(previous["x1"]) > max(12, size * 1.5):
                parts.append({"text": word["text"], "x0": float(word["x0"]), "x1": float(word["x1"]), "words": [word]})
            else:
                parts[-1]["text"] += " " + word["text"]
                parts[-1]["x1"] = float(word["x1"])
                parts[-1]["words"].append(word)
            previous = word
        row["parts"] = parts
        row["top"] = min(float(w["top"]) for w in row["words"])
        row["bottom"] = max(float(w["bottom"]) for w in row["words"])
    return sorted(rows, key=lambda r: r["top"])


def inferred_tables(words, existing, body, warnings, page_number):
    rows = word_rows([w for w in words if not any(inside(w, b.bbox) for b in existing)], body.size)
    # Require repeated separated columns and at least two numeric columns.
    # Ordinary multi-column prose must never become an inferred data table.
    candidates = [i for i, row in enumerate(rows) if 3 <= len(row["parts"]) <= 12 and
                  sum(numeric(part["text"]) for part in row["parts"]) >= 2]
    groups = []
    for index in candidates:
        row = rows[index]
        if groups:
            previous = rows[groups[-1][-1]]
            aligned = len(previous["parts"]) == len(row["parts"]) and all(
                abs(a["x1"] - b["x1"]) <= max(18, body.size * 2.5)
                for a, b in zip(previous["parts"][1:], row["parts"][1:]))
            intervening = rows[groups[-1][-1] + 1:index]
            continuation = all(len(r["parts"]) <= 2 and not any(numeric(p["text"]) for p in r["parts"])
                               for r in intervening)
            if index - groups[-1][-1] <= 4 and row["top"] - previous["bottom"] <= body.size * 4 and aligned and continuation:
                groups[-1].append(index)
                continue
        groups.append([index])
    result = []
    for group in groups:
        if len(group) < 2:
            continue
        data_rows = [rows[i] for i in group]
        columns = len(data_rows[0]["parts"])
        lefts = [median(row["parts"][i]["x0"] for row in data_rows) for i in range(columns)]
        rights = [max(row["parts"][i]["x1"] for row in data_rows) for i in range(columns)]
        boundaries = [min(r["parts"][0]["x0"] for r in data_rows)] + [
            (rights[i - 1] + lefts[i]) / 2 for i in range(1, columns)] + [max(rights[-1], lefts[-1] + body.size * 2)]
        if any(boundaries[i + 1] - boundaries[i] < body.size for i in range(columns)):
            continue
        start, end, header = group[0], group[-1], 0
        # A wrapped header (e.g. "Số" / "lượng") has a sparse final
        # physical line. Match the actual aligned header above that line.
        for before_index in range(start - 1, max(-1, start - 4), -1):
            before = rows[before_index]
            if data_rows[0]["top"] - before["bottom"] > body.size * 4:
                break
            if len(before["parts"]) == columns and all(
                    boundaries[i] - body.size <= (part["x0"] + part["x1"]) / 2 <= boundaries[i + 1] + body.size
                    for i, part in enumerate(before["parts"])):
                start = before_index
                header = 1
                boundaries[0] = min(boundaries[0], before["parts"][0]["x0"])
                boundaries[-1] = max(boundaries[-1], before["parts"][-1]["x1"])
                break
            if len(before["parts"]) > 1:
                break
        if not header and len(group) < 3:
            continue
        selected = rows[start:end + 1]
        cells, logical_rows = [], []
        valid = True
        for row in selected:
            assignments = [[] for _ in range(columns)]
            for word in row["words"]:
                center = (float(word["x0"]) + float(word["x1"])) / 2
                column = next((c for c in range(columns) if boundaries[c] - 0.5 <= center <= boundaries[c + 1] + 0.5), None)
                if column is None:
                    valid = False
                    break
                assignments[column].append(word)
            if not valid:
                break
            texts = [clean(" ".join(w["text"] for w in sorted(values, key=lambda w: float(w["x0"])))) for values in assignments]
            sparse_continuation = (logical_rows and sum(bool(text) for text in texts) < columns and
                                   not any(numeric(text) for text in texts if text) and
                                   row["top"] - logical_rows[-1]["bottom"] <= body.size * 1.8)
            if sparse_continuation:
                for c, values in enumerate(assignments):
                    logical_rows[-1]["assignments"][c].extend(values)
                logical_rows[-1]["bottom"] = row["bottom"]
            else:
                logical_rows.append({"assignments": assignments, "bottom": row["bottom"]})
        for r, row in enumerate(logical_rows):
            for c, values in enumerate(row["assignments"]):
                # Text order is top-to-bottom within a cell, not globally x
                # sorted: a wrapped product name must not be interleaved.
                values.sort(key=lambda w: (round(float(w["top"]) / max(3, body.size * 0.5)), float(w["x0"])))
                text = clean(" ".join(w["text"] for w in values))
                cells.append(TableCell(text, r, c, bbox=box_for(values) if values else None,
                                       style=text_style([ch for w in values for ch in w.get("chars", [])], body)))
        if not valid or len(logical_rows) * columns > 500:
            continue
        confidence = min(0.86, sum(float(w.get("confidence", 1)) for row in selected for w in row["words"]) /
                         max(1, sum(len(row["words"]) for row in selected)))
        if confidence < 0.65:
            warnings.append(f"LOW_CONFIDENCE_TABLE_REVIEW_PAGE:{page_number}")
            continue
        for cell in cells:
            cell.alignment = column_alignment(cells, cell.column)
        bbox = (boundaries[0], selected[0]["top"] - 1, boundaries[-1], selected[-1]["bottom"] + 1)
        measured_style = text_style([char for row in selected for word in row["words"] for char in word.get("chars", [])], body)
        result.append(Block("table", bbox, style=measured_style, confidence=confidence,
                            table=Table(len(logical_rows), columns, cells,
                                        [boundaries[i + 1] - boundaries[i] for i in range(columns)],
                                        ruled=False, header_rows=header, confidence=confidence)))
        warnings.append(f"INFERRED_TABLE_REVIEW_PAGE:{page_number}")
    return result


def infer_alignment(box, page_width, content_left, content_right, text):
    tolerance = max(5, page_width * 0.012)
    if abs((box[0] + box[2]) / 2 - page_width / 2) < tolerance and box[2] - box[0] < (content_right - content_left) * 0.9:
        return "center"
    if abs(box[2] - content_right) < tolerance and box[0] > content_left + (content_right - content_left) * 0.25:
        return "right"
    return "left"


def extract_document(normalized, ocr_reader):
    document = Document([], ["STRUCTURED_REFLOW", "FONT_SUBSTITUTION", "FORMULAS_AND_REFERENCES", "READING_ORDER_REVIEW"])
    with pdfplumber.open(BytesIO(normalized)) as pdf:
        for page_number, raw in enumerate(pdf.pages, 1):
            page = raw.crop(raw.bbox)
            if not 72 <= page.width <= 2000 or not 72 <= page.height <= 2000 or len(page.chars) > 30_000:
                raise ValueError("PDF page exceeds conversion limits")
            if len(page.edges) > 4000:
                raise ValueError("PDF has too many drawing edges")
            native = [c for c in page.chars if c.get("text", "").strip()]
            undecodable = any("\ufffd" in c.get("text", "") or "(cid:" in c.get("text", "") for c in native)
            full_raster = any((float(i["x1"]) - float(i["x0"])) *
                              (float(i["bottom"]) - float(i["top"])) > page.width * page.height * 0.8
                              for i in page.images)
            scan = not native or undecodable or (full_raster and len(native) < 40)
            if scan and native:
                document.warnings.append(f"UNRELIABLE_TEXT_LAYER_OCR_PAGE:{page_number}")
            lines = ocr_reader(page) if scan else page.extract_text_lines(return_chars=True)
            if scan:
                document.warnings.append(f"OCR_REVIEW_PAGE:{page_number}")
                document.warnings.append(f"SCAN_GRAPHICS_REVIEW_PAGE:{page_number}")
                document.omitted_or_uncertain_blocks += 1
            chars = [c for line in lines for c in line.get("chars", [])]
            body = text_style(chars)
            if any(not c.get("upright", True) for c in native):
                document.warnings.append(f"ROTATED_TEXT_REVIEW_PAGE:{page_number}")
            words = [word for line in lines for word in line.get("words", [])] if scan else page.extract_words(return_chars=True)
            blocks = [] if scan else ruled_tables(page, body, document.warnings, page_number)
            blocks.extend(inferred_tables(words, blocks, body, document.warnings, page_number))
            if len(blocks) > 25:
                raise ValueError("PDF has too many tables")
            paragraph = []

            def flush():
                if not paragraph:
                    return
                text = clean(" ".join(line["text"] for line in paragraph))
                group_chars = [c for line in paragraph for c in line.get("chars", [])]
                bbox = box_for(group_chars, (0, paragraph[0]["top"], page.width, paragraph[-1]["bottom"]))
                style = text_style(group_chars, body)
                emphases = {(any(s in str(c.get("fontname", "")).lower() for s in ("bold",)),
                             any(s in str(c.get("fontname", "")).lower() for s in ("italic", "oblique")))
                            for c in group_chars if c.get("text", "").strip()}
                if len(emphases) > 1:
                    document.warnings.append(f"MIXED_INLINE_STYLE_REVIEW_PAGE:{page_number}")
                gaps = [paragraph[i + 1]["top"] - paragraph[i]["top"] for i in range(len(paragraph) - 1)]
                if gaps:
                    style.leading = max(style.size, min(style.size * 1.8, median(gaps)))
                kind = "heading" if len(text) <= 180 and (style.size >= body.size * 1.18 or
                        (style.bold and len(text) <= 100 and len(paragraph) == 1)) else "paragraph"
                marker = LIST_MARKER.match(text)
                block = Block(kind, bbox, text=text, style=style, confidence=0.8 if scan else 0.95)
                if len(paragraph) == 1:
                    block.row_group = paragraph[0].get("row_group", "")
                if marker:
                    block.kind, block.ordered, block.list_items = "list", bool(marker.group(2)), [marker.group(3)]
                    block.list_start = int(marker.group(2)) if marker.group(2) else 1
                elif re.match(r"^(?:grand total|sub\s?total|total|tổng(?:\s+cộng|\s+tiền)?)\s*:", text, re.IGNORECASE) and re.search(r"\d", text):
                    block.kind = "total"
                elif re.match(r"^(?:notes?|ghi chú|lưu ý)\s*:", text, re.IGNORECASE):
                    block.kind = "note"
                elif len(text) < 200 and re.match(r"^[^:]{2,60}:\s*\S", text):
                    block.kind = "key_value"
                elif bbox[1] > page.height * 0.9 and style.size <= body.size:
                    block.kind = "footer"
                # Printed mathematical glyphs are never interpreted as a
                # recoverable TeX equation: source is escaped, not guessed.
                if re.search(r"[∑∫√≈≤≥∂∞]", text):
                    document.warnings.append(f"PRINTED_MATH_REVIEW_PAGE:{page_number}")
                blocks.append(block)
                paragraph.clear()

            separated_lines = split_wide_gaps(lines, body, page.width, document.warnings, page_number)
            for line in sorted(separated_lines, key=lambda l: (l["top"], box_for(l.get("chars", []))[0])):
                line = {**line, "text": clean(line["text"])}
                remaining = [c for c in line.get("chars", []) if not any(inside(c, b.bbox) for b in blocks if b.table)]
                if len(remaining) != len(line.get("chars", [])):
                    flush()
                    if not remaining:
                        continue
                    line = {**line, "chars": remaining, "text": line_text(remaining)}
                if not line["text"]:
                    continue
                style = text_style(line.get("chars", []), body)
                box = box_for(line.get("chars", []))
                if paragraph:
                    previous = paragraph[-1]
                    prevstyle = text_style(previous.get("chars", []), body)
                    prevbox = box_for(previous.get("chars", []))
                    if (line["top"] - previous["bottom"] > body.size * 0.65 or
                        line.get("row_group") or previous.get("row_group") or
                        abs(style.size - prevstyle.size) > 1.2 or style.bold != prevstyle.bold or
                        box[0] > prevbox[0] + body.size * 2 or box[2] < prevbox[0] or
                        bool(LIST_MARKER.match(line["text"])) or bool(LIST_MARKER.match(previous["text"])) or
                        (len(previous["text"]) < 110 and ":" in previous["text"] and line["top"] > previous["bottom"] + 2)):
                        flush()
                paragraph.append(line)
            flush()
            if scan and not blocks:
                raise ValueError("OCR found no readable text; upload a clearer scan")
            if not scan:
                if len(page.images) > 50:
                    raise ValueError("PDF has too many figures")
                for image in page.images:
                    box = (max(0, float(image["x0"])), max(0, float(image["top"])),
                           min(page.width, float(image["x1"])), min(page.height, float(image["bottom"])))
                    if box[2] <= box[0] or box[3] <= box[1]:
                        continue
                    if (box[2] - box[0]) * (box[3] - box[1]) > page.width * page.height * 0.8:
                        document.warnings.append(f"SCAN_BACKGROUND_OMITTED_PAGE:{page_number}")
                        document.omitted_or_uncertain_blocks += 1
                        continue
                    if any(box[0] <= b.bbox[0] and box[1] <= b.bbox[1] and box[2] >= b.bbox[2] and box[3] >= b.bbox[3] for b in blocks):
                        document.warnings.append(f"TEXT_IMAGE_OVERLAP_REVIEW_PAGE:{page_number}")
                        document.omitted_or_uncertain_blocks += 1
                        continue
                    if len(document.assets) >= 90:
                        raise ValueError("PDF contains too many figures")
                    path = f"figures/figure-{len(document.assets) + 1}.png"
                    output = BytesIO()
                    if (box[2] - box[0]) * (box[3] - box[1]) * (110 / 72) ** 2 > 12_000_000:
                        raise ValueError("Extracted figure exceeds rasterization limits")
                    page.crop(box).to_image(resolution=110).original.save(output, format="PNG")
                    if output.tell() > 5_000_000:
                        raise ValueError("Extracted figure exceeds import limits")
                    document.assets[path] = output.getvalue()
                    blocks.append(Block("figure", box, image_path=path))
            curves = [curve for curve in page.curves if not any(inside(curve, b.bbox) for b in blocks if b.table)]
            if curves:
                document.warnings.append(f"VECTOR_GRAPHICS_REVIEW_PAGE:{page_number}")
                document.omitted_or_uncertain_blocks += 1
            blocks.sort(key=lambda b: (round(b.bbox[1] / max(body.size * 0.4, 1)), b.bbox[0]))
            merged = []
            for block in blocks:
                previous = merged[-1] if merged else None
                if (previous and block.kind == previous.kind == "list" and block.ordered == previous.ordered and
                        (not block.ordered or block.list_start == previous.list_start + len(previous.list_items)) and
                        abs(block.bbox[0] - previous.bbox[0]) <= body.size and
                        0 <= block.bbox[1] - previous.bbox[3] <= body.size * 1.8 and
                        abs(block.style.size - previous.style.size) < 1):
                    previous.list_items.extend(block.list_items)
                    previous.text += " " + block.text
                    previous.bbox = (min(previous.bbox[0], block.bbox[0]), previous.bbox[1],
                                     max(previous.bbox[2], block.bbox[2]), block.bbox[3])
                else:
                    merged.append(block)
            blocks = merged
            if (blocks and blocks[-1].kind in {"paragraph", "key_value", "footer"} and
                    blocks[-1].bbox[1] >= page.height * 0.8 and blocks[-1].style.size <= body.size * 1.05):
                blocks[-1].kind = "footer"
            content_left = min((b.bbox[0] for b in blocks), default=36)
            content_right = max((b.bbox[2] for b in blocks), default=page.width - 36)
            # A tiny text island is not the full writing width of a document.
            if content_right - content_left < page.width * 0.45:
                content_right = max(content_right, page.width - min(content_left, page.width * 0.1))
            left = max(6, min(content_left, page.width * 0.25))
            right = max(6, min(page.width - content_right, page.width * 0.25))
            top = max(6, min(min((b.bbox[1] for b in blocks), default=36), page.height * 0.25))
            bottom = max(6, min(page.height - max((b.bbox[3] for b in blocks), default=page.height - 36), page.height * 0.08))
            docling = DoclingDocument(name=f"Page {page_number}")
            previous_bottom = top
            for order, block in enumerate(blocks):
                block.spacing = max(0, min(block.bbox[1] - previous_bottom, body.size * 2))
                block.alignment = infer_alignment(block.bbox, page.width, content_left, content_right, block.text)
                previous_bottom = max(previous_bottom, block.bbox[3])
                if block.table:
                    table = block.table
                    item = docling.add_table(data=TableData(num_rows=table.rows, num_cols=table.columns,
                        table_cells=[DoclingCell(text=c.text, start_row_offset_idx=c.row,
                            end_row_offset_idx=c.row + c.row_span, start_col_offset_idx=c.column,
                            end_col_offset_idx=c.column + c.column_span, row_span=c.row_span,
                            col_span=c.column_span, column_header=c.row < table.header_rows) for c in table.cells]))
                elif block.text:
                    label = DocItemLabel.SECTION_HEADER if block.kind == "heading" else DocItemLabel.TEXT
                    item = docling.add_text(label=label, text=block.text)
                else:
                    continue
                block.source_ref = item.self_ref
            document.pages.append(Page(page_number, float(page.width), float(page.height),
                                       (left, top, right, bottom), body, blocks, scan))
            page.close()
    return document
