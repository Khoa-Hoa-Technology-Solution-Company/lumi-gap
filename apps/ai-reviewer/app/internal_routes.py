from __future__ import annotations

import os
import shutil
import tempfile
import uuid
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Request, UploadFile
from pydantic import BaseModel

from app.config import ALLOWED_STRICTNESS, OUTPUT_DIR, UPLOAD_DIR
from app.format_checker import PRESETS, analyze_format, report_markdown
from app.reviewer import GeminiReviewProvider, safe_slug, write_artifacts
from app.security import Security
from app.pre_review import PreReviewRequest, run_pre_review
from app.rag_routes import rag_router


def verify_internal_key(x_internal_key: Optional[str] = Header(None)) -> None:
    expected = os.getenv("INTERNAL_SERVICE_KEY")
    if expected and x_internal_key != expected:
        raise HTTPException(status_code=403, detail="Invalid internal service key")


def internal_router(database, security: Security) -> APIRouter:
    router = APIRouter(prefix="/internal", dependencies=[Depends(verify_internal_key)])
    router.include_router(rag_router)

    @router.get("/health")
    def internal_health() -> dict[str, Any]:
        settings = security.settings(reveal=False)
        return {
            "status": "ok",
            "service": "ai-reviewer",
            "system_gemini_configured": bool(settings.get("gemini_api_key")),
            "gemini_model": settings.get("gemini_model", "gemini-2.0-flash"),
        }

    @router.get("/format-presets")
    def get_presets() -> list[dict[str, Any]]:
        return [
            {
                "name": p["name"],
                "description": p.get("description", ""),
                "source_url": p.get("source_url", ""),
            }
            for p in PRESETS
        ]

    @router.post("/pre-review")
    def pre_review(payload: PreReviewRequest) -> dict[str, Any]:
        settings = security.settings(reveal=True)
        api_key = settings.get("gemini_api_key")
        if not api_key:
            raise HTTPException(status_code=503, detail="AI pre-review is disabled because Gemini is not configured")
        model = settings.get("gemini_model", "gemini-3.7-flash")
        try:
            analysis = run_pre_review(payload, api_key=api_key, model=model)
            return {"status": "completed", "provider": "gemini", "model": model, "analysis": analysis}
        except ValueError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=502, detail="AI pre-review could not produce valid structured analysis") from exc

    @router.post("/format-check")
    async def format_check(
        file: UploadFile = File(None),
        file_path: Optional[str] = Form(None),
        preset_name: str = Form("IEEE Conference · A4"),
    ) -> dict[str, Any]:
        selected_preset = next((p for p in PRESETS if p["name"] == preset_name), None)
        if not selected_preset:
            selected_preset = PRESETS[0]

        temp_file: Optional[Path] = None
        target_path: Optional[Path] = None

        try:
            if file_path and Path(file_path).exists():
                target_path = Path(file_path)
            elif file:
                suffix = Path(file.filename or "paper.pdf").suffix
                with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                    shutil.copyfileobj(file.file, tmp)
                    temp_file = Path(tmp.name)
                target_path = temp_file
            else:
                raise HTTPException(status_code=400, detail="Cần cung cấp file hoặc file_path hợp lệ")

            analysis = analyze_format(target_path, selected_preset)
            markdown = report_markdown(analysis)

            return {
                "preset": selected_preset["name"],
                "passed": analysis.get("outcome") == "checks_passed",
                "summary": f"Kết quả: {analysis.get('outcome')}. Lỗi: {analysis.get('counts', {}).get('fail', 0)}, Cảnh báo: {analysis.get('counts', {}).get('warning', 0)}",
                "measurements": analysis.get("measurements", {}),
                "report_markdown": markdown,
            }
        finally:
            if temp_file and temp_file.exists():
                temp_file.unlink(missing_ok=True)

    @router.post("/review")
    async def review_paper(
        file: UploadFile = File(None),
        file_path: Optional[str] = Form(None),
        strictness: str = Form("balanced"),
        api_key: Optional[str] = Form(None),
        model: Optional[str] = Form(None),
    ) -> dict[str, Any]:
        if strictness not in ALLOWED_STRICTNESS:
            raise HTTPException(status_code=422, detail=f"Strictness phải là một trong {ALLOWED_STRICTNESS}")

        settings = security.settings(reveal=True)
        active_key = api_key or settings.get("gemini_api_key")
        if not active_key:
            raise HTTPException(status_code=503, detail="Gemini API Key chưa được cấu hình")

        active_model = model or settings.get("gemini_model", "gemini-2.0-flash")

        temp_file: Optional[Path] = None
        target_path: Optional[Path] = None

        try:
            if file_path and Path(file_path).exists():
                target_path = Path(file_path)
            elif file:
                suffix = Path(file.filename or "paper.pdf").suffix
                with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                    shutil.copyfileobj(file.file, tmp)
                    temp_file = Path(tmp.name)
                target_path = temp_file
            else:
                raise HTTPException(status_code=400, detail="Cần cung cấp file hoặc file_path hợp lệ")

            provider = GeminiReviewProvider(model=active_model, api_key=active_key)
            result = provider.review(target_path, strictness)

            job_id = int(uuid.uuid4().int % 1_000_000_000)
            scores, report, out_dir = write_artifacts(result, target_path, strictness, job_id)

            rec = (
                result.get("overall_recommendation", {}).get("decision")
                or result.get("recommendation")
                or "Borderline"
            )
            bilingual_review = result.get("remarks", {}) or result.get("review", {})

            return {
                "success": True,
                "strictness": strictness,
                "model": active_model,
                "profile": result.get("profile", {}),
                "scores": scores,
                "bilingual_review": bilingual_review,
                "recommendation": rec,
                "report_markdown": report,
                "artifacts_dir": str(out_dir.resolve()),
            }
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Lỗi khi thẩm định bài báo: {str(exc)}") from exc
        finally:
            if temp_file and temp_file.exists():
                temp_file.unlink(missing_ok=True)

    return router
