"""Semantic LaTeX renderer. Source text is never executed as TeX.

Measured layout controls block width, typography and spacing. Individual words
remain ordinary editable LaTeX, with no positioned glyphs or raster backdrop.
"""
from __future__ import annotations

import json

from app.pdf_to_latex import MAX_WORDS, number, tex_escape
from app.pdf_structured_model import Document

AI_KINDS = {"paragraph", "heading", "metadata", "note", "footer", "total"}


def table_source(table, width):
    # Reserve cell padding and rules before allocating p-column widths. Equal
    # columns make product descriptions unusable and cause avoidable wrapping.
    padding = 3.0
    rules = (table.columns + 1) * 0.4 if table.ruled else 0
    available = max(width * 0.35, width - 2 * padding * table.columns - rules)
    total = sum(table.widths)
    widths = [available * value / total for value in table.widths]
    column_alignments = []
    for column in range(table.columns):
        cell = next((c for c in table.cells if c.column == column and c.row >= table.header_rows), None)
        column_alignments.append(cell.alignment if cell else "left")
    align = {"left": r"\raggedright", "center": r"\centering", "right": r"\raggedleft"}
    specifications = [f">{{{align[column_alignments[c]]}\\arraybackslash}}p{{{number(widths[c])}bp}}"
                      for c in range(table.columns)]
    separator = "|" if table.ruled else ""
    specification = separator + separator.join(specifications) + separator
    # tabular is compact for normal receipts; longtable permits genuinely long
    # tables to break naturally rather than overflowing an unbreakable box.
    environment = "longtable" if table.rows > 16 else "tabular"
    output = [r"\begingroup\setlength{\tabcolsep}{3bp}\renewcommand{\arraystretch}{1.08}",
              f"\\begin{{{environment}}}{{{specification}}}"]
    if environment == "longtable":
        output.insert(1, r"\setlength{\LTleft}{0pt}\setlength{\LTright}{\fill}\setlength{\LTpre}{0pt}\setlength{\LTpost}{0pt}")
    if table.ruled:
        output.append(r"\hline")
    elif table.header_rows:
        output.append(r"\toprule")
    covered = set()
    cells = {(c.row, c.column): c for c in table.cells}
    for row in range(table.rows):
        values, column = [], 0
        while column < table.columns:
            if (row, column) in covered:
                values.append("")
                column += 1
                continue
            cell = cells.get((row, column))
            if cell is None:
                values.append("")
                column += 1
                continue
            content = tex_escape(cell.text)
            if cell.style.bold or row < table.header_rows:
                content = r"\textbf{" + content + "}"
            if cell.style.italic:
                content = r"\textit{" + content + "}"
            if cell.row_span > 1:
                content = f"\\multirow{{{cell.row_span}}}{{=}}{{{content}}}"
            if cell.column_span > 1:
                span_width = sum(widths[column:column + cell.column_span]) + 2 * padding * (cell.column_span - 1)
                spec = separator + f">{{{align[cell.alignment]}\\arraybackslash}}p{{{number(span_width)}bp}}" + separator
                content = f"\\multicolumn{{{cell.column_span}}}{{{spec}}}{{{content}}}"
            for rr in range(row + 1, row + cell.row_span):
                for cc in range(column, column + cell.column_span):
                    covered.add((rr, cc))
            values.append(content)
            column += cell.column_span
        output.append(" & ".join(values) + r" \\")
        if table.ruled:
            # Avoid crossing a vertically merged cell with a full horizontal
            # rule. cline applies only to columns whose row span has ended.
            free = [c + 1 for c in range(table.columns) if (row + 1, c) not in covered]
            if len(free) == table.columns:
                output.append(r"\hline")
            elif free:
                start = last = free[0]
                for value in free[1:] + [table.columns + 2]:
                    if value != last + 1:
                        output.append(f"\\cline{{{start}-{last}}}")
                        start = value
                    last = value
        elif row + 1 == table.header_rows:
            output.append(r"\midrule")
        if environment == "longtable" and row + 1 == table.header_rows:
            output.append(r"\endhead")
    if not table.ruled:
        output.append(r"\bottomrule")
    output.extend([f"\\end{{{environment}}}", r"\endgroup"])
    return "\n".join(output)


