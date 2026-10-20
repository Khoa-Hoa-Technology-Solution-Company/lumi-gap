"""Layout-first reconstruction, not recovery of the original semantic TeX source."""
from __future__ import annotations

import base64
import math
from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile

import pdfplumber
from pypdf import PdfReader, PdfWriter, Transformation
from pypdf.generic import NameObject, RectangleObject

MAX_BYTES = 5_000_000
MAX_PAGES = 100
MAX_WORDS = 100_000


def tex_escape(text: str) -> str:
    replacements = {"\\": r"\textbackslash{}", "{": r"\{", "}": r"\}", "$": r"\$",
                    "&": r"\&", "#": r"\#", "%": r"\%", "_": r"\_",
                    "~": r"\textasciitilde{}", "^": r"\textasciicircum{}"}
    return "".join(replacements.get(char, char) for char in text if ord(char) >= 32 and char != "\x7f")


def number(value: float) -> str:
    if not math.isfinite(value) or abs(value) > 20_000:
        raise ValueError("PDF coordinates exceed conversion limits")
    return f"{value:.3f}"


def rgb(value) -> str:
    color = list(value) if isinstance(value, (tuple, list)) else [value or 0]
    if len(color) == 1:
        color *= 3
    elif len(color) == 4:
        c, m, y, k = color
        color = [1 - min(1, c + k), 1 - min(1, m + k), 1 - min(1, y + k)]
    if len(color) != 3 or any(not isinstance(v, (int, float)) or not math.isfinite(v) for v in color):
        color = [0, 0, 0]
    return ",".join(f"{min(1, max(0, v)):.3f}" for v in color)


def prepare_pdf(data: bytes):
    if not data.startswith(b"%PDF-") or len(data) > MAX_BYTES:
        raise ValueError("Choose a PDF no larger than 5 MB")
    reader = PdfReader(BytesIO(data))
    if reader.is_encrypted:
        raise ValueError("Encrypted PDFs cannot be converted; upload an unlocked copy")
    if not 1 <= len(reader.pages) <= MAX_PAGES:
        raise ValueError(f"PDF must contain 1–{MAX_PAGES} pages")
    if reader.get_fields():
        raise ValueError("Flatten PDF form fields before converting")
    writer = PdfWriter()
    for source_page in reader.pages:
        page = writer.add_page(source_page)
        if any(annotation.get_object().get("/Subtype") == "/Widget" for annotation in page.get("/Annots", [])):
            raise ValueError("Flatten PDF form fields before converting")
        contents = page.get_contents()
        if contents and len(contents.get_data()) > 10_000_000:
            raise ValueError("PDF page is too complex to convert")
        # Rebuild a passive document. Do not retain annotations, actions or forms.
        for key in ["/Annots", "/AA", "/PresSteps"]:
            page.pop(NameObject(key), None)
        boxes = [float(value) for box in [page.mediabox, page.cropbox] for value in box]
        unit = float(page.get("/UserUnit", 1))
        if any(not math.isfinite(value) or abs(value) > 10_000_000 for value in boxes) or not math.isfinite(unit) or not 0 < unit <= 75_000:
            raise ValueError("PDF page coordinates exceed conversion limits")
        if page.rotation:
            if page.rotation % 90:
                raise ValueError("PDF page rotation must be a multiple of 90 degrees")
            page.transfer_rotation_to_content()
        # PDF coordinates need not start at zero, and UserUnit scales the
        # physical page. Normalize the visible intersection once, transforming
        # graphics and text together so their positions remain aligned.
        left = max(float(page.mediabox.left), float(page.cropbox.left))
        bottom = max(float(page.mediabox.bottom), float(page.cropbox.bottom))
        right = min(float(page.mediabox.right), float(page.cropbox.right))
        top = min(float(page.mediabox.top), float(page.cropbox.top))
        width, height = (right - left) * unit, (top - bottom) * unit
        if not 72 <= width <= 2000 or not 72 <= height <= 2000:
            raise ValueError("PDF page dimensions exceed conversion limits")
        if left or bottom or unit != 1:
            page.add_transformation(Transformation().translate(-left, -bottom).scale(unit))
        for box in ["/MediaBox", "/CropBox", "/TrimBox", "/BleedBox", "/ArtBox"]:
            page[NameObject(box)] = RectangleObject((0, 0, width, height))
        page.pop(NameObject("/UserUnit"), None)
    normalized = BytesIO()
    writer.write(normalized)
    return reader, writer, normalized.getvalue()


