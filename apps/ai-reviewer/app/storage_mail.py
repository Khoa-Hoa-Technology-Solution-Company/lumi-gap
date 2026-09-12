"""System SMTP for storage notices; secrets never leave the server."""
import hashlib
import os
import re
import smtplib
import ssl
from datetime import datetime, timezone
from email.message import EmailMessage
from email.utils import formatdate

from app.security import app_origin

MAIL_DEFAULTS = {'smtp_enabled': False, 'smtp_host': '', 'smtp_port': 587, 'smtp_username': '',
                 'smtp_from': '', 'smtp_security': 'starttls'}


def email_address(value):
    if not re.fullmatch(r'[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+', value or ''):
        raise ValueError('Địa chỉ email không hợp lệ')
    return value


def utc_date(timestamp):
    return datetime.fromtimestamp(timestamp, timezone.utc).strftime('%d/%m/%Y %H:%M UTC')


class StorageMail:
    def __init__(self, database, security):
        self.db, self.security = database, security

    def settings(self, reveal=False):
        values = {k: os.getenv(k.upper(), default) for k, default in MAIL_DEFAULTS.items()}
        values['smtp_enabled'] = str(values['smtp_enabled']).lower() == 'true'
        values['smtp_port'] = int(values['smtp_port'])
        stored = self.db.settings_values()
        values.update({k: v for k, v in stored.items() if k in MAIL_DEFAULTS})
        raw = stored.get('smtp_password')
        password = self.security.decrypt(raw) if raw is not None and reveal else os.getenv('SMTP_PASSWORD', '') if raw is None else raw
        values['smtp_password' if reveal else 'smtp_password_configured'] = password if reveal else bool(password)
        return values

    def send(self, recipient, subject, body, reference):
        config = self.settings(reveal=True)
        if not config['smtp_enabled'] or not config['smtp_host'] or not config['smtp_from']:
            raise RuntimeError('SMTP chưa được bật/cấu hình')
        recipient, sender = email_address(recipient), email_address(config['smtp_from'])
        message = EmailMessage()
        message['From'], message['To'], message['Subject'] = sender, recipient, subject
        message['Date'] = formatdate(localtime=False, usegmt=True)
        digest = hashlib.sha256(f'{app_origin()}:{reference}'.encode()).hexdigest()
        message['Message-ID'] = f'<lrp-{digest}@{sender.split("@")[1]}>'
        message.set_content(body)
        context = ssl.create_default_context()
        client = smtplib.SMTP_SSL(config['smtp_host'], config['smtp_port'], timeout=15, context=context) if config['smtp_security'] == 'ssl' else smtplib.SMTP(config['smtp_host'], config['smtp_port'], timeout=15)
        try:
            client.ehlo()
            if config['smtp_security'] == 'starttls':
                client.starttls(context=context)
                client.ehlo()
            if config['smtp_username']:
                client.login(config['smtp_username'], config['smtp_password'])
            if client.send_message(message):
                raise RuntimeError('SMTP không chấp nhận người nhận')
        finally:
            # A failure on QUIT after DATA was accepted must not turn success into a retry.
            client.close()

    def send_notice(self, item, sub, usage, user, deleted_count=0):
        if item['kind'] == 'deleted':
            subject = 'Liêm Research Paper: đã dọn dữ liệu vượt dung lượng'
            body = (f'Hệ thống đã xóa vĩnh viễn {deleted_count} bài cũ theo chính sách hết hạn dung lượng.\n'
                    f'Dung lượng còn dùng: {usage["used_bytes"] / 1048576:.2f} MB.\n'
                    'Xem thư viện còn lại và quản lý dung lượng trong ứng dụng.')
        else:
            titles = {'reminder': 'nhắc gia hạn dung lượng', 'expired': 'gói dung lượng đã hết hạn',
                      'last_call': 'sắp xóa bài vượt dung lượng'}
            subject = 'Liêm Research Paper: ' + titles[item['kind']]
            missing = max(0, sub['renewal_cost'] - user['credits'])
            body = (f'Tổng dung lượng mua thêm: {sub["units"] * 100} MB.\n'
                    f'Ngày gia hạn chung: {utc_date(sub["expires_at"])}.\n'
                    f'Phí gia hạn toàn bộ dung lượng cho 30 ngày tiếp theo: {sub["renewal_cost"]} credit theo giá hiện tại.\n'
                    f'Số dư: {user["credits"]} credit. Cần nạp thêm ít nhất {missing} credit.\n'
                    f'Dung lượng miễn phí: {usage["base_bytes"] / 1048576:g} MB; đang dùng {usage["used_bytes"] / 1048576:.2f} MB.\n\n'
                    'Khi gói hết hạn và tài khoản vượt mức miễn phí, toàn bộ thư viện bị khóa xem. '
                    'Bạn vẫn có thể gia hạn hoặc chọn bài để xóa.\n'
                    f'Nếu chưa gia hạn/dọn bớt, từ {utc_date(sub["delete_after"])} hệ thống sẽ xóa vĩnh viễn các bài cũ nhất '
                    'cùng PDF, báo cáo và file local/Drive cho đến khi về trong mức miễn phí.\n'
                    'Phí được xác nhận lại trên web trước khi thanh toán. Thông báo này không tự trừ credit.')
        body += f'\n\nMở {app_origin()}/?view=storage để gia hạn hoặc quản lý dung lượng.\nLiêm Research Paper'
        self.send(user['email'], subject, body, f"storage:{item['user_id']}:{item['cycle']}:{item['kind']}")
