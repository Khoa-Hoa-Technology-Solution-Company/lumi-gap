from __future__ import annotations

import hmac
from typing import Literal
from urllib.parse import urlparse
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile
from payos import ForbiddenError, UnauthorizedError, TooManyRequestsError
from payos.types import CreatePaymentLinkRequest
from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, ValidationError

from app.security import PUBLIC_SETTINGS, SECRET_SETTINGS, Security, app_origin, user_profile


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid')


class GoogleLogin(StrictModel):
    credential: str = Field(min_length=1, max_length=12000)
    captcha_token: str = Field(default='', max_length=2048)


class ProfileUpdate(StrictModel):
    name: str = Field(min_length=1, max_length=120)
    affiliation: str = Field(default='', max_length=200)
    bio: str = Field(default='', max_length=1000)


class KeyUpdate(StrictModel):
    key: str = Field(min_length=20, max_length=256, pattern=r'^\S+$')


class Topup(StrictModel):
    amount: StrictInt = Field(ge=1, le=50_000_000)
    request_id: UUID
    captcha_token: str = Field(default='', max_length=2048)


class UserAccess(StrictModel):
    role: Literal['user', 'admin']
    disabled: StrictBool


class SettingsUpdate(StrictModel):
    credit_price_vnd: StrictInt = Field(ge=1, le=1_000_000)
    minimum_topup_vnd: StrictInt = Field(ge=10000, le=50_000_000)
    gemini_model: str = Field(min_length=1, max_length=120, pattern=r'^[a-zA-Z0-9._/-]+$')
    google_client_id: str = Field(max_length=250)
    turnstile_site_key: str = Field(max_length=250)
    captcha_enabled: StrictBool
    system_reviews_enabled: StrictBool
    payos_client_id: str = Field(max_length=250)
    gemini_api_key: str | None = Field(default=None, max_length=500)
    payos_api_key: str | None = Field(default=None, max_length=500)
    payos_checksum_key: str | None = Field(default=None, max_length=500)
    turnstile_secret_key: str | None = Field(default=None, max_length=500)


class ReviewTypeUpdate(StrictModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default='', max_length=500)
    instructions: str = Field(min_length=1, max_length=131072)
    active: StrictBool = True


class BillingSettings(StrictModel):
    credit_price_vnd: StrictInt = Field(ge=1, le=1_000_000)
    minimum_topup_vnd: StrictInt = Field(ge=10000, le=50_000_000)
    payos_client_id: str = Field(max_length=250)
    payos_api_key: str | None = Field(default=None, max_length=500)
    payos_checksum_key: str | None = Field(default=None, max_length=500)


class AISettings(StrictModel):
    gemini_model: str = Field(min_length=1, max_length=120, pattern=r'^[a-zA-Z0-9._/-]+$')
    gemini_api_key: str | None = Field(default=None, max_length=500)
    system_reviews_enabled: StrictBool


class AuthSettings(StrictModel):
    google_client_id: str = Field(max_length=250)
    turnstile_site_key: str = Field(max_length=250)
    turnstile_secret_key: str | None = Field(default=None, max_length=500)
    captcha_enabled: StrictBool


def validate_review_type(body):
    if not body.name.strip() or not body.instructions.strip() or '\x00' in body.instructions:
        raise HTTPException(422, 'Tên và nội dung Markdown không được trống hoặc chứa ký tự NUL')
    if len(body.instructions.encode('utf-8')) > 131072:
        raise HTTPException(413, 'File Markdown tối đa 128 KB')
    return dict(name=body.name.strip(), description=body.description.strip(), instructions=body.instructions, active=body.active)


