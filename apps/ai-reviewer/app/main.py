from __future__ import annotations

import asyncio
import logging
import uuid
from urllib.parse import urlparse
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import BackgroundTasks, Depends, FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles

from app.config import (
    ALLOWED_STRICTNESS,
    OUTPUT_DIR,
    STATIC_DIR,
    UPLOAD_DIR,
    ensure_directories,
)
from app.db import Database
from app.account_routes import account_router
from app.format_routes import format_router
from app.storage import Storage
from app.storage_routes import storage_router
from app.storage_db import MB
from app.storage_mail import StorageMail
from app.storage_maintenance import StorageMaintenance
from app.admin_routes import admin_router
from app.security import Security, app_origin, production
from app.server_lock import server_lock
from app.pdf_utils import extract_pdf
from app.reviewer import GeminiReviewProvider, write_artifacts, safe_slug
from starlette.background import BackgroundTask


database = Database()
security = Security(database)
storage = Storage(database, lambda: UPLOAD_DIR, lambda: OUTPUT_DIR)
storage_mail = StorageMail(database, security)
storage_maintenance = StorageMaintenance(database, storage, storage_mail)


@asynccontextmanager
async def lifespan(_: FastAPI):
    ensure_directories()
    with server_lock(database.path):
        database.initialize()
        security.cipher()
        if production() and urlparse(app_origin()).scheme != "https":
            raise RuntimeError("APP_BASE_URL phải dùng HTTPS trong production")
        database.recover_reviews()
        database.recover_format_checks()
        storage.reconcile()
        storage_maintenance.start()
        try:
            yield
        finally:
            await asyncio.to_thread(storage_maintenance.stop)


from app.internal_routes import internal_router

app = FastAPI(title="Liêm Research Paper", version="1.0.0", lifespan=lifespan)
app.include_router(internal_router(database, security))
app.include_router(account_router(database, security))
app.include_router(admin_router(database, security))
app.include_router(format_router(database, security, storage))
app.include_router(storage_router(database, security, storage, storage_mail, storage_maintenance))
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", include_in_schema=False)
def index(request: Request) -> Response:
    # A host-only login cookie cannot follow a localhost / 127.0.0.1 domain switch.
    if request.headers.get('host') != urlparse(app_origin()).netloc:
        query = f'?{request.url.query}' if request.url.query else ''
        return RedirectResponse(f'{app_origin()}/{query}', status_code=307)
    return FileResponse(STATIC_DIR / "index.html")


@app.middleware("http")
async def protect_requests(request: Request, call_next):
    if request.url.path.startswith("/api/"):
        public = {'/api/health', '/api/config', '/api/auth/challenge', '/api/auth/google', '/api/payments/payos/webhook'}
        policy = database.storage_policy()
        try:
            if request.url.path != '/api/health':
                security.limit(request, 'api', maximum=policy['requests_per_minute'])
            if request.url.path not in public:
                user = security.current_user(request)
                if not database.rate_limit(f"api:user:{user['id']}", policy['requests_per_minute']):
                    raise HTTPException(429, 'Quá nhiều yêu cầu. Thử lại sau một phút.', headers={'Retry-After': '60'})
        except HTTPException as exc:
            return JSONResponse({'detail': exc.detail}, status_code=exc.status_code,
                                headers={'Cache-Control': 'no-store', **(exc.headers or {})})
        length = request.headers.get("content-length", "0")
        limit = policy['upload_max_mb'] * MB + MB if request.url.path == "/api/papers" else 65536
        if request.url.path.startswith('/api/admin/review-types'):
            limit = 1024 * 1024
        if request.url.path == '/api/admin/format-profiles/import':
            limit = 11 * 1024 * 1024
        if not length.isdigit() or int(length) > limit:
            return JSONResponse({"detail": "Yêu cầu vượt quá giới hạn dung lượng"}, status_code=413)
        if request.method not in {"GET", "HEAD", "OPTIONS"} and request.url.path != "/api/payments/payos/webhook":
            if request.headers.get("origin") not in {None, app_origin()}:
                return JSONResponse({"detail": "Nguồn yêu cầu không hợp lệ"}, status_code=403)
        # Enforce the same bound for chunked bodies, before multipart spooling / JSON parsing.
        receive = request._receive
        received = 0
        async def bounded_receive():
            nonlocal received
            message = await receive()
            if message['type'] == 'http.request':
                received += len(message.get('body', b''))
                if received > limit:
                    raise HTTPException(413, 'Yêu cầu vượt quá giới hạn dung lượng')
            return message
        request._receive = bounded_receive
    response = await call_next(request)
    if request.url.path.startswith('/api/') and received > limit:
        response = JSONResponse({'detail': 'Yêu cầu vượt quá giới hạn dung lượng'}, status_code=413)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin-allow-popups"
    return response


