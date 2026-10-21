"""Real synthetic PDF comparisons; no remote services or added dependencies."""
from io import BytesIO
import unittest

from PIL import Image, ImageDraw
from pypdf import PdfReader, PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject, RectangleObject

from app.pdf_comparison import (
    MAX_GENERATED_BYTES, MAX_SOURCE_BYTES, _number_counter, compare_pdfs,
)


def text_pdf(lines=None, *, pages=1, x=50, y=700, width=612, height=792, encrypted=False):
    if lines is None:
        lines = ["Research evidence and measured results", "Sample quantity 3", "Total amount 1250.00"]
    writer = PdfWriter()
    font = DictionaryObject({NameObject("/Type"): NameObject("/Font"),
                             NameObject("/Subtype"): NameObject("/Type1"),
                             NameObject("/BaseFont"): NameObject("/Helvetica")})
    font_id = writer._add_object(font)
    for _ in range(pages):
        page = writer.add_blank_page(width=width, height=height)
        page[NameObject("/Resources")] = DictionaryObject({NameObject("/Font"): DictionaryObject({NameObject("/F1"): font_id})})
        commands = []
        for index, text in enumerate(lines):
            escaped = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
            commands.append(f"BT /F1 12 Tf {x} {y - index * 20} Td ({escaped}) Tj ET")
        stream = DecodedStreamObject()
        stream.set_data("\n".join(commands).encode("ascii"))
        page[NameObject("/Contents")] = writer._add_object(stream)
    if encrypted:
        writer.encrypt("test-password")
    output = BytesIO()
    writer.write(output)
    return output.getvalue()


def scan_pdf():
    image = Image.new("RGB", (400, 600), "white")
    draw = ImageDraw.Draw(image)
    draw.rectangle((40, 70, 350, 120), outline="black", width=3)
    draw.text((50, 80), "Synthetic receipt 1250.00", fill="black")
    output = BytesIO()
    image.save(output, format="PDF", resolution=72)
    image.close()
    return output.getvalue()


