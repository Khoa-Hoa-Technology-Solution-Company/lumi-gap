from __future__ import annotations

import asyncio
import hmac
import os
import json
import sys
import signal
import base64
from typing import Literal
from typing import Optional
from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from app.rag_extraction import MAX_BYTES, extract_rag_pages
from app.pdf_to_latex import MAX_BYTES as LATEX_MAX_BYTES


def require_extraction_key(x_internal_key: Optional[str] = Header(None)) -> None:
    expected = os.getenv("INTERNAL_SERVICE_KEY")
    if not expected:
        raise HTTPException(status_code=503, detail="Internal service key is required for extraction")
    if not x_internal_key or not hmac.compare_digest(expected, x_internal_key):
        raise HTTPException(status_code=403, detail="Invalid internal service key")


rag_router = APIRouter(dependencies=[Depends(require_extraction_key)])
pdf_conversion_slots = asyncio.Semaphore(1)


@rag_router.post("/pdf-to-latex")
async def pdf_to_latex(file: UploadFile = File(...), mode: Literal["layout", "structured"] = Form("layout")) -> dict:
    acquired = False
    process = None
    try:
        data = await file.read(LATEX_MAX_BYTES + 1)
        if len(data) > LATEX_MAX_BYTES:
            raise ValueError("Choose a PDF no larger than 5 MB")
        try:
            await asyncio.wait_for(pdf_conversion_slots.acquire(), timeout=2)
            acquired = True
        except TimeoutError as exc:
            raise HTTPException(status_code=503, detail="PDF converter is busy; try again shortly") from exc
        process = await asyncio.create_subprocess_exec(sys.executable, "-m", "app.pdf_to_latex_worker", mode,
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            start_new_session=True)
        stdout, _ = await asyncio.wait_for(process.communicate(data), timeout=300)
        if process.returncode or len(stdout) > 14_000_000:
            raise ValueError("PDF could not be converted within server limits")
        result = json.loads(stdout)
        if "error" in result:
            raise ValueError(result["error"])
        return result
    except HTTPException:
        raise
    except TimeoutError as exc:
        raise HTTPException(status_code=422, detail="PDF conversion exceeded 300 seconds; try a shorter document") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=422, detail="PDF could not be converted") from exc
    finally:
        if process and process.returncode is None:
            try:
                if os.name == "posix":
                    os.killpg(process.pid, signal.SIGKILL)
                else:
                    process.kill()
            except ProcessLookupError:
                pass
            await process.wait()
        if acquired:
            pdf_conversion_slots.release()
        await file.close()


@rag_router.post("/pdf-comparison")
async def pdf_comparison(original: UploadFile = File(...), generated: UploadFile = File(...)) -> dict:
    """Private, bounded comparison of the real compiler output; no persisted files."""
    acquired = False
    process = None
    try:
        source = await original.read(LATEX_MAX_BYTES + 1)
        output = await generated.read(20_000_001)
        if not 0 < len(source) <= LATEX_MAX_BYTES or not 0 < len(output) <= 20_000_000:
            raise ValueError("PDF comparison exceeds server limits")
        if not source.startswith(b"%PDF-") or not output.startswith(b"%PDF-"):
            raise ValueError("PDF comparison requires two PDFs")
        try:
            await asyncio.wait_for(pdf_conversion_slots.acquire(), timeout=2)
            acquired = True
        except TimeoutError as exc:
            raise HTTPException(status_code=503, detail="PDF converter is busy; comparison unavailable") from exc
        payload = json.dumps({"original": base64.b64encode(source).decode("ascii"),
                              "generated": base64.b64encode(output).decode("ascii")}).encode("ascii")
        process = await asyncio.create_subprocess_exec(sys.executable, "-m", "app.pdf_to_latex_worker", "compare",
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            start_new_session=True)
        stdout, _ = await asyncio.wait_for(process.communicate(payload), timeout=25)
        if process.returncode or len(stdout) > 80_000:
            raise ValueError("PDF comparison unavailable within server limits")
        result = json.loads(stdout)
        if "error" in result:
            raise ValueError(result["error"])
        return result
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=422, detail="PDF comparison unavailable within server limits") from exc
    finally:
        if process and process.returncode is None:
            try:
                if os.name == "posix":
                    os.killpg(process.pid, signal.SIGKILL)
                else:
                    process.kill()
            except ProcessLookupError:
                pass
            await process.wait()
        if acquired:
            pdf_conversion_slots.release()
        await original.close()
        await generated.close()


@rag_router.post("/extract-text")
async def extract_text(file: UploadFile = File(...)) -> dict:
    try:
        data = await file.read(MAX_BYTES + 1)
        return await asyncio.to_thread(extract_rag_pages, data)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=422, detail="PDF could not be parsed") from exc
    finally:
        await file.close()