def account_router(database, security: Security):
    router = APIRouter(prefix='/api')

    @router.get('/config')
    def config():
        return security.public_config()

    @router.get('/review-types')
    def review_types(user=Depends(security.current_user)):
        return database.list_review_types()

    @router.get('/admin/review-types')
    def admin_review_types(actor=Depends(security.admin)):
        return database.list_review_types(admin=True)

    @router.post('/admin/review-types', status_code=201)
    def create_review_type(body: ReviewTypeUpdate, actor=Depends(security.admin)):
        return database.save_review_type(actor['id'], **validate_review_type(body))

    @router.post('/admin/review-types/import', status_code=201)
    async def import_review_type(name: str = Form(..., max_length=120), description: str = Form('', max_length=500),
                                 file: UploadFile = File(...), actor=Depends(security.admin)):
        if not (file.filename or '').lower().endswith('.md'):
            raise HTTPException(415, 'Chỉ hỗ trợ file .md')
        content = await file.read(131073)
        await file.close()
        if len(content) > 131072:
            raise HTTPException(413, 'File Markdown tối đa 128 KB')
        try:
            instructions = content.decode('utf-8-sig')
        except UnicodeDecodeError as exc:
            raise HTTPException(422, 'File Markdown phải dùng UTF-8') from exc
        if not instructions.strip():
            raise HTTPException(422, 'File Markdown không được trống')
        body = ReviewTypeUpdate(name=name, description=description, instructions=instructions)
        return database.save_review_type(actor['id'], **validate_review_type(body))

    @router.put('/admin/review-types/{type_id}')
    def edit_review_type(type_id: int, body: ReviewTypeUpdate, actor=Depends(security.admin)):
        try:
            return database.save_review_type(actor['id'], type_id=type_id, **validate_review_type(body))
        except LookupError as exc:
            raise HTTPException(404, str(exc)) from exc

    @router.get('/admin/review-types/{type_id}/file')
    def download_review_type(type_id: int, actor=Depends(security.admin)):
        template = database.review_type(type_id)
        if not template:
            raise HTTPException(404, 'Không tìm thấy loại review')
        return Response(template['instructions'], media_type='text/markdown; charset=utf-8',
                        headers={'Content-Disposition': f'attachment; filename="review-type-{type_id}.md"'})

    @router.get('/auth/challenge')
    def challenge(request: Request, response: Response):
        security.limit(request, 'challenge', maximum=12)
        nonce = database.new_challenge()
        response.set_cookie('paperscope_login', nonce, max_age=600, httponly=True,
                            secure=app_origin().startswith('https://'), samesite='strict', path='/api/auth')
        return {'nonce': nonce}

    @router.post('/auth/google')
    def google_login(body: GoogleLogin, request: Request, response: Response):
        security.limit(request, 'login', maximum=6)
        nonce = request.cookies.get('paperscope_login', '')
        if not nonce or not hmac.compare_digest(nonce, request.headers.get('X-Login-Nonce', '')):
            raise HTTPException(403, 'Phiên đăng nhập không hợp lệ. Hãy tải lại trang.')
        security.captcha(body.captcha_token, 'login')
        user = security.verify_google(body.credential, nonce)
        if not database.consume_challenge(nonce):
            raise HTTPException(401, 'Phiên đăng nhập đã hết hạn hoặc đã sử dụng')
        if user['disabled']:
            raise HTTPException(403, 'Tài khoản đã bị khóa')
        old = request.cookies.get('paperscope_session', '')
        if old:
            database.logout(old)
        try:
            token, csrf = database.new_session(user['id'])
        except ValueError as exc:
            raise HTTPException(403, str(exc)) from exc
        response.set_cookie('paperscope_session', token, max_age=7 * 86400, httponly=True,
                            secure=app_origin().startswith('https://'), samesite='lax', path='/')
        response.delete_cookie('paperscope_login', path='/api/auth')
        return {'user': user_profile(user), 'csrf_token': csrf}

    @router.get('/auth/me')
    def me(user=Depends(security.current_user)):
        return {'user': user_profile(user), 'csrf_token': user['csrf']}

    @router.post('/auth/logout')
    def logout(request: Request, response: Response, user=Depends(security.current_user)):
        database.logout(request.cookies.get('paperscope_session', ''))
        response.delete_cookie('paperscope_session', path='/')
        return {'ok': True}

    @router.patch('/profile')
    def update_profile(body: ProfileUpdate, user=Depends(security.current_user)):
        if not body.name.strip():
            raise HTTPException(422, 'Tên không được để trống')
        database.update_user(user['id'], **{k: v.strip() for k, v in body.model_dump().items()})
        return user_profile(database.user(user['id']))

    @router.put('/profile/gemini-key')
    def key(body: KeyUpdate, request: Request, user=Depends(security.current_user)):
        security.limit(request, 'key', user['id'])
        database.update_user(user['id'], gemini_key=security.encrypt(body.key))
        return {'has_gemini_key': True}

    @router.delete('/profile/gemini-key')
    def delete_key(user=Depends(security.current_user)):
        database.update_user(user['id'], gemini_key='')
        return {'has_gemini_key': False}

    @router.get('/wallet')
    def wallet(user=Depends(security.current_user)):
        return database.wallet(user['id'])

    def sync_payment(order):
        try:
            remote = security.payos().payment_requests.get(order['id'])
            if remote.order_code != order['id'] or remote.amount != order['amount']:
                raise ValueError('Payment mismatch')
            if remote.status == 'PAID' and remote.amount_paid == order['amount'] and remote.amount_remaining == 0:
                database.settle_order(order['id'], remote.amount, remote.id)
            elif remote.status in {'CANCELLED', 'EXPIRED'}:
                with database.connect() as c:
                    c.execute("UPDATE orders SET status=? WHERE id=? AND status!='paid'", (remote.status.lower(), order['id']))
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(502, 'Chưa đối soát được PayOS. Vui lòng kiểm tra lại sau.') from exc
        return database.order(order['id'], order['user_id'])

    @router.post('/wallet/topup', status_code=201)
    def topup(body: Topup, request: Request, user=Depends(security.current_user)):
        security.limit(request, 'topup', user['id'], maximum=5)
        security.captcha(body.captcha_token, 'topup')
        settings = security.settings()
        if body.amount < settings['minimum_topup_vnd'] or body.amount % settings['credit_price_vnd']:
            raise HTTPException(422, f"Nạp tối thiểu {settings['minimum_topup_vnd']:,}đ và theo bội số {settings['credit_price_vnd']:,}đ")
        client = security.payos()
        try:
            order, created = database.new_order(user['id'], str(body.request_id), body.amount,
                                                body.amount // settings['credit_price_vnd'])
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc
        if not created:
            if order['checkout_url'] or order['status'] == 'paid':
                return order
            raise HTTPException(409, 'Đơn đang được tạo hoặc cần đối soát. Kiểm tra trong lịch sử nạp.')
        try:
            link = client.payment_requests.create(CreatePaymentLinkRequest(
                order_code=order['id'], amount=order['amount'], description='LIEMRP',
                return_url=f'{app_origin()}/?payment={order["id"]}',
                cancel_url=f'{app_origin()}/?payment={order["id"]}&cancelled=1'))
            if link.order_code != order['id'] or link.amount != order['amount']:
                raise ValueError('Payment mismatch')
            parsed = urlparse(link.checkout_url)
            if parsed.scheme != 'https' or parsed.hostname != 'pay.payos.vn':
                raise ValueError('Unexpected checkout URL')
            database.link_order(order['id'], link.payment_link_id, link.checkout_url)
        except (UnauthorizedError, ForbiddenError, TooManyRequestsError) as exc:
            with database.connect() as c:
                c.execute("UPDATE orders SET status='failed' WHERE id=? AND status='creating'", (order['id'],))
            raise HTTPException(502, 'PayOS từ chối yêu cầu tạo đơn. Quản trị viên cần kiểm tra cấu hình hoặc thử lại sau.') from exc
        except Exception as exc:
            # A timeout is ambiguous: retain the order so webhook/reconciliation can recover payment.
            raise HTTPException(502, 'Chưa tạo được link PayOS. Đơn đã lưu; hãy kiểm tra lịch sử trước khi tạo đơn mới.') from exc
        return database.order(order['id'], user['id'])

    @router.get('/wallet/orders/{order_id}')
    def get_order(order_id: int, user=Depends(security.current_user)):
        order = database.order(order_id, user['id'])
        if not order:
            raise HTTPException(404, 'Không tìm thấy đơn hàng')
        return order

    @router.post('/wallet/orders/{order_id}/sync')
    def sync_order(order_id: int, request: Request, user=Depends(security.current_user)):
        security.limit(request, 'sync', user['id'], maximum=10)
        order = database.order(order_id, user['id'])
        if not order:
            raise HTTPException(404, 'Không tìm thấy đơn hàng')
        return order if order['status'] == 'paid' else sync_payment(order)

    @router.post('/payments/payos/webhook')
    def webhook(body: dict):
        client = security.payos()
        try:
            verified = client.webhooks.verify(body)
        except Exception as exc:
            raise HTTPException(400, 'Chữ ký webhook không hợp lệ') from exc
        if verified.code != '00' or verified.currency != 'VND':
            return {'ok': True}
        try:
            database.settle_order(verified.order_code, verified.amount, verified.payment_link_id)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        return {'ok': True}

    @router.get('/admin')
    def admin_overview(user=Depends(security.admin)):
        return {**database.admin_overview(), 'settings': security.settings()}

    @router.put('/admin/settings')
    def update_settings(body: SettingsUpdate, user=Depends(security.admin)):
        return save_service_settings(body.model_dump(exclude_none=True), user)

    @router.get('/admin/settings')
    def service_settings(user=Depends(security.admin)):
        return security.settings()

    @router.patch('/admin/settings/{section}')
    def update_section(section: Literal['billing', 'ai', 'auth'], body: dict, user=Depends(security.admin)):
        model = {'billing': BillingSettings, 'ai': AISettings, 'auth': AuthSettings}[section]
        try:
            values = model.model_validate(body).model_dump(exclude_none=True)
        except ValidationError:
            raise HTTPException(422, 'Cấu hình không hợp lệ. Kiểm tra các trường và giới hạn trong hướng dẫn.') from None
        return save_service_settings(values, user)

    def save_service_settings(values, user):
        current = security.settings(reveal=True)
        merged = {**current, **values}
        if merged['minimum_topup_vnd'] % merged['credit_price_vnd']:
            raise HTTPException(422, 'Mức nạp tối thiểu phải là bội số của giá credit')
        if not merged['google_client_id']:
            raise HTTPException(422, 'Google Client ID không được để trống')
        if merged['captcha_enabled'] and not (merged['turnstile_site_key'] and merged['turnstile_secret_key']):
            raise HTTPException(422, 'Cần đủ site key và secret key trước khi bật CAPTCHA')
        payment_keys = ('payos_client_id', 'payos_api_key', 'payos_checksum_key')
        if any(current[k] != merged[k] for k in payment_keys):
            with database.connect() as c:
                if c.execute("SELECT 1 FROM orders WHERE status IN ('creating','pending') LIMIT 1").fetchone():
                    raise HTTPException(409, 'Hãy đối soát các đơn đang chờ trước khi đổi cấu hình PayOS')
        for key in SECRET_SETTINGS:
            if key in values:
                values[key] = security.encrypt(values[key])
        database.save_settings(values, user['id'])
        return security.settings()

    @router.patch('/admin/users/{user_id}')
    def user_access(user_id: int, body: UserAccess, actor=Depends(security.admin)):
        try:
            database.admin_user(actor['id'], user_id, body.role, body.disabled)
        except LookupError as exc:
            raise HTTPException(404, str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        return {'ok': True}

    @router.post('/admin/claim-legacy')
    def claim_legacy(actor=Depends(security.admin)):
        return {'count': database.claim_legacy(actor['id'])}

    @router.post('/admin/orders/{order_id}/sync')
    def admin_sync(order_id: int, request: Request, actor=Depends(security.admin)):
        security.limit(request, 'sync', actor['id'], maximum=10)
        order = database.order(order_id)
        if not order:
            raise HTTPException(404, 'Không tìm thấy đơn hàng')
        return sync_payment(order)

    return router
