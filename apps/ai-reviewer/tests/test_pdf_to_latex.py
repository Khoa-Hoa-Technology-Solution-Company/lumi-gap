import base64
import unittest
import shutil
from io import BytesIO
from zipfile import ZipFile
from unittest.mock import patch

from pypdf import PdfReader, PdfWriter, Transformation
from pypdf.generic import ArrayObject, DecodedStreamObject, DictionaryObject, NameObject, TextStringObject, RectangleObject, FloatObject
from app.pdf_to_latex import convert_pdf, tex_escape, prepare_pdf


def sample_pdf(encrypted=False, text=True, pages=2, dense=False):
    writer = PdfWriter()
    for number in range(pages):
        page = writer.add_blank_page(width=612 if number == 0 else 500, height=792 if number == 0 else 700)
        font = DictionaryObject({NameObject("/Type"): NameObject("/Font"), NameObject("/Subtype"): NameObject("/Type1"), NameObject("/BaseFont"): NameObject("/Helvetica")})
        page[NameObject("/Resources")] = DictionaryObject({NameObject("/Font"): DictionaryObject({NameObject("/F1"): writer._add_object(font)})})
        stream = DecodedStreamObject()
        content = b"0.2 0.5 0.7 rg 40 500 200 2 re f\n"
        if text:
            content += b"BT /F1 12 Tf 50 650 Td (Research results: 50% & 2_3. {Keep} #1 $5) Tj ET"
        if dense:
            content += b"\nBT /F1 9 Tf 30 600 Td 12 TL\n" + (b"(Research data evidence study results methods analysis source paper team context review) Tj T*\n" * 20) + b"ET"
        stream.set_data(content)
        page[NameObject("/Contents")] = writer._add_object(stream)
    if encrypted:
        writer.encrypt("secret")
    output = BytesIO()
    writer.write(output)
    return output.getvalue()


def structured_pdf(multiline=False):
    writer = PdfWriter()
    page = writer.add_blank_page(width=612, height=792)
    font = DictionaryObject({NameObject("/Type"): NameObject("/Font"), NameObject("/Subtype"): NameObject("/Type1"), NameObject("/BaseFont"): NameObject("/Helvetica")})
    page[NameObject("/Resources")] = DictionaryObject({NameObject("/Font"): DictionaryObject({NameObject("/F1"): writer._add_object(font)})})
    stream = DecodedStreamObject()
    stream.set_data(b"BT /F1 20 Tf 50 720 Td (Research results) Tj ET\n"
                    b"BT /F1 12 Tf 50 670 Td (Keep 50% & 2_3. E = mc^2.) Tj ET\n"
                    b"BT /F1 12 Tf 50 640 Td (Do not execute: \\\\input{secret}) Tj ET\n"
                    b"50 540 m 450 540 l S 50 510 m 450 510 l S 50 480 m 450 480 l S\n"
                    b"50 480 m 50 540 l S 250 480 m 250 540 l S 450 480 m 450 540 l S\n"
                    b"BT /F1 12 Tf 60 520 Td (Metric) Tj ET\nBT /F1 12 Tf 260 520 Td (Value) Tj ET\n"
                    b"BT /F1 12 Tf 60 490 Td (Accuracy) Tj ET\nBT /F1 12 Tf 260 490 Td (92.5%) Tj ET")
    if multiline:
        stream.set_data(stream.get_data() + b"\nBT /F1 8 Tf 60 482 Td (score) Tj ET")
    page[NameObject("/Contents")] = writer._add_object(stream)
    output = BytesIO(); writer.write(output)
    return output.getvalue()


