from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from pypdf import PdfReader


def clean_text(value: str) -> str:
    value = value.replace("\x00", " ")
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def extract_pdf(path: Path) -> tuple[dict[str, Any], str]:
    reader = PdfReader(str(path))
    pages: list[str] = []
    for number, page in enumerate(reader.pages, start=1):
        page_text = clean_text(page.extract_text() or "")
        pages.append(f"[[PAGE {number}]]\n{page_text}")
    text = "\n\n".join(pages)
    first_page = pages[0] if pages else ""
    metadata = reader.metadata or {}
    title = _extract_title(first_page, str(metadata.get("/Title") or ""), path.stem)
    abstract = _extract_abstract(text)
    keywords = _extract_keywords(text)
    authors = _extract_authors(first_page, title)
    profile = {
        "title": title,
        "authors": authors,
        "abstract": abstract,
        "keywords": keywords,
        "paper_type": "Other",
        "filename": path.name,
        "file_path": str(path.resolve()),
        "file_size": path.stat().st_size,
        "page_count": len(reader.pages),
    }
    return profile, text


def _extract_title(first_page: str, metadata_title: str, fallback: str) -> str:
    if metadata_title and metadata_title.lower() not in {"untitled", "microsoft word"}:
        return clean_text(metadata_title)
    lines = [line.strip() for line in first_page.splitlines() if line.strip()]
    if lines and lines[0].startswith("[[PAGE"):
        lines = lines[1:]
    title_lines: list[str] = []
    for line in lines[:8]:
        if re.search(r"\b(abstract|faculty|university|institute)\b", line, re.I):
            break
        if "@" in line or re.search(r"\b(et al\.|ORCID)\b", line, re.I):
            break
        if re.search(r"\d", line) and title_lines:
            break
        title_lines.append(line)
        if len(" ".join(title_lines)) > 180:
            break
    title = " ".join(title_lines).strip(" -")
    return title or fallback.replace("_", " ")


def _extract_abstract(text: str) -> str:
    match = re.search(
        r"\bAbstract[\s.:—-]+(.*?)(?=\n\s*(?:Keywords?|Index Terms)[\s.:—-]|\n\s*1\s+(?:Introduction|INTRODUCTION))",
        text,
        re.I | re.S,
    )
    if not match:
        return ""
    return clean_text(match.group(1))[:4000]


def _extract_keywords(text: str) -> list[str]:
    match = re.search(r"\b(?:Keywords?|Index Terms)[\s.:—-]+([^\n]+(?:\n(?!\s*1\s)[^\n]+)?)", text, re.I)
    if not match:
        return []
    raw = clean_text(match.group(1))
    return [part.strip(" .") for part in re.split(r"[,;]", raw) if part.strip(" .")][:12]


def _extract_authors(first_page: str, title: str) -> str:
    source_lines = [line.strip() for line in first_page.replace("[[PAGE 1]]", "").splitlines() if line.strip()]
    author_lines: list[str] = []
    started = False
    for line in source_lines[:14]:
        if re.search(r"\b(Abstract|Faculty|Department|University|Institute|School)\b", line, re.I):
            if started:
                break
            continue
        looks_like_author = bool(
            re.search(r"(?:\band\b|,)", line, re.I)
            and re.search(r"(?:\d|\[\d{4}|⋆|\*)", line)
        )
        if looks_like_author:
            started = True
        if started:
            if "@" in line:
                break
            author_lines.append(line)
    if author_lines:
        author_block = " ".join(author_lines)
    else:
        author_block = ""

    flat = re.sub(r"\s+", " ", first_page.replace("[[PAGE 1]]", " ")).strip()
    position = flat.lower().find(title.lower())
    remainder = flat[position + len(title):] if position >= 0 else flat
    if not author_block:
        author_block = re.split(
            r"\b(?:\d+\s*)?(?:Faculty|Department|University|Institute|School|Abstract)\b",
            remainder,
            maxsplit=1,
            flags=re.I,
        )[0]
    author_block = re.sub(r"\[\d{4}-\s*\d{4}-\s*\d{4}-\s*\d{4}\]", "", author_block)
    author_block = re.sub(r"(?<=[A-Za-z])\d+\b", "", author_block)
    author_block = re.sub(r"\s+\d+(?=\s*(?:,|and|$))", "", author_block)
    author_block = re.sub(r"\s+", " ", author_block).strip(" ,;-")
    if "@" in author_block or len(author_block) > 500:
        return ""
    return author_block
