"""Regression coverage for semantic and layout-aware editable reconstruction.

Fixtures contain fictional research/receipt data and no external dependencies.
Compilation/render checks are recorded separately in docs/pdf-structured-validation.md.
"""
import base64
import json
import re
import shutil
import unittest
from io import BytesIO
from zipfile import ZipFile

from app.pdf_to_latex import convert_pdf
from pdf_structured_fixtures import receipt_pdf, simple_document, vietnamese_scan


def unpack(data):
    result = convert_pdf(data, "structured")
    archive = ZipFile(BytesIO(base64.b64decode(result["archive"])))
    files = {name: archive.read(name) for name in archive.namelist()}
    source = "\n".join(value.decode() for name, value in files.items()
                       if name.endswith(".tex") and name != "original-layout.tex")
    return result, files, source


class StructuredLayoutTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.receipt = unpack(receipt_pdf())
        cls.borderless = unpack(receipt_pdf(borderless=True))

    def assert_editable_table(self, files, source):
        self.assertRegex(source, r"\\begin\{(?:longtable|tabularx|tabular)\}")
        self.assertNotRegex(source, r"\\(?:put|makebox|resizebox)\b")
        self.assertNotIn("background.pdf", source)
        self.assertNotIn("includepdf", source)
        self.assertNotIn("original.pdf", source.split(r"\begin{document}")[-1])
        source_map = json.loads(files["source-map.txt"])
        self.assertTrue(any(block["kind"] == "table" for block in source_map))

    def test_receipt_preserves_vietnamese_and_exact_values(self):
        _, files, source = self.receipt
        self.assert_editable_table(files, source)
        for value in ["PHIẾU MUA HÀNG", "TEST-2026-041", "Nguyễn An", "Sổ ghi chép nghiên cứu",
                      "125.000", "375.000", "250.000", "500.000", "40.000", "400.000", "1.275.000 VND"]:
            self.assertIn(value, source)
        # True rows keep the product and its three values together.
        self.assertRegex(source, r"Sổ ghi chép nghiên cứu[^\n]*&[^\n]*125\.000[^\n]*&[^\n]*3[^\n]*&[^\n]*375\.000")

    def test_borderless_numeric_table_recovered_without_reordering(self):
        _, files, source = self.borderless
        self.assert_editable_table(files, source)
        self.assertLess(source.index("125.000"), source.index("250.000"))
        self.assertLess(source.index("250.000"), source.index("40.000"))
        for value in ["Tên sản phẩm", "Đơn giá", "Số lượng", "Thành tiền", "1.275.000 VND"]:
            self.assertIn(value, source)
        table = next(block["table"] for block in json.loads(files["source-map.txt"]) if block["kind"] == "table")
        self.assertEqual((table["rows"], table["columns"], table["header_rows"]), (4, 4, 1))
        wrapped_name = next(cell["text"] for cell in table["cells"] if cell["row"] == 2 and cell["column"] == 0)
        self.assertIn("tự xuống dòng", wrapped_name)

    def test_receipt_page_geometry_and_style_are_not_generic_a4(self):
        _, _, source = self.receipt
        self.assertRegex(source, r"paperwidth\s*=\s*[0-9.]+(?:bp|pt)")
        self.assertRegex(source, r"paperheight\s*=\s*[0-9.]+(?:bp|pt)")
        self.assertIn("DejaVu Sans", source)
        self.assertRegex(source, r"(?:raggedleft|LGright)")

    def test_fragmented_rules_and_many_rows(self):
        result, files, source = unpack(simple_document("table", rows=18))
        self.assert_editable_table(files, source)
        for number in range(1, 19):
            self.assertIn(f"Sample {number}", source)
            self.assertIn(f"{number * 125}.00", source)
        self.assertEqual(result["pageCount"], 1)

    def test_merged_table_cells_keep_row_and_column_spans(self):
        _, files, source = unpack(simple_document("merged"))
        self.assert_editable_table(files, source)
        self.assertIn(r"\multicolumn{2}", source)
        self.assertIn(r"\multirow{2}", source)
        cells = next(block["table"]["cells"] for block in json.loads(files["source-map.txt"]) if block["kind"] == "table")
        header = next(cell for cell in cells if cell["text"] == "Research evidence")
        group = next(cell for cell in cells if cell["text"] == "Shared group")
        self.assertEqual(header["column_span"], 2)
        self.assertEqual(group["row_span"], 2)
        for value in ["125.00", "250.00", "375.00"]:
            self.assertIn(value, source)

    def test_prose_remains_reflowable_and_not_a_false_table(self):
        _, _, source = unpack(simple_document("prose"))
        self.assertIn(r"\LGparagraph", source)
        self.assertIn("92.5 percent", source)
        self.assertIn("SAMPLE-2026-041", source)
        self.assertNotRegex(source, r"\\begin\{(?:tabularx|longtable|tabular)\}")
        self.assertNotRegex(source, r"\\(?:put|makebox|resizebox)\b")

    def test_prose_columns_are_not_misclassified_as_data_table(self):
        _, files, source = unpack(simple_document("columns"))
        self.assertFalse(any(block["kind"] == "table" for block in json.loads(files["source-map.txt"])))
        self.assertIn("left column", source)
        self.assertIn("right column", source)

    def test_heading_and_numbered_list_have_semantic_structure(self):
        _, _, source = unpack(simple_document("list"))
        self.assertIn(r"\LGheading", source)
        self.assertRegex(source, r"\\begin\{enumerate\}")
        self.assertIn("Review every interpretation", source)

    def test_printed_equation_is_preserved_without_invented_math(self):
        result, _, source = unpack(simple_document("equation"))
        self.assertIn("E = mc", source)
        self.assertIn("2", source)
        self.assertIn("FORMULAS_AND_REFERENCES", result["warnings"])

    def test_special_characters_and_tex_commands_are_escaped(self):
        _, _, source = unpack(simple_document("special"))
        self.assertIn(r"50\%", source)
        self.assertIn(r"\&", source)
        self.assertIn(r"sample\_1", source)
        self.assertNotIn(r"\input{evil}", source)
        self.assertIn("evil", source)

    def test_raster_figure_is_packaged_without_a_page_background(self):
        _, files, source = unpack(simple_document("figure"))
        images = [name for name in files if name.startswith("figures/") and name.endswith(".png")]
        self.assertTrue(images)
        for name in images:
            self.assertIn(name, source)
            self.assertGreater(len(files[name]), 30)
        self.assertNotIn("background.pdf", source)

    @unittest.skipUnless(shutil.which("tesseract"), "Local OCR binary required")
    def test_scan_ocr_retains_identifiers_and_amounts_with_review_warning(self):
        result, _, source = unpack(vietnamese_scan())
        self.assertIn("OCR_REVIEW_PAGE:1", result["warnings"])
        self.assertIn("TEST-2026-041", source)
        self.assertIn("1.275.000", source)
        self.assertIn("VND", source)

    def test_multipage_source_records_each_page(self):
        result, files, source = unpack(simple_document("prose", pages=3))
        self.assertEqual(result["pageCount"], 3)
        for page in range(1, 4):
            self.assertIn(f"pages/page-{page}.tex", files)
            self.assertIn(f"Research methods {page}", source)
        self.assertEqual({block["page"] for block in json.loads(files["source-map.txt"])}, {1, 2, 3})


if __name__ == "__main__":
    unittest.main()
