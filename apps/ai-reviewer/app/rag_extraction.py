"""Bounded, page-preserving extraction. No LLM calls and no remote URL fetching."""
from __future__ import annotations

from io import BytesIO
from pypdf import PdfReader
from app.pdf_utils import clean_text

MAX_BYTES = 25 * 1024 * 1024
MAX_PAGES = 200
MAX_CHARS = 600_000


def extract_rag_pages(data: bytes) -> dict:
    if len(data) > MAX_BYTES or not data.startswith(b"%PDF-"):
        raise ValueError("A PDF of at most 25 MiB is required")
    reader = PdfReader(BytesIO(data))
    if reader.is_encrypted:
        raise ValueError("Encrypted PDFs cannot be indexed")
    if not reader.pages or len(reader.pages) > MAX_PAGES:
        raise ValueError("PDF must contain between 1 and 200 pages")
    pages = []
    total = 0
    empty_pages = []
    for number, page in enumerate(reader.pages, 1):
        # Limit pathological decompression before extracting page operators.
        contents = page.get_contents()
        if contents and len(contents.get_data()) > 10 * 1024 * 1024:
            raise ValueError("PDF page content exceeds extraction limits")
        text = clean_text(page.extract_text() or "")
        total += len(text)
        if total > MAX_CHARS:
            raise ValueError("PDF text exceeds 600,000 characters")
        if text:
            pages.append({"pageNumber": number, "text": text})
        else:
            empty_pages.append(number)
    if total < 80:
        raise ValueError("PDF has insufficient extractable text; OCR is required")
    warnings = []
    if empty_pages:
        warnings.append("Pages without extractable text (images may require OCR): " + ", ".join(map(str, empty_pages)))
    return {"pages": pages, "pageCount": len(reader.pages), "warnings": warnings}