class PdfToLatexTests(unittest.TestCase):
    def test_converts_one_hundred_pages_and_more_than_twenty_thousand_words(self):
        result = convert_pdf(sample_pdf(pages=100, dense=True))
        self.assertEqual(result["pageCount"], 100)
        self.assertGreater(result["wordCount"], 20_000)
        with ZipFile(BytesIO(base64.b64decode(result["archive"]))) as archive:
            self.assertIn("pages/page-100.tex", archive.namelist())
            self.assertIn(b"\\input{pages/page-100.tex}", archive.read("main.tex"))

    def test_structured_conversion_accepts_one_hundred_pages_with_many_blocks(self):
        result = convert_pdf(sample_pdf(pages=100), "structured")
        self.assertEqual(result["pageCount"], 100)
        self.assertTrue(any(block["id"].startswith("p100b") for block in result["blocks"]))

    def test_rejects_more_than_one_hundred_pages_with_correct_limit(self):
        with self.assertRaisesRegex(ValueError, "1–100 pages"):
            prepare_pdf(sample_pdf(pages=101))

    def test_normalizes_shifted_scaled_and_cropped_pages_in_both_modes(self):
        for origin, unit, crop in [((120, -80), 1, False), ((-200, 300), 2, False), ((120, -80), 1.5, True)]:
            with self.subTest(origin=origin, unit=unit, crop=crop):
                writer = PdfWriter()
                page = writer.add_page(PdfReader(BytesIO(sample_pdf())).pages[0])
                page.add_transformation(Transformation().translate(*origin))
                x, y = origin
                page.mediabox = RectangleObject((x, y, x + 612, y + 792))
                page.cropbox = RectangleObject((x + 20, y + 100, x + 550, y + 750)) if crop else RectangleObject(page.mediabox)
                page[NameObject("/UserUnit")] = FloatObject(unit)
                output = BytesIO(); writer.write(output)
                data = output.getvalue()
                _, _, normalized = prepare_pdf(data)
                normalized_page = PdfReader(BytesIO(normalized)).pages[0]
                width, height = (530, 650) if crop else (612, 792)
                self.assertEqual(list(normalized_page.mediabox), [0, 0, width * unit, height * unit])
                self.assertNotIn("/UserUnit", normalized_page)
                for mode in ["layout", "structured"]:
                    result = convert_pdf(data, mode)
                    self.assertIn("Research", result["preview"])
                    if mode == "layout":
                        self.assertIn(f"\\put({(30 if crop else 50) * unit:.3f},{(550 if crop else 650) * unit:.3f})", result["preview"])
                    with ZipFile(BytesIO(base64.b64decode(result["archive"]))) as archive:
                        self.assertEqual(archive.read("original.pdf"), data)

    def test_cropped_margin_text_is_not_reintroduced(self):
        writer = PdfWriter()
        page = writer.add_page(PdfReader(BytesIO(structured_pdf())).pages[0])
        page.cropbox = RectangleObject((40, 470, 460, 610))
        output = BytesIO(); writer.write(output)
        for mode in ["layout", "structured"]:
            result = convert_pdf(output.getvalue(), mode)
            self.assertNotIn("Research", result["preview"])
            self.assertIn("Accuracy", result["preview"])

    def test_rotation_normalization_preserves_visible_page_dimensions(self):
        writer = PdfWriter()
        page = writer.add_page(PdfReader(BytesIO(sample_pdf())).pages[0])
        page.cropbox = RectangleObject((20, 100, 550, 750))
        page.rotate(90)
        output = BytesIO(); writer.write(output)
        _, _, normalized = prepare_pdf(output.getvalue())
        page = PdfReader(BytesIO(normalized)).pages[0]
        self.assertEqual(list(page.mediabox), [0, 0, 650, 530])
        self.assertEqual(page.rotation, 0)

    def test_normalization_preserves_rendered_crop_with_offset_and_rotation(self):
        import pypdfium2
        from PIL import ImageChops
        for rotation in [0, 90, 180, 270]:
            with self.subTest(rotation=rotation):
                writer = PdfWriter()
                page = writer.add_page(PdfReader(BytesIO(structured_pdf())).pages[0])
                page.add_transformation(Transformation().translate(120, -80))
                page.mediabox = RectangleObject((120, -80, 732, 712))
                page.cropbox = RectangleObject((140, 390, 580, 670))
                page.rotate(rotation)
                output = BytesIO(); writer.write(output)
                data = output.getvalue()
                _, _, normalized = prepare_pdf(data)
                images = []
                for source in [data, normalized]:
                    with pypdfium2.PdfDocument(source) as document:
                        pdf_page = document[0]
                        bitmap = pdf_page.render(scale=1)
                        images.append(bitmap.to_pil().convert("RGB").copy())
                        bitmap.close()
                        pdf_page.close()
                self.assertEqual(images[0].size, images[1].size)
                self.assertIsNone(ImageChops.difference(*images).getbbox())

    def test_rejects_invalid_coordinate_scales_and_empty_visible_boxes(self):
        for unit in [0, -1, 100000]:
            writer = PdfWriter()
            page = writer.add_page(PdfReader(BytesIO(sample_pdf())).pages[0])
            page[NameObject("/UserUnit")] = FloatObject(unit)
            output = BytesIO(); writer.write(output)
            with self.assertRaises(ValueError):
                prepare_pdf(output.getvalue())
        writer = PdfWriter()
        page = writer.add_page(PdfReader(BytesIO(sample_pdf())).pages[0])
        page.cropbox = RectangleObject((900, 900, 1000, 1000))
        output = BytesIO(); writer.write(output)
        with self.assertRaises(ValueError):
            prepare_pdf(output.getvalue())

    def test_docling_exports_editable_paragraphs_tables_and_source_map(self):
        import json
        result = convert_pdf(structured_pdf(), "structured")
        with ZipFile(BytesIO(base64.b64decode(result["archive"]))) as archive:
            page = archive.read("pages/page-1.tex").decode()
            self.assertIn(r"\LGheading", page)
            self.assertIn(r"\begin{tabular}", page)
            self.assertIn(r"92.5\%", page)
            self.assertEqual(page.count("Accuracy"), 1)
            self.assertIn(r"50\% \& 2\_3", page)
            self.assertNotIn(r"\input{secret}", page)
            self.assertIn(r"\textbackslash{}", page)
            self.assertIn("original.pdf", archive.namelist())
            mapping = json.loads(archive.read("source-map.txt"))
            self.assertTrue(all(entry["page"] == 1 and len(entry["bbox"]) == 4 for entry in mapping))
            self.assertIn("table", [entry["kind"] for entry in mapping])
        self.assertTrue(result["blocks"])
        self.assertIn("FORMULAS_AND_REFERENCES", result["warnings"])

    def test_multiline_table_cells_preserve_word_boundaries(self):
        result = convert_pdf(structured_pdf(multiline=True), "structured")
        with ZipFile(BytesIO(base64.b64decode(result["archive"]))) as archive:
            page = archive.read("pages/page-1.tex").decode()
            self.assertIn("Accuracy score", page)
            self.assertNotIn("Accuracyscore", page)

    @unittest.skipUnless(shutil.which("tesseract"), "Local OCR binary required")
    def test_real_scanned_pdf_ocr_keeps_text_without_duplicate_page_image(self):
        from PIL import Image, ImageDraw, ImageFont
        image = Image.new("RGB", (1200, 1600), "white")
        ImageDraw.Draw(image).text((100, 150), "Research results 92.5 percent", fill="black", font=ImageFont.truetype("DejaVuSans.ttf", 40))
        pdf = BytesIO(); image.save(pdf, format="PDF", resolution=144)
        result = convert_pdf(pdf.getvalue(), "structured")
        self.assertIn("OCR_REVIEW_PAGE:1", result["warnings"])
        self.assertIn("Research results", result["preview"])
        self.assertIn("92.5", result["preview"])
        with ZipFile(BytesIO(base64.b64decode(result["archive"]))) as archive:
            self.assertFalse(any(name.startswith("figures/") for name in archive.namelist()))

    def test_structured_conversion_fails_explicitly_when_ocr_is_unavailable(self):
        with patch("app.pdf_to_latex_structured.shutil.which", return_value=None), self.assertRaisesRegex(ValueError, "OCR is not installed"):
            convert_pdf(sample_pdf(text=False), "structured")

    def test_preserves_coordinates_graphics_and_editable_source(self):
        result = convert_pdf(sample_pdf())
        self.assertEqual(result["pageCount"], 2)
        with ZipFile(BytesIO(base64.b64decode(result["archive"]))) as archive:
            page = archive.read("pages/page-1.tex").decode()
            self.assertIn(r"\put(50.000,650.000)", page)
            self.assertIn(r"50\%", page)
            self.assertIn(r"\&", page)
            self.assertIn(r"2\_3", page)
            self.assertIn("500.000,700.000", archive.read("pages/page-2.tex").decode())
            self.assertIn("XeLaTeX", archive.read("main.tex").decode())
            original = PdfReader(BytesIO(archive.read("original.pdf")))
            background = PdfReader(BytesIO(archive.read("background.pdf")))
            self.assertIn("Research results", original.pages[0].extract_text())
            self.assertFalse(background.pages[0].extract_text().strip())
            self.assertIn(b" re", background.pages[0].get_contents().get_data())
            self.assertIn(b"original.pdf", archive.read("original-layout.tex"))
            self.assertIn("FONT_SUBSTITUTION", result["warnings"])

    def test_does_not_execute_pdf_text_as_tex(self):
        self.assertEqual(tex_escape(r"\input{secret}% $ & _ # ^ ~"), r"\textbackslash{}input\{secret\}\% \$ \& \_ \# \textasciicircum{} \textasciitilde{}")

    def test_rejects_scans_encryption_and_invalid_files(self):
        for data in [sample_pdf(encrypted=True), sample_pdf(text=False), b"not a PDF", b"%PDF-" + b"x" * 5_000_000]:
            with self.assertRaises(ValueError):
                convert_pdf(data)
        with patch("app.pdf_to_latex.MAX_PAGES", 1), self.assertRaises(ValueError):
            convert_pdf(sample_pdf())

    def test_rejects_orphan_form_widgets_instead_of_losing_their_contents(self):
        writer = PdfWriter()
        writer.append(PdfReader(BytesIO(sample_pdf())))
        widget = DictionaryObject({NameObject("/Subtype"): NameObject("/Widget"), NameObject("/FT"): NameObject("/Tx"), NameObject("/T"): TextStringObject("orphan")})
        writer.pages[0][NameObject("/Annots")] = ArrayObject([writer._add_object(widget)])
        output = BytesIO()
        writer.write(output)
        with self.assertRaisesRegex(ValueError, "Flatten PDF form fields"):
            convert_pdf(output.getvalue())

    def test_internal_endpoint_rejects_unauthorized_and_malformed_uploads(self):
        import os
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from app.rag_routes import rag_router
        app = FastAPI()
        app.include_router(rag_router, prefix="/internal")
        with patch.dict(os.environ, {"INTERNAL_SERVICE_KEY": "test-key"}), TestClient(app) as client:
            self.assertEqual(client.post("/internal/pdf-to-latex", files={"file": ("x.pdf", sample_pdf())}).status_code, 403)
            self.assertEqual(client.post("/internal/pdf-to-latex", files={"file": ("x.pdf", b"invalid")}, headers={"X-Internal-Key": "test-key"}).status_code, 422)
            response = client.post("/internal/pdf-to-latex", files={"file": ("x.pdf", sample_pdf())}, headers={"X-Internal-Key": "test-key"})
            self.assertEqual(response.status_code, 200, response.text)
            response = client.post("/internal/pdf-to-latex", data={"mode": "structured"}, files={"file": ("x.pdf", structured_pdf())}, headers={"X-Internal-Key": "test-key"})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertIn("blocks", response.json())
            writer = PdfWriter()
            page = writer.add_page(PdfReader(BytesIO(sample_pdf())).pages[0])
            page.add_transformation(Transformation().translate(120, -80))
            page.mediabox = RectangleObject((120, -80, 732, 712))
            page.cropbox = RectangleObject(page.mediabox)
            page[NameObject("/UserUnit")] = FloatObject(1.5)
            output = BytesIO(); writer.write(output)
            response = client.post("/internal/pdf-to-latex", files={"file": ("offset.pdf", output.getvalue())}, headers={"X-Internal-Key": "test-key"})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertIn(r"\put(75.000,975.000)", response.json()["preview"])
            self.assertEqual(client.post("/internal/pdf-to-latex", data={"mode": "unknown"}, files={"file": ("x.pdf", sample_pdf())}, headers={"X-Internal-Key": "test-key"}).status_code, 422)