def render(document: Document):
    files, source_map, ai_blocks = dict(document.assets), [], []
    word_count = 0
    for page in document.pages:
        left, top, right, bottom = page.margins
        content_width = page.width - left - right
        source = [f"% Source page {page.number}; editable semantic reconstruction.",
                  "\\LGpage{" + "}{".join(number(v) for v in
                    (page.width, page.height, left, top, right, bottom)) + "}"]
        for order, block in enumerate(page.blocks):
            block.identifier = f"p{page.number}b{len(source_map)}"
            if len(source_map) >= 5000 or len(block.text) > 12_000:
                raise ValueError("Structured document exceeds manuscript limits")
            block.kind = "metadata" if block.kind == "key_value" else block.kind
            source_map.append(block.source_entry(page.number, order))
            source.append(f"% Source page {page.number}; block {block.identifier}; {block.kind}")
            in_row = bool(block.row_group)
            same_previous_row = in_row and order > 0 and page.blocks[order - 1].row_group == block.row_group
            same_next_row = in_row and order + 1 < len(page.blocks) and page.blocks[order + 1].row_group == block.row_group
            if in_row and not same_previous_row:
                source.append(f"\\par\\addvspace{{{number(block.spacing)}bp}}\\noindent")
            if block.kind == "footer" and order == len(page.blocks) - 1:
                source.append(r"\par\vfill")
            offset = min(max(0, block.bbox[0] - left), content_width * 0.7)
            measured_width = max(block.bbox[2] - block.bbox[0], page.body_style.size * 3)
            if block.alignment == "center":
                offset, width = 0, content_width
            elif block.alignment == "right":
                offset, width = 0, content_width
            elif block.kind in {"paragraph", "heading", "metadata", "footer", "note", "total", "list"}:
                # A paragraph uses its source column, not the exact width of
                # the last printed line. Extra words reflow within that column.
                width = min(content_width - offset, max(measured_width, content_width * 0.65))
            else:
                width = min(content_width - offset, measured_width)
            if in_row:
                offset, width = 0, min(content_width, measured_width + 1)
                source.append(f"\\begin{{minipage}}[t]{{{number(width)}bp}}\\vspace{{0pt}}")
            family = {"serif": 0, "sans": 1, "mono": 2}[block.style.family]
            alignment = {"left": 0, "center": 1, "right": 2}[block.alignment]
            emphasis = int(block.style.bold) + int(block.style.italic) * 2
            gap = 0 if in_row or (block.kind == "footer" and order == len(page.blocks) - 1) else block.spacing
            args = [number(gap), number(offset), number(width), number(block.style.size),
                    number(block.style.leading), str(family), str(alignment), str(emphasis)]
            source.append("\\begin{LGblock}{" + "}{".join(args) + "}")
            if block.table:
                source.append(table_source(block.table, width))
                word_count += sum(len(c.text.split()) for c in block.table.cells)
            elif block.image_path:
                source.append(f"\\includegraphics[width={number(width)}bp]{{{block.image_path}}}")
            elif block.kind == "list":
                environment = "enumerate" if block.ordered else "itemize"
                options = "nosep,leftmargin=1.4em" + (f",start={block.list_start}" if block.ordered else "")
                source.extend([f"\\begin{{{environment}}}[{options}]",
                               *[r"\item " + tex_escape(text) for text in block.list_items],
                               f"\\end{{{environment}}}"])
                word_count += len(block.text.split())
            else:
                kind = block.kind if block.kind in AI_KINDS else "paragraph"
                # Keep the anchors at line start: backend AI metadata relabels
                # only this macro name, never its immutable text argument.
                source.append(f"\\LG{kind}{{{block.identifier}}}{{{tex_escape(block.text)}}}")
                ai_blocks.append({"id": block.identifier, "text": block.text, "kind": kind})
                word_count += len(block.text.split())
            source.append(r"\end{LGblock}")
            if in_row:
                source.append(r"\end{minipage}" + (r"\hfill" if same_next_row else r"\par"))
        encoded = "\n".join(source).encode("utf-8")
        if len(encoded) > 500_000 or word_count > MAX_WORDS:
            raise ValueError("Structured document exceeds manuscript limits")
        files[f"pages/page-{page.number}.tex"] = encoded
    if not word_count:
        raise ValueError("PDF contains no readable text")
    first = document.pages[0]
    left, top, right, bottom = first.margins
    files["main.tex"] = "\n".join([
        "% Layout-aware editable reconstruction. Compare with original.pdf before use.",
        "% XeLaTeX or LuaLaTeX; fonts are substituted by family, never downloaded.",
        r"\documentclass{article}",
        r"\usepackage{fontspec,graphicx,booktabs,array,longtable,multirow,enumitem,amsmath}",
        "\\usepackage[paperwidth=" + number(first.width) + "bp,paperheight=" + number(first.height) +
        "bp,left=" + number(left) + "bp,top=" + number(top) + "bp,right=" + number(right) +
        "bp,bottom=" + number(bottom) + r"bp]{geometry}",
        r"\setmainfont{DejaVu Serif}\setsansfont{DejaVu Sans}\setmonofont{DejaVu Sans Mono}",
        r"\pagestyle{empty}\setlength{\parindent}{0pt}\setlength{\parskip}{0pt}",
        r"\setlength{\emergencystretch}{2em}\raggedbottom",
        r"\newcommand{\LGparagraph}[2]{#2\par}",
        r"\newcommand{\LGheading}[2]{#2\par}",
        r"\newcommand{\LGmetadata}[2]{#2\par}",
        r"\newcommand{\LGnote}[2]{#2\par}",
        r"\newcommand{\LGfooter}[2]{#2\par}",
        r"\newcommand{\LGtotal}[2]{#2\par}",
        r"\newcommand{\LGpage}[6]{\clearpage\setlength{\paperwidth}{#1bp}\setlength{\paperheight}{#2bp}%",
        r"\newgeometry{left=#3bp,top=#4bp,right=#5bp,bottom=#6bp}%",
        r"\special{papersize=#1bp,#2bp}}",
        r"\newenvironment{LGblock}[8]{\par\addvspace{#1bp}%",
        r"\begin{list}{}{\setlength{\leftmargin}{#2bp}\setlength{\rightmargin}{\dimexpr\linewidth-#2bp-#3bp\relax}%",
        r"\setlength{\topsep}{0pt}\setlength{\partopsep}{0pt}\setlength{\parsep}{0pt}\setlength{\itemsep}{0pt}}\item[]%",
        r"\fontsize{#4}{#5}\selectfont\ifcase#6\rmfamily\or\sffamily\or\ttfamily\fi%",
        r"\ifcase#7\raggedright\or\centering\or\raggedleft\fi%",
        r"\ifcase#8\or\bfseries\or\itshape\or\bfseries\itshape\fi}{\par\end{list}}",
        r"\begin{document}",
        *[f"\\input{{pages/page-{p.number}.tex}}" for p in document.pages],
        r"\end{document}", "",
    ]).encode("utf-8")
    files["source-map.txt"] = json.dumps(source_map, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return files, ai_blocks, word_count