def convert_pdf(data: bytes, mode: str = "layout") -> dict:
    if mode == "structured":
        from app.pdf_to_latex_structured import convert_structured
        return convert_structured(data)
    if mode != "layout":
        raise ValueError("Unknown PDF conversion mode")
    reader, writer, normalized = prepare_pdf(data)
    warnings = [
        "LAYOUT_POSITIONED", "FONT_SUBSTITUTION", "FORMULAS_AND_REFERENCES",
    ]
    files: dict[str, bytes] = {}
    word_count = 0
    with pdfplumber.open(BytesIO(normalized)) as pdf:
        for index, page in enumerate(pdf.pages, 1):
            # Text extraction ignores PDF clipping; explicitly exclude content
            # outside the normalized visible page, including cropped margins.
            page = page.crop(page.bbox)
            width, height = float(page.width), float(page.height)
            if not 72 <= width <= 2000 or not 72 <= height <= 2000:
                raise ValueError("PDF page dimensions exceed conversion limits")
            if len(page.chars) > 30_000:
                raise ValueError("PDF page contains too much text")
            if any(not char.get("upright", True) for char in page.chars):
                raise ValueError("Rotated text is not supported; export a PDF with horizontal text first")
            words = page.extract_words(extra_attrs=["fontname", "size", "non_stroking_color"], return_chars=True)
            word_count += len(words)
            if word_count > MAX_WORDS:
                raise ValueError("PDF contains too much text")
            if not words:
                warnings.append(f"IMAGE_ONLY_PAGE:{index}")
            source = [f"% Page {index}: positioned text; edit each final argument to change a word.",
                      f"\\shipout\\vbox{{\\offinterlineskip\\hbox{{\\special{{papersize={number(width)}bp,{number(height)}bp}}%",
                      f"\\begin{{picture}}({number(width)},{number(height)})",
                      f"\\put(0,0){{\\includegraphics[page={index},width={number(width)}bp,height={number(height)}bp]{{background.pdf}}}}"]
            for word in words:
                text = word["text"]
                if "\ufffd" in text or "(cid:" in text or any(ord(c) < 32 for c in text):
                    raise ValueError("PDF has undecodable text; export with embedded Unicode fonts or use OCR")
                font = word["fontname"].lower()
                family = r"\ttfamily" if any(v in font for v in ["mono", "courier", "typewriter"]) else r"\sffamily" if any(v in font for v in ["sans", "helvetica", "arial"]) else r"\rmfamily"
                style = (r"\bfseries" if "bold" in font else "") + (r"\itshape" if any(v in font for v in ["italic", "oblique"]) else "")
                x = float(word["x0"])
                # The original baseline, independent of the substitute font's metrics.
                y = float(word["chars"][0]["matrix"][5])
                span_width = max(0.1, float(word["x1"]) - x)
                size = float(word["size"])
                if not 1 <= size <= 200:
                    raise ValueError("PDF font size exceeds conversion limits")
                source.append(f"\\put({number(x)},{number(y)}){{\\makebox[0pt][l]{{\\resizebox{{{number(span_width)}bp}}{{!}}{{{{{family}{style}\\fontsize{{{number(size)}bp}}{{{number(size)}bp}}\\selectfont\\color[rgb]{{{rgb(word['non_stroking_color'])}}} {tex_escape(text)}}}}}}}}}")
            source.append(r"\end{picture}}}")
            content = "\n".join(source).encode("utf-8")
            if len(content) > 500_000:
                raise ValueError("Reconstructed page exceeds manuscript source limits")
            files[f"pages/page-{index}.tex"] = content
            page.close()
    if word_count == 0:
        raise ValueError("PDF contains no editable text; OCR is required for scanned PDFs")
    writer.remove_text()
    background = BytesIO()
    writer.write(background)
    if len(background.getvalue()) > MAX_BYTES:
        raise ValueError("PDF graphics layer exceeds 5 MB")
    files["background.pdf"] = background.getvalue()
    # Private reference only; the UI renders pixels, never PDF scripting or forms.
    files["original.pdf"] = data
    main = "\n".join([
        "% Reconstructed layout. Compile with XeLaTeX. This is not the original semantic source.",
        r"\documentclass{article}", r"\usepackage{fontspec,graphicx,xcolor}",
        r"\setmainfont{DejaVu Serif}", r"\setsansfont{DejaVu Sans}", r"\setmonofont{DejaVu Sans Mono}",
        r"\setlength{\hoffset}{-1in}", r"\setlength{\voffset}{-1in}", r"\setlength{\unitlength}{1bp}",
        r"\begin{document}", *[f"\\input{{pages/page-{i}.tex}}" for i in range(1, len(reader.pages) + 1)],
        r"\end{document}", "",
    ])
    files["main.tex"] = main.encode()
    files["original-layout.tex"] = (r"\documentclass{article}" + "\n" + r"\usepackage{pdfpages}" + "\n" +
                                     r"\begin{document}\includepdf[pages=-,fitpaper=true]{original.pdf}\end{document}" + "\n").encode()
    files["conversion-notes.txt"] = ("PDF layout reconstruction. Compile main.tex with XeLaTeX.\n"
        "Edit pages/page-N.tex. Words are positioned and do not reflow. Original fonts are substituted.\n"
        "Equations and citations are extracted text, not semantic math or bibliography entries.\n"
        "original-layout.tex embeds original.pdf unchanged visually; that mode is NOT editable text.\n"
        "Compare the reconstructed PDF with original.pdf before using it.\n" + "\n".join(warnings)).encode()
    archive = BytesIO()
    with ZipFile(archive, "w", ZIP_DEFLATED) as zip_file:
        for name, content in files.items():
            zip_file.writestr(name, content)
    if len(archive.getvalue()) > 10_000_000 or sum(map(len, files.values())) > 20_000_000:
        raise ValueError("Converted manuscript exceeds import limits")
    return {"archive": base64.b64encode(archive.getvalue()).decode(), "pageCount": len(reader.pages),
            "wordCount": word_count, "warnings": warnings, "preview": files["pages/page-1.tex"].decode()[:12_000]}
