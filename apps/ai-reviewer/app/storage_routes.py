import os
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt

from app.storage import Drive
from app.storage_mail import email_address


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid')


class StorageSettings(StrictModel):
    storage_base_mb: StrictInt = Field(ge=1, le=102400)
    upload_max_mb: StrictInt = Field(ge=1, le=200)
    storage_price_credits: StrictInt = Field(ge=1, le=1000000)
    storage_sales_enabled: StrictBool
    storage_backend: Literal['local', 'drive']
    drive_folder_id: str = Field(default='', max_length=200, pattern=r'^[A-Za-z0-9_-]*$')
    requests_per_minute: StrictInt = Field(ge=30, le=10000)
    uploads_per_minute: StrictInt = Field(ge=1, le=60)
    ai_per_minute: StrictInt = Field(ge=1, le=60)
    ai_per_day: StrictInt = Field(ge=1, le=10000)
    ai_concurrent: StrictInt = Field(ge=1, le=10)
    ai_global_concurrent: StrictInt = Field(ge=1, le=32)
    format_per_day: StrictInt = Field(ge=1, le=10000)
    format_global_concurrent: StrictInt = Field(default=4, ge=1, le=16)


class Purchase(StrictModel):
    quote_id: UUID
    request_id: UUID


class Quote(StrictModel):
    action: Literal['add', 'renew']
    units: StrictInt = Field(default=0, ge=0, le=100)


class Folder(StrictModel):
    folder_id: str = Field(min_length=1, max_length=200, pattern=r'^[A-Za-z0-9_-]+$')


class MailSettings(StrictModel):
    smtp_enabled: StrictBool
    smtp_host: str = Field(max_length=253, pattern=r'^[A-Za-z0-9.-]*$')
    smtp_port: StrictInt = Field(ge=1, le=65535)
    smtp_username: str = Field(default='', max_length=254)
    smtp_from: str = Field(default='', max_length=254)
    smtp_security: Literal['starttls', 'ssl', 'none']
    smtp_password: str | None = Field(default=None, max_length=1024)