class PdfComparisonTests(unittest.TestCase):
    def test_identical_real_pdfs_preserve_text_numbers_and_layout(self):
        source = text_pdf()
        result = compare_pdfs(source, source)
        self.assertEqual(result["status"], "compared")
        self.assertEqual(result["sourcePages"], 1)
        self.assertEqual(result["generatedPages"], 1)
        self.assertEqual(result["comparedPages"], 1)
        self.assertEqual(result["textCoverage"], 1)
        self.assertEqual(result["numericCoverage"], 1)
        self.assertEqual(result["visualSimilarity"], 1)
        self.assertEqual(result["contentBoundsDeviation"], 0)
        self.assertEqual(result["warnings"], ["VISUAL_COMPARISON_LIMITED"])

    def test_changed_amount_warns_even_if_words_and_location_are_identical(self):
        result = compare_pdfs(text_pdf(["Invoice total 1250.00"]), text_pdf(["Invoice total 1520.00"]))
        self.assertEqual(result["textCoverage"], 1)
        self.assertEqual(result["numericCoverage"], 0)
        self.assertIn("NUMERIC_CONTENT_REVIEW", result["warnings"])

    def test_dropped_repeated_amount_is_not_hidden_by_set_matching(self):
        result = compare_pdfs(text_pdf(["Item amount 1250", "Total amount 1250"]), text_pdf(["Item amount 1250", "Total amount"]))
        self.assertEqual(result["numericCoverage"], 0.5)
        self.assertIn("NUMERIC_CONTENT_REVIEW", result["warnings"])

    def test_added_number_requires_review(self):
        result = compare_pdfs(text_pdf(["Invoice amount 1250"]), text_pdf(["Invoice amount 1250", "Discount 20"]))
        self.assertEqual(result["numericCoverage"], 0.5)
        self.assertIn("NUMERIC_CONTENT_REVIEW", result["warnings"])

    def test_added_number_to_prose_requires_review(self):
        result = compare_pdfs(text_pdf(["Research evidence"]), text_pdf(["Research evidence 100"]))
        self.assertEqual(result["numericCoverage"], 0)
        self.assertIn("NUMERIC_CONTENT_REVIEW", result["warnings"])

    def test_missing_words_require_review(self):
        result = compare_pdfs(text_pdf(), text_pdf(["Research evidence"]))
        self.assertLess(result["textCoverage"], 0.96)
        self.assertIn("TEXT_CONTENT_REVIEW", result["warnings"])

    def test_same_text_moved_far_down_page_requires_layout_review(self):
        result = compare_pdfs(text_pdf(), text_pdf(y=300))
        self.assertEqual(result["textCoverage"], 1)
        self.assertEqual(result["numericCoverage"], 1)
        self.assertLess(result["visualSimilarity"], 0.65)
        self.assertGreater(result["contentBoundsDeviation"], 0.08)
        self.assertIn("LAYOUT_DIFFERENCE", result["warnings"])

    def test_scan_omits_unverifiable_text_and_numeric_scores(self):
        source = scan_pdf()
        result = compare_pdfs(source, source)
        self.assertNotIn("textCoverage", result)
        self.assertNotIn("numericCoverage", result)
        self.assertIn("TEXT_METRICS_UNAVAILABLE", result["warnings"])
        self.assertEqual(result["visualSimilarity"], 1)

    def test_reflow_and_blank_pages_are_reported_honestly(self):
        result = compare_pdfs(text_pdf(), text_pdf(pages=2))
        self.assertIn("PAGE_COUNT_CHANGED", result["warnings"])
        blank = text_pdf([])
        result = compare_pdfs(blank, blank)
        self.assertNotIn("textCoverage", result)
        self.assertNotIn("numericCoverage", result)
        self.assertNotIn("visualSimilarity", result)

    def test_long_documents_are_limited_to_five_page_samples(self):
        source = text_pdf(pages=100)
        result = compare_pdfs(source, source)
        self.assertEqual(result["comparedPages"], 5)
        self.assertEqual(result["sourcePages"], 100)
        self.assertIn("COMPARISON_SAMPLED", result["warnings"])
        self.assertEqual(result["numericCoverage"], 1)

    def test_reflow_above_one_hundred_pages_still_returns_diagnostics(self):
        result = compare_pdfs(text_pdf(pages=100), text_pdf(pages=101))
        self.assertEqual(result["sourcePages"], 100)
        self.assertEqual(result["generatedPages"], 101)
        self.assertEqual(result["comparedPages"], 5)
        self.assertIn("PAGE_COUNT_CHANGED", result["warnings"])

    def test_visible_crop_does_not_count_hidden_margin_text(self):
        source = text_pdf(["Private hidden margin", "Visible evidence 1250"], y=740)
        writer = PdfWriter()
        page = writer.add_page(PdfReader(BytesIO(source)).pages[0])
        page.cropbox = RectangleObject((40, 680, 500, 730))
        output = BytesIO()
        writer.write(output)
        result = compare_pdfs(output.getvalue(), text_pdf(["Visible evidence 1250"], y=700))
        self.assertEqual(result["textCoverage"], 1)
        self.assertEqual(result["numericCoverage"], 1)

    def test_numbers_are_normalized_without_rounding_or_losing_duplicates(self):
        numbers = _number_counter("−۱۲۳ 1.275.000 92.5% 1\u202f275\u202f000 1.275.000")
        self.assertEqual(numbers["-123"], 1)
        self.assertEqual(numbers["1.275.000"], 2)
        self.assertEqual(numbers["92.5%"], 1)
        self.assertEqual(numbers["1275000"], 1)
        self.assertNotEqual(_number_counter("92.50"), _number_counter("92.5"))

    def test_input_byte_page_and_password_limits(self):
        source = text_pdf()
        for original, generated in [
            (b"not a PDF", source),
            (source, b"%PDF-invalid"),
            (b"%PDF-" + b"x" * MAX_SOURCE_BYTES, source),
            (source, b"%PDF-" + b"x" * MAX_GENERATED_BYTES),
            (text_pdf(pages=101), source),
            (text_pdf(encrypted=True), source),
        ]:
            with self.subTest(source_size=len(original), generated_size=len(generated)):
                with self.assertRaises(ValueError):
                    compare_pdfs(original, generated)


if __name__ == "__main__":
    unittest.main()
