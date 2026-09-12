from __future__ import annotations

import hmac
import os
from urllib.parse import urlparse

import httpx
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException, Request
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token
from payos import PayOS

from app.config import DATA_DIR


SECRET_SETTINGS = {'gemini_api_key', 'payos_api_key', 'payos_checksum_key', 'turnstile_secret_key'}
PUBLIC_SETTINGS = {'credit_price_vnd', 'minimum_topup_vnd', 'gemini_model', 'google_client_id',
                   'turnstile_site_key', 'captcha_enabled', 'payos_client_id', 'system_reviews_enabled'}


def production():
    return os.getenv('APP_ENV', 'development') == 'production'


def app_origin():
    return os.getenv('APP_BASE_URL', 'http://localhost:8000').rstrip('/')


class Security:
    def __init__(self, database):
        self.db = database

    def cipher(self):
        key = os.getenv('APP_ENCRYPTION_KEY', '').strip()
        source = 'APP_ENCRYPTION_KEY'
        if not key:
            if production():
                raise RuntimeError('APP_ENCRYPTION_KEY bắt buộc trong production')
            path = DATA_DIR / '.encryption-key'
            source = 'data/.encryption-key'
            path.parent.mkdir(parents=True, exist_ok=True)
            try:
                with path.open('xb') as f:
                    f.write(Fernet.generate_key())
                path.chmod(0o600)
            except FileExistsError:
                pass
            key = path.read_bytes().strip()
        try:
            return Fernet(key)
        except (ValueError, TypeError):
            raise RuntimeError(
                f'{source} không hợp lệ: cần khóa Fernet gồm 32 byte được mã hóa URL-safe Base64 '
                '(thường dài 44 ký tự, kết thúc bằng =). Đây không phải Gemini API key hay mật khẩu. '
                'Dùng khóa mã hóa đã sao lưu; chỉ tạo khóa mới bằng Fernet.generate_key() '
                'khi chưa có dữ liệu mã hóa. Xem README, mục Gemini và lưu key.'
            ) from None

    def encrypt(self, value):
        return self.cipher().encrypt(value.encode()).decode() if value else ''

    def decrypt(self, value):
        try:
            return self.cipher().decrypt(value.encode()).decode() if value else ''
        except InvalidToken as exc:
            raise HTTPException(503, 'Không giải mã được API key. Quản trị viên cần kiểm tra khóa mã hóa.') from exc

    def settings(self, reveal=False):
        values = {
            'credit_price_vnd': 100, 'minimum_topup_vnd': 10000,
            'gemini_model': os.getenv('GEMINI_MODEL', 'gemini-3.7-flash'),
            'google_client_id': os.getenv('GOOGLE_CLIENT_ID', ''),
            'turnstile_site_key': os.getenv('TURNSTILE_SITE_KEY', ''),
            'captcha_enabled': os.getenv('CAPTCHA_ENABLED', 'false').strip().lower() == 'true',
            'system_reviews_enabled': True,
            'payos_client_id': os.getenv('PAYOS_CLIENT_ID', ''),
        }
        stored = self.db.settings_values()
        values.update({k: v for k, v in stored.items() if k in PUBLIC_SETTINGS})
        for key in SECRET_SETTINGS:
            value = (self.decrypt(stored[key]) if reveal else stored[key]) if key in stored else os.getenv(key.upper(), '')
            values[key if reveal else key + '_configured'] = value if reveal else bool(value)
        return values

    def public_config(self):
        s = self.settings()
        return {**{k: s[k] for k in ('google_client_id', 'turnstile_site_key', 'captcha_enabled',
                                     'credit_price_vnd', 'minimum_topup_vnd', 'gemini_model')},
                'upload_max_mb': self.db.storage_policy()['upload_max_mb'],
                'review_cost': 10, 'system_review_cost': 10, 'personal_review_cost': 3,
                'system_ready': s['system_reviews_enabled'] and s['gemini_api_key_configured'],
                'payos_ready': all(s[k] for k in ('payos_client_id', 'payos_api_key_configured', 'payos_checksum_key_configured'))}

    def limit(self, request, action, user_id=None, maximum=10, seconds=60):
        peer = request.client.host if request.client else 'unknown'
        if not self.db.rate_limit(f'{action}:ip:{peer}', maximum * 5, seconds):
            raise HTTPException(429, 'Quá nhiều yêu cầu. Vui lòng thử lại sau.', headers={'Retry-After': str(seconds)})
        if user_id is not None and not self.db.rate_limit(f'{action}:user:{user_id}', maximum, seconds):
            raise HTTPException(429, 'Quá nhiều yêu cầu. Vui lòng thử lại sau.', headers={'Retry-After': str(seconds)})

    def current_user(self, request: Request):
        user = self.db.session(request.cookies.get('paperscope_session', ''))
        if not user:
            raise HTTPException(401, 'Vui lòng đăng nhập')
        if request.method not in {'GET', 'HEAD', 'OPTIONS'}:
            if not hmac.compare_digest(request.headers.get('X-CSRF-Token', ''), user['csrf']):
                raise HTTPException(403, 'Phiên xác thực không hợp lệ. Hãy tải lại trang.')
        return user

    def admin(self, request: Request):
        user = self.current_user(request)
        if user['role'] != 'admin':
            raise HTTPException(403, 'Chỉ quản trị viên được sử dụng chức năng này')
        return user

    def captcha(self, token, action):
        s = self.settings()
        if not s['captcha_enabled']:
            return
        s = self.settings(reveal=True)
        if not s['turnstile_site_key'] or not s['turnstile_secret_key']:
            raise HTTPException(503, 'CAPTCHA chưa được quản trị viên cấu hình')
        if not token or len(token) > 2048:
            raise HTTPException(400, 'Vui lòng hoàn tất CAPTCHA')
        try:
            response = httpx.post('https://challenges.cloudflare.com/turnstile/v0/siteverify',
                                  data={'secret': s['turnstile_secret_key'], 'response': token}, timeout=10)
            response.raise_for_status()
            result = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise HTTPException(503, 'Không thể xác minh CAPTCHA. Hãy thử lại.') from exc
        if (not result.get('success') or result.get('action') != action
                or result.get('hostname') != urlparse(app_origin()).hostname):
            raise HTTPException(400, 'CAPTCHA không hợp lệ hoặc đã hết hạn')

    def verify_google(self, credential, nonce):
        client_id = self.settings()['google_client_id']
        if not client_id:
            raise HTTPException(503, 'Google Login chưa được cấu hình')
        try:
            claims = id_token.verify_oauth2_token(credential, GoogleRequest(), client_id)
        except Exception as exc:
            raise HTTPException(401, 'Không thể xác minh tài khoản Google') from exc
        if (claims.get('iss') not in {'accounts.google.com', 'https://accounts.google.com'}
                or claims.get('aud') != client_id or not claims.get('sub')
                or claims.get('email_verified') is not True or not claims.get('email')
                or not hmac.compare_digest(str(claims.get('nonce', '')), nonce)):
            raise HTTPException(401, 'Tài khoản Google không hợp lệ')
        email = claims['email'].lower()
        admin_emails = {s.strip().lower() for s in os.getenv('ADMIN_EMAILS', '').split(',') if s.strip()}
        admin_subs = {s.strip() for s in os.getenv('ADMIN_GOOGLE_SUBS', '').split(',') if s.strip()}
        authoritative_email = email.endswith('@gmail.com') or bool(claims.get('hd'))
        admin = claims['sub'] in admin_subs or (email in admin_emails and authoritative_email)
        return self.db.google_user(claims['sub'], email, claims.get('name') or email, admin)

    def payos(self):
        s = self.settings(reveal=True)
        if not all(s[k] for k in ('payos_client_id', 'payos_api_key', 'payos_checksum_key')):
            raise HTTPException(503, 'PayOS chưa được cấu hình')
        return PayOS(client_id=s['payos_client_id'], api_key=s['payos_api_key'],
                     checksum_key=s['payos_checksum_key'], timeout=15, max_retries=0)


def user_profile(user):
    return {**{k: user[k] for k in ('id', 'email', 'name', 'affiliation', 'bio', 'role', 'credits', 'created_at')},
            'has_gemini_key': bool(user['gemini_key'])}
