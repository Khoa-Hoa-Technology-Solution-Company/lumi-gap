from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from urllib.parse import urlparse
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Request, Response, UploadFile
from pydantic import Field, StrictBool, StrictInt, model_validator

from app.format_checker import (MAX_TEMPLATE_BYTES, FormatRules, StrictModel, analyze_format,
                                infer_template, report_markdown)


class ProfileInput(StrictModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default='', max_length=1000)
    source_url: str = Field(default='', max_length=1500)
    rules: FormatRules
    active: StrictBool = True
    revision: StrictInt | None = Field(default=None, ge=1)

    @model_validator(mode='after')
    def valid_text(self):
        self.name = self.name.strip()
        self.source_url = self.source_url.strip()
        if not self.name or any('\x00' in s for s in (self.name, self.description, self.source_url)):
            raise ValueError('Tên không được trống và nội dung không được chứa NUL')
        if self.source_url and (urlparse(self.source_url).scheme not in {'https', 'http'} or not urlparse(self.source_url).netloc):
            raise ValueError('Nguồn hướng dẫn phải là URL HTTP/HTTPS')
        return self


class CheckInput(StrictModel):
    profile_id: StrictInt = Field(ge=1)
    request_id: UUID
    captcha_token: str = Field(default='', max_length=2048)


def format_router(database, security, storage):
    router = APIRouter(prefix='/api')

    @router.get('/format-profiles')
    def profiles(user=Depends(security.current_user)):
        return database.format_profiles()

    @router.get('/admin/format-profiles')
    def admin_profiles(actor=Depends(security.admin)):
        return database.format_profiles(admin=True)

    @router.post('/admin/format-profiles', status_code=201)
    def create_profile(body: ProfileInput, actor=Depends(security.admin)):
        return database.save_format_profile(actor['id'], body.model_dump())

    @router.put('/admin/format-profiles/{profile_id}')
    def update_profile(profile_id: int, body: ProfileInput, actor=Depends(security.admin)):
        if body.revision is None:
            raise HTTPException(422, 'Cần revision hiện tại để lưu')
        try:
            return database.save_format_profile(actor['id'], body.model_dump(), profile_id)
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc

    @router.post('/admin/format-profiles/import', status_code=201)
    async def import_profile(request: Request, file: UploadFile = File(...), name: str = Form('', max_length=120),
                             actor=Depends(security.admin)):
        security.limit(request, 'format_import', actor['id'], maximum=6)
        try:
            content = await file.read(MAX_TEMPLATE_BYTES + 1)
        finally:
            await file.close()
        if len(content) > MAX_TEMPLATE_BYTES:
            raise HTTPException(413, 'Template tối đa 10 MB')
        filename = Path((file.filename or '').replace('\\', '/')).name
        if Path(filename).suffix.lower() not in {'.pdf', '.docx', '.tex', '.json'}:
            raise HTTPException(415, 'Hỗ trợ PDF, Word .docx, LaTeX .tex và JSON. Hãy lưu file .doc thành .docx.')
        try:
            rules, notes = await asyncio.to_thread(infer_template, filename, content)
            body = ProfileInput(name=name.strip() or Path(filename).stem[:120], description='\n'.join(notes)[:1000], rules=rules, active=False)
        except Exception as exc:
            raise HTTPException(422, 'Không đọc được template. Kiểm tra định dạng, khổ trang và file không bị mã hóa/hỏng.') from exc
        return database.save_format_profile(actor['id'], body.model_dump(), template=(filename, content))

    @router.get('/admin/format-profiles/{profile_id}/template')
    def download_template(profile_id: int, actor=Depends(security.admin)):
        with database.connect() as c:
            row = c.execute('''SELECT t.* FROM format_templates t JOIN format_profiles p ON p.template_id=t.id
                               WHERE p.id=?''', (profile_id,)).fetchone()
        if not row:
            raise HTTPException(404, 'Chuẩn này không có file template đính kèm')
        suffix = Path(row['filename']).suffix.lower()
        return Response(row['content'], media_type='application/octet-stream',
                        headers={'Content-Disposition': f'attachment; filename="template-{profile_id}{suffix}"'})

    @router.get('/admin/format-profiles/{profile_id}/rules')
    def export_rules(profile_id: int, actor=Depends(security.admin)):
        profile = next((p for p in database.format_profiles(admin=True) if p['id'] == profile_id), None)
        if not profile:
            raise HTTPException(404, 'Không tìm thấy chuẩn')
        return Response(json.dumps(profile['rules'], ensure_ascii=False, indent=2), media_type='application/json',
                        headers={'Content-Disposition': f'attachment; filename="format-rules-{profile_id}.json"'})

    def own_paper(paper_id, user):
        paper = database.get_paper(paper_id, owner_id=user['id'])
        if not paper:
            raise HTTPException(404, 'Không tìm thấy bài báo')
        database.assert_storage_access(user['id'])
        return paper

    @router.get('/papers/{paper_id}/format-checks')
    def checks(paper_id: int, user=Depends(security.current_user)):
        own_paper(paper_id, user)
        return database.list_format_checks(paper_id, user['id'])

    def run_check(check_id, paper_id):
        database.update_format_check(check_id, 'running')
        try:
            check = database.format_check(check_id)
            with storage.materialize(paper_id) as local_pdf:
                result = analyze_format(local_pdf, check['profile'])
            database.update_format_check(check_id, 'completed', result)
        except Exception:
            logging.getLogger(__name__).warning('Format check %s failed; PDF may be unsupported', check_id)
            database.update_format_check(check_id, 'failed', error='Không đọc được bố cục PDF hoặc vượt giới hạn 200 trang / 2 triệu ký tự. Kiểm tra file rồi thử lại.')

    @router.post('/papers/{paper_id}/format-checks', status_code=202)
    def start_check(paper_id: int, body: CheckInput, request: Request, background_tasks: BackgroundTasks,
                    user=Depends(security.current_user)):
        paper = own_paper(paper_id, user)
        security.limit(request, 'format_check', user['id'], maximum=6)
        security.captcha(body.captcha_token, 'review')
        try:
            check_id, created = database.reserve_format_check(paper_id, user['id'], body.profile_id, str(body.request_id))
        except LookupError as exc:
            raise HTTPException(404, str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc
        if created:
            background_tasks.add_task(run_check, check_id, paper_id)
        return {'check_id': check_id, 'status': database.format_check(check_id, user['id'])['status']}

    @router.get('/format-checks/{check_id}')
    def check(check_id: int, user=Depends(security.current_user)):
        result = database.format_check(check_id, user['id'])
        if not result:
            raise HTTPException(404, 'Không tìm thấy kiểm tra')
        database.assert_storage_access(user['id'])
        return result

    @router.get('/format-checks/{check_id}/report')
    def download_report(check_id: int, kind: str = 'md', user=Depends(security.current_user)):
        result = check(check_id, user)
        if result['status'] != 'completed':
            raise HTTPException(409, 'Kiểm tra chưa hoàn tất')
        if kind not in {'md', 'json'}:
            raise HTTPException(422, 'Định dạng tải về phải là md hoặc json')
        content = json.dumps(result, ensure_ascii=False, indent=2) if kind == 'json' else report_markdown(result['result'])
        return Response(content, media_type='application/json' if kind == 'json' else 'text/markdown; charset=utf-8',
                        headers={'Content-Disposition': f'attachment; filename="format-check-{check_id}.{kind}"'})

    return router