@app.get("/api/health")
def health() -> dict[str, object]:
    config = security.public_config()
    return {"status": "ok", "ai_configured": config["system_ready"], "provider": "gemini", "model": config["gemini_model"]}


@app.get("/api/dashboard")
def dashboard(user=Depends(security.current_user)) -> dict[str, object]:
    database.assert_storage_access(user['id'])
    return database.dashboard(owner_id=user["id"])


@app.get("/api/papers")
def list_papers(
    user=Depends(security.current_user),
    q: str = Query(default="", max_length=200),
    status: str = Query(default="", pattern="^(|pending|reviewing|reviewed|failed)$"),
) -> list[dict[str, object]]:
    database.assert_storage_access(user['id'])
    return [public_paper(p) for p in database.list_papers(q.strip(), status, owner_id=user["id"])]


@app.get("/api/papers/{paper_id}")
def get_paper(paper_id: int, user=Depends(security.current_user)) -> dict[str, object]:
    paper = database.get_paper(paper_id, owner_id=user["id"])
    if not paper:
        raise HTTPException(status_code=404, detail="Không tìm thấy bài báo")
    database.assert_storage_access(user['id'])
    return public_paper(paper)


@app.get("/api/papers/{paper_id}/file")
def get_paper_file(paper_id: int, request: Request, user=Depends(security.current_user)) -> FileResponse:
    paper = database.get_paper(paper_id, owner_id=user["id"])
    if not paper:
        raise HTTPException(status_code=404, detail="Không tìm thấy bài báo")
    database.assert_storage_access(user['id'])
    security.limit(request, 'download', user['id'], maximum=20)
    snapshot = storage.materialize(paper_id, snapshot=True)
    try:
        path = snapshot.__enter__()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(503, 'Không truy xuất được file. Kiểm tra kết nối lưu trữ hoặc thử lại.') from None
    return FileResponse(path, media_type="application/pdf", filename=paper["filename"],
                        background=BackgroundTask(snapshot.__exit__, None, None, None))


@app.get("/api/reviews/{review_id}")
def get_review(review_id: int, user=Depends(security.current_user)) -> dict[str, object]:
    review = database.get_review(review_id)
    if not review or not database.get_paper(review["paper_id"], owner_id=user["id"]):
        raise HTTPException(status_code=404, detail="Không tìm thấy báo cáo")
    database.assert_storage_access(user['id'])
    return public_review(review)


@app.post("/api/papers", status_code=201)
async def upload_paper(
    request: Request,
    user=Depends(security.current_user),
    file: UploadFile = File(...),
    title: str = Form(default="", max_length=1000),
    authors: str = Form(default="", max_length=2000),
) -> dict[str, object]:
    policy = database.storage_policy()
    security.limit(request, "upload", user["id"], maximum=policy['uploads_per_minute'])
    await asyncio.to_thread(security.captcha, request.headers.get("X-Captcha-Token", ""), "upload")
    if file.content_type not in {"application/pdf", "application/x-pdf"} or not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=415, detail="Chỉ hỗ trợ file PDF")
    safe_name = Path(file.filename.replace('\\', '/')).name
    if len(safe_name.encode('utf-8')) > 200:
        raise HTTPException(422, 'Tên file quá dài (tối đa 200 byte UTF-8)')
    if any(ord(char) < 32 or ord(char) == 127 for char in safe_name):
        raise HTTPException(422, 'Tên file chứa ký tự điều khiển không hợp lệ')
    destination = UPLOAD_DIR / f"{uuid.uuid4().hex}_{safe_name}"
    size, reservation, paper_id = 0, None, None
    try:
        reservation = database.reserve_upload(user['id'], file.size or 0, destination)
        with destination.open("wb") as output:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > policy['upload_max_mb'] * MB:
                    raise HTTPException(status_code=413, detail=f"PDF vượt quá giới hạn {policy['upload_max_mb']} MB")
                output.write(chunk)
        profile, _ = await asyncio.to_thread(extract_pdf, destination)
        if title.strip():
            profile["title"] = title.strip()
        if authors.strip():
            profile["authors"] = authors.strip()
        profile["owner_id"] = user["id"]
        profile['filename'], profile['file_size'] = safe_name, size
        paper_id = database.commit_upload(profile, reservation)
        await asyncio.to_thread(finalize_upload_storage, paper_id)
        return public_paper(database.get_paper(paper_id) or {})
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=422, detail="Không thể lưu hoặc đọc PDF. Kiểm tra file và thử lại.") from exc
    finally:
        try:
            if paper_id is None:
                # Also runs on cancellation. Keep the reservation if cleanup fails so a restart
                # can reconcile the orphan instead of silently losing its storage accounting.
                destination.unlink(missing_ok=True)
            if reservation:
                database.release_upload(reservation)
        finally:
            await file.close()