def storage_router(database, security, storage, mail, maintenance):
    router = APIRouter(prefix='/api')

    @router.get('/storage')
    def dashboard(user=Depends(security.current_user)):
        return database.storage_dashboard(user['id'])

    @router.post('/storage/purchases')
    def purchase(body: Purchase, request: Request, user=Depends(security.current_user)):
        security.limit(request, 'storage_purchase', user['id'], maximum=6)
        return database.buy_storage(user['id'], str(body.quote_id), str(body.request_id))

    @router.post('/storage/quotes')
    def quote(body: Quote, request: Request, user=Depends(security.current_user)):
        security.limit(request, 'storage_quote', user['id'], maximum=20)
        return database.storage_quote(user['id'], body.action, body.units)

    @router.delete('/papers/{paper_id}')
    def delete(paper_id: int, request: Request, user=Depends(security.current_user)):
        security.limit(request, 'paper_delete', user['id'], maximum=30)
        return storage.delete_paper(paper_id, user['id'])

    @router.get('/admin/storage/settings')
    def settings(actor=Depends(security.admin)):
        with database.connect() as c:
            pending = c.execute("SELECT COUNT(*) FROM stored_files WHERE drive_id!='' AND backend='local' AND deleted=0").fetchone()[0]
        return {'settings': database.storage_policy(), 'drive_credentials_configured': bool(os.getenv('SYSTEM_DRIVE_CREDENTIALS_FILE')),
                'pending_drive_files': pending, 'mail': mail.settings(), 'maintenance': maintenance.status()}

    @router.put('/admin/storage/email')
    def save_mail(body: MailSettings, actor=Depends(security.admin)):
        if body.smtp_enabled and (not body.smtp_host or not body.smtp_from):
            raise HTTPException(422, 'Cần SMTP host và email gửi để bật thông báo')
        if body.smtp_from:
            try:
                email_address(body.smtp_from)
            except ValueError as exc:
                raise HTTPException(422, str(exc)) from exc
        values = body.model_dump(exclude_none=True)
        if 'smtp_password' in values:
            values['smtp_password'] = security.encrypt(values['smtp_password'])
        database.save_settings(values, actor['id'])
        return {'saved': True}

    @router.post('/admin/storage/email/test')
    def test_mail(request: Request, actor=Depends(security.admin)):
        security.limit(request, 'smtp_test', actor['id'], maximum=3)
        try:
            import uuid
            mail.send(actor['email'], 'Liêm Research Paper: kiểm tra email hệ thống',
                      'Đây là email kiểm tra cấu hình SMTP thông báo dung lượng do bạn yêu cầu.', f'test:{uuid.uuid4()}')
        except Exception:
            raise HTTPException(503, 'Không gửi được email thử. Kiểm tra SMTP, TLS, tài khoản và quyền gửi.') from None
        return {'sent': True, 'recipient': actor['email']}

    def test_folder(folder_id):
        drive = None
        try:
            drive = Drive()
            folder = drive.folder(folder_id)
            return {'connected': True, 'folder_name': folder['name']}
        except Exception:
            raise HTTPException(503, 'Chưa kết nối được Drive hoặc thiếu quyền thêm/xóa file. Kiểm tra credentials, Drive API và thư mục hệ thống.') from None
        finally:
            if drive:
                drive.close()

    @router.post('/admin/storage/drive/test')
    def test(body: Folder, request: Request, actor=Depends(security.admin)):
        security.limit(request, 'drive_test', actor['id'], maximum=6)
        return test_folder(body.folder_id)

    @router.put('/admin/storage/settings')
    def save(body: StorageSettings, actor=Depends(security.admin)):
        if body.storage_backend == 'drive':
            if not body.drive_folder_id:
                raise HTTPException(422, 'Cần ID thư mục Drive')
            test_folder(body.drive_folder_id)
        database.save_settings(body.model_dump(), actor['id'])
        return {'saved': True}

    @router.patch('/admin/storage/settings/{section}')
    def save_section(section: Literal['storage', 'limits'], body: dict, actor=Depends(security.admin)):
        storage_keys = {'storage_base_mb', 'upload_max_mb', 'storage_price_credits', 'storage_sales_enabled', 'storage_backend', 'drive_folder_id'}
        keys = storage_keys if section == 'storage' else set(StorageSettings.model_fields) - storage_keys
        if set(body) != keys:
            raise HTTPException(422, 'Cần đúng các trường cấu hình của mục đang sửa')
        try:
            validated = StorageSettings.model_validate({**database.storage_policy(), **body})
        except ValueError:
            raise HTTPException(422, 'Cấu hình không hợp lệ. Kiểm tra giới hạn của từng trường.') from None
        if section == 'storage' and validated.storage_backend == 'drive':
            if not validated.drive_folder_id:
                raise HTTPException(422, 'Cần ID thư mục Drive')
            test_folder(validated.drive_folder_id)
        database.save_settings(body, actor['id'])
        return {'saved': True}

    def transfer(paper_id):
        try:
            storage.archive(paper_id, force=True)
        finally:
            with database.connect() as c:
                c.execute('UPDATE papers SET storage_busy=0 WHERE id=?', (paper_id,))

    @router.post('/papers/{paper_id}/storage/drive', status_code=202)
    def retry_transfer(paper_id: int, request: Request, background_tasks: BackgroundTasks, user=Depends(security.current_user)):
        security.limit(request, 'drive_transfer', user['id'], maximum=6)
        with database.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            if not c.execute('SELECT 1 FROM papers WHERE id=? AND owner_id=?', (paper_id, user['id'])).fetchone():
                raise HTTPException(404, 'Không tìm thấy bài báo')
            policy = database.storage_policy(c)
            if policy['storage_backend'] != 'drive' or not policy['drive_folder_id']:
                raise HTTPException(409, 'Admin chưa bật lưu trữ Drive')
            database.assert_paper_idle_storage(c, paper_id)
            if (c.execute("SELECT 1 FROM reviews WHERE paper_id=? AND status IN ('queued','running')", (paper_id,)).fetchone()
                    or c.execute("SELECT 1 FROM format_checks WHERE paper_id=? AND status IN ('queued','running')", (paper_id,)).fetchone()):
                raise HTTPException(409, 'Hãy chờ review/kiểm tra hoàn tất')
            c.execute('UPDATE papers SET storage_busy=1 WHERE id=?', (paper_id,))
        background_tasks.add_task(transfer, paper_id)
        return {'status': 'transferring'}

    return router
