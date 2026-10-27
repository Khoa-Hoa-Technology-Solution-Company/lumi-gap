"""Bounded semantic/layout representation, independent of LaTeX rendering.

Coordinates use PDF points, with the origin at the top left of the normalized
visible page. Confidence describes an inference; it is not a content guarantee.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field

BBox = tuple[float, float, float, float]


@dataclass
class TextStyle:
    size: float = 11.0
    family: str = "serif"
    bold: bool = False
    italic: bool = False
    leading: float = 13.2
    source_font: str = ""


@dataclass
class TableCell:
    text: str
    row: int
    column: int
    row_span: int = 1
    column_span: int = 1
    bbox: BBox | None = None
    alignment: str = "left"
    style: TextStyle = field(default_factory=TextStyle)


@dataclass
class Table:
    rows: int
    columns: int
    cells: list[TableCell]
    widths: list[float]
    ruled: bool = True
    header_rows: int = 0
    confidence: float = 1.0


@dataclass
class Block:
    kind: str
    bbox: BBox
    text: str = ""
    style: TextStyle = field(default_factory=TextStyle)
    alignment: str = "left"
    spacing: float = 0.0
    confidence: float = 1.0
    identifier: str = ""
    source_ref: str = ""
    table: Table | None = None
    image_path: str | None = None
    list_items: list[str] = field(default_factory=list)
    ordered: bool = False
    list_start: int = 1
    row_group: str = ""

    def source_entry(self, page: int, order: int) -> dict:
        result = asdict(self)
        result.update(id=self.identifier, page=page, order=order,
                      coordinateSystem="top-left-pdf-points")
        # Keep source text and cell contents beside the measured metadata so
        # content/layout matching can be audited without parsing generated TeX.
        result.pop("identifier")
        return result


@dataclass
class Page:
    number: int
    width: float
    height: float
    margins: tuple[float, float, float, float]  # left, top, right, bottom
    body_style: TextStyle
    blocks: list[Block]
    scanned: bool = False


@dataclass
class Document:
    pages: list[Page]
    warnings: list[str]
    assets: dict[str, bytes] = field(default_factory=dict)
    omitted_or_uncertain_blocks: int = 0

    def summary(self) -> dict:
        return {
            "pageCount": len(self.pages),
            "tableCount": sum(block.table is not None for page in self.pages for block in page.blocks),
            "blockCount": sum(len(page.blocks) for page in self.pages),
            "unmappedBlocks": self.omitted_or_uncertain_blocks + sum(
                block.confidence < 0.7 for page in self.pages for block in page.blocks),
        }