def finalize_upload_storage(paper_id):
    try:
        storage.archive(paper_id)
    finally:
        with database.connect() as c:
            c.execute('UPDATE papers SET storage_busy=0 WHERE id=?', (paper_id,))


@app.post("/api/papers/{paper_id}/review", status_code=202)
def start_review(
    paper_id: int,
    background_tasks: BackgroundTasks,
    request: Request,
    user=Depends(security.current_user),
    billing_mode: str = Form(default="system"),
    request_id: uuid.UUID | None = Form(default=None),
    strictness: str = Form(default="balanced"),
    review_type_id: int = Form(default=1),
) -> dict[str, object]:
    if strictness not in ALLOWED_STRICTNESS:
        raise HTTPException(status_code=422, detail="Strictness không hợp lệ")
    paper = database.get_paper(paper_id, owner_id=user["id"])
    if not paper:
        raise HTTPException(status_code=404, detail="Không tìm thấy bài báo")
    security.limit(request, "review", user["id"], maximum=database.storage_policy()['ai_per_minute'])
    if billing_mode not in {"system", "personal"}:
        raise HTTPException(422, "Chế độ thanh toán không hợp lệ")
    security.captcha(request.headers.get("X-Captcha-Token", ""), "review")
    settings = security.settings(reveal=True)
    if billing_mode == "personal":
        api_key = security.decrypt(user["gemini_key"])
        if not api_key:
            raise HTTPException(422, "Hãy thêm Gemini key trong hồ sơ trước khi review")
    else:
        api_key = settings["gemini_api_key"]
        if not settings["system_reviews_enabled"] or not api_key:
            raise HTTPException(503, "Review bằng credit hiện chưa sẵn sàng")
    model = settings["gemini_model"]
    try:
        job, created = database.reserve_review(paper_id, user["id"], strictness, model, billing_mode,
                                               str(request_id) if request_id else None, review_type_id)
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    if created:
        background_tasks.add_task(run_review_job, job["id"], paper_id, Path(paper["file_path"]), strictness, api_key, model)
    return {"review_id": job["id"], "status": job["status"]}


def run_review_job(review_id: int, paper_id: int, path: Path, strictness: str, api_key: str, model: str) -> None:
    database.update_review(review_id, status="running")
    output_dir = OUTPUT_DIR / safe_slug(path.stem) / f'review_{review_id}_{strictness}'
    database.update_review(review_id, output_dir=str(output_dir.resolve()))
    try:
        job = database.get_review(review_id)
        with storage.materialize(paper_id) as local_pdf:
            result = GeminiReviewProvider(model=model, api_key=api_key, review_type=job).review(local_pdf, strictness)
        scores, report, output_dir = write_artifacts(result, path, strictness, review_id)
        storage.register_outputs(paper_id, review_id, output_dir)
        storage.archive(paper_id)
        profile = result["profile"]
        database.update_paper_profile(
            paper_id,
            title=profile.get("title") or path.stem,
            authors=profile.get("authors", ""),
            paper_type=profile.get("paper_type", "Other"),
        )
        database.complete_review(review_id, paper_id, scores, report, str(output_dir.resolve()))
    except Exception:
        try:
            storage.register_outputs(paper_id, review_id, output_dir)
        except Exception:
            logging.getLogger(__name__).warning('Review %s artifacts need storage reconciliation', review_id)
        finally:
            database.fail_review(review_id, paper_id, "Không thể hoàn tất review. Kiểm tra Gemini key hoặc thử lại; credit đã được hoàn.")


def public_review(review):
    return {k: v for k, v in review.items() if k not in {"output_dir", "billing_user_id", "review_instructions"}}


def public_paper(paper):
    result = {k: v for k, v in paper.items() if k not in {"file_path", "owner_id"}}
    if "reviews" in result:
        result["reviews"] = [public_review(r) for r in result["reviews"]]
    return result
