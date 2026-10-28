import asyncio
import os
import unittest
from io import BytesIO
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.testclient import TestClient
from app.rag_routes import pdf_comparison, rag_router


class ComparisonRouteTests(unittest.TestCase):
    def test_requires_internal_key_and_rejects_non_pdf_input(self):
        app = FastAPI()
        app.include_router(rag_router, prefix="/internal")
        with patch.dict(os.environ, {"INTERNAL_SERVICE_KEY": "comparison-test-key"}), TestClient(app) as client:
            files = {"original": ("original.pdf", b"not a PDF", "application/pdf"),
                     "generated": ("generated.pdf", b"%PDF-test", "application/pdf")}
            self.assertEqual(client.post("/internal/pdf-comparison", files=files).status_code, 403)
            with patch("app.rag_routes.asyncio.create_subprocess_exec") as spawn:
                response = client.post("/internal/pdf-comparison", files=files,
                                       headers={"X-Internal-Key": "comparison-test-key"})
                self.assertEqual(response.status_code, 422)
                spawn.assert_not_called()

    def test_timeout_kills_process_group_and_closes_both_uploads(self):
        async def run():
            source, output = UploadFile(file=BytesIO(b"%PDF-source")), UploadFile(file=BytesIO(b"%PDF-output"))
            process = MagicMock(returncode=None, pid=12345)
            process.communicate = AsyncMock(side_effect=TimeoutError)
            process.wait = AsyncMock()
            with patch("app.rag_routes.pdf_conversion_slots", asyncio.Semaphore(1)) as slots, \
                    patch("app.rag_routes.asyncio.create_subprocess_exec", AsyncMock(return_value=process)), \
                    patch("app.rag_routes.os.killpg", create=True) as kill:
                with self.assertRaises(HTTPException) as error:
                    await pdf_comparison(source, output)
                self.assertEqual(error.exception.status_code, 422)
                if os.name == "posix":
                    kill.assert_called_once()
                else:
                    process.kill.assert_called_once()
                process.wait.assert_awaited_once()
                self.assertFalse(slots.locked())
                self.assertTrue(source.file.closed)
                self.assertTrue(output.file.closed)
        asyncio.run(run())


if __name__ == "__main__":
    unittest.main()
