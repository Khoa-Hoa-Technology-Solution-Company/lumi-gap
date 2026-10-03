import unittest
import os
from io import BytesIO
from unittest.mock import patch
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject
from app.rag_extraction import extract_rag_pages


def pdf_bytes(text=True, encrypted=False):
    writer = PdfWriter()
    page = writer.add_blank_page(width=612, height=792)
    if text:
        font = DictionaryObject({NameObject("/Type"): NameObject("/Font"), NameObject("/Subtype"): NameObject("/Type1"), NameObject("/BaseFont"): NameObject("/Helvetica")})
        page[NameObject("/Resources")] = DictionaryObject({NameObject("/Font"): DictionaryObject({NameObject("/F1"): writer._add_object(font)})})
        stream = DecodedStreamObject()
        stream.set_data(b"BT /F1 12 Tf 50 700 Td (We evaluate Random Forest on the Adult dataset. We report limitations and require external validation.) Tj ET")
        page[NameObject("/Contents")] = writer._add_object(stream)
    writer.add_blank_page(width=612, height=792)
    if encrypted:
        writer.encrypt("secret")
    output = BytesIO()
    writer.write(output)
    return output.getvalue()


class RagExtractionTests(unittest.TestCase):
    def test_preserves_pdf_page_numbers_and_flags_image_pages(self):
        result = extract_rag_pages(pdf_bytes())
        self.assertEqual(result["pageCount"], 2)
        self.assertEqual(result["pages"][0]["pageNumber"], 1)
        self.assertIn("Random Forest", result["pages"][0]["text"])
        self.assertIn("2", result["warnings"][0])

    def test_rejects_scanned_or_encrypted_pdf(self):
        for data in [pdf_bytes(text=False), pdf_bytes(encrypted=True)]:
            with self.assertRaises(ValueError):
                extract_rag_pages(data)

    def test_rejects_html_and_page_limit(self):
        with self.assertRaises(ValueError):
            extract_rag_pages(b"<html>publisher landing page</html>")
        with patch("app.rag_extraction.MAX_PAGES", 1), self.assertRaises(ValueError):
            extract_rag_pages(pdf_bytes())

    def test_internal_endpoint_requires_key_and_returns_page_text_without_llm(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from app.rag_routes import rag_router
        app = FastAPI()
        app.include_router(rag_router, prefix="/internal")
        with patch.dict(os.environ, {"INTERNAL_SERVICE_KEY": "test-rag-key"}), TestClient(app) as client:
            files = {"file": ("paper.pdf", pdf_bytes(), "application/pdf")}
            self.assertEqual(client.post("/internal/extract-text", files=files).status_code, 403)
            response = client.post("/internal/extract-text", files=files, headers={"X-Internal-Key": "test-rag-key"})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["pages"][0]["pageNumber"], 1)
            self.assertIn("Random Forest", response.json()["pages"][0]["text"])
