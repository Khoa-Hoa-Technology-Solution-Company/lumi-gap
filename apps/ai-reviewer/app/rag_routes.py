from __future__ import annotations

import asyncio
import hmac
import os
from typing import Optional
from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile
from app.rag_extraction import MAX_BYTES, extract_rag_pages


def require_extraction_key(x_internal_key: Optional[str] = Header(None)) -> None:
    expected = os.getenv("INTERNAL_SERVICE_KEY")
    if not expected:
        raise HTTPException(status_code=503, detail="Internal service key is required for extraction")
    if not x_internal_key or not hmac.compare_digest(expected, x_internal_key):
        raise HTTPException(status_code=403, detail="Invalid internal service key")


rag_router = APIRouter(dependencies=[Depends(require_extraction_key)])


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
