"""Account storage and atomic credit accounting, shared across SQLite connections."""
from __future__ import annotations

import hashlib
import json
import secrets
import time


ACCOUNT_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY, google_sub TEXT NOT NULL UNIQUE, email TEXT NOT NULL,
 name TEXT NOT NULL, affiliation TEXT NOT NULL DEFAULT '', bio TEXT NOT NULL DEFAULT '',
 role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
 disabled INTEGER NOT NULL DEFAULT 0, credits INTEGER NOT NULL DEFAULT 0 CHECK(credits>=0),
 gemini_key TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
 csrf TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS login_challenges (
 token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS rate_limits (
 bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
 id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
 request_id TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>0),
 credits INTEGER NOT NULL CHECK(credits>0), status TEXT NOT NULL DEFAULT 'creating',
 payment_link_id TEXT NOT NULL DEFAULT '', checkout_url TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, paid_at TEXT,
 UNIQUE(user_id,request_id)
);
CREATE TABLE IF NOT EXISTS credit_ledger (
 id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
 delta INTEGER NOT NULL, kind TEXT NOT NULL, reference TEXT NOT NULL UNIQUE,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS admin_audit (
 id INTEGER PRIMARY KEY, actor_id INTEGER NOT NULL REFERENCES users(id),
 action TEXT NOT NULL, detail TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS app_migrations (
 name TEXT PRIMARY KEY, detail TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"""


def token_hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


class AccountsMixin:
    def migrate_credit_pricing(self):
        """Normalize existing balances, ledger and order/review snapshots to the new credit unit once."""
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            if c.execute("SELECT 1 FROM app_migrations WHERE name='credit_unit_v2'").fetchone():
                return
            row = c.execute("SELECT value FROM settings WHERE key='credit_price_vnd'").fetchone()
            old_price = int(json.loads(row['value'])) if row else 5000
            # Prior installations normally use 5,000 VND/credit. Do not silently round money.
            if old_price % 100:
                raise RuntimeError('Giá credit cũ không chia hết cho 100đ. Cần quy đổi số dư có đối soát trước khi nâng cấp.')
            factor = old_price // 100
            for table, field in [('users', 'credits'), ('credit_ledger', 'delta'), ('orders', 'credits'), ('reviews', 'credit_cost')]:
                c.execute(f'UPDATE {table} SET {field}={field}*?', (factor,))
            c.executemany('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
                          [('credit_price_vnd', '100'), ('minimum_topup_vnd', '10000')])
            c.execute('INSERT INTO app_migrations(name,detail) VALUES(?,?)',
                      ('credit_unit_v2', json.dumps({'old_price_vnd': old_price, 'new_price_vnd': 100,
                                                     'factor': factor, 'policy': 'preserve_monetary_value'})))

    def initialize_accounts(self):
        with self.connect() as c:
            c.executescript(ACCOUNT_SCHEMA)
            for table, columns in {
                'papers': {'owner_id': 'INTEGER REFERENCES users(id)'},
                'reviews': {'billing_user_id': 'INTEGER REFERENCES users(id)',
                            'billing_mode': "TEXT NOT NULL DEFAULT 'legacy'",
                            'request_id': 'TEXT',
                            'credit_cost': 'INTEGER NOT NULL DEFAULT 0',
                            'refunded': 'INTEGER NOT NULL DEFAULT 0'},
            }.items():
                existing = {row['name'] for row in c.execute(f'PRAGMA table_info({table})')}
                for name, definition in columns.items():
                    if name not in existing:
                        c.execute(f'ALTER TABLE {table} ADD COLUMN {name} {definition}')
            c.execute('CREATE INDEX IF NOT EXISTS idx_papers_owner ON papers(owner_id)')
            c.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_review_request ON reviews(billing_user_id,request_id) WHERE request_id IS NOT NULL')

    def google_user(self, sub, email, name, admin=False):
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            row = c.execute('SELECT * FROM users WHERE google_sub=?', (sub,)).fetchone()
            if not row:
                c.execute('INSERT INTO users(google_sub,email,name,role) VALUES(?,?,?,?)',
                          (sub, email, name[:120], 'admin' if admin else 'user'))
            else:
                c.execute('UPDATE users SET email=? WHERE id=?', (email, row['id']))
            return dict(c.execute('SELECT * FROM users WHERE google_sub=?', (sub,)).fetchone())

    def user(self, user_id):
        with self.connect() as c:
            row = c.execute('SELECT * FROM users WHERE id=?', (user_id,)).fetchone()
            return dict(row) if row else None

    def update_user(self, user_id, **fields):
        fields = {k: v for k, v in fields.items() if k in {'name', 'affiliation', 'bio', 'gemini_key'}}
        if fields:
            with self.connect() as c:
                c.execute(f"UPDATE users SET {','.join(k+'=?' for k in fields)} WHERE id=?",
                          (*fields.values(), user_id))

    def new_challenge(self):
        value = secrets.token_urlsafe(32)
        with self.connect() as c:
            c.execute('DELETE FROM login_challenges WHERE expires_at<?', (int(time.time()),))
            c.execute('INSERT INTO login_challenges VALUES(?,?)', (token_hash(value), int(time.time()) + 600))
        return value

    def consume_challenge(self, value):
        with self.connect() as c:
            return c.execute('DELETE FROM login_challenges WHERE token_hash=? AND expires_at>?',
                             (token_hash(value), int(time.time()))).rowcount == 1

    def new_session(self, user_id):
        value, csrf = secrets.token_urlsafe(48), secrets.token_urlsafe(32)
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            if not c.execute('SELECT 1 FROM users WHERE id=? AND disabled=0', (user_id,)).fetchone():
                raise ValueError('Tài khoản đã bị vô hiệu hóa')
            c.execute('DELETE FROM sessions WHERE expires_at<?', (int(time.time()),))
            c.execute('INSERT INTO sessions VALUES(?,?,?,?)',
                      (token_hash(value), user_id, csrf, int(time.time()) + 7 * 86400))
        return value, csrf

    def session(self, value):
        with self.connect() as c:
            row = c.execute('''SELECT u.*, s.csrf FROM sessions s JOIN users u ON u.id=s.user_id
                               WHERE s.token_hash=? AND s.expires_at>? AND u.disabled=0''',
                            (token_hash(value), int(time.time()))).fetchone()
        return dict(row) if row else None

    def logout(self, value):
        with self.connect() as c:
            c.execute('DELETE FROM sessions WHERE token_hash=?', (token_hash(value),))

    def rate_limit(self, bucket, limit, seconds=60):
        now = int(time.time())
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            c.execute('DELETE FROM rate_limits WHERE expires_at<=?', (now,))
            c.execute('''INSERT INTO rate_limits VALUES(?,1,?)
                         ON CONFLICT(bucket) DO UPDATE SET count=count+1''', (bucket, now + seconds))
            return c.execute('SELECT count FROM rate_limits WHERE bucket=?', (bucket,)).fetchone()[0] <= limit

    def settings_values(self):
        with self.connect() as c:
            return {r['key']: json.loads(r['value']) for r in c.execute('SELECT * FROM settings')}

    def save_settings(self, values, actor_id):
        with self.connect() as c:
            c.executemany('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
                          [(k, json.dumps(v)) for k, v in values.items()])
            c.execute('INSERT INTO admin_audit(actor_id,action,detail) VALUES(?,?,?)',
                      (actor_id, 'settings', json.dumps(sorted(values))))

    def reserve_review(self, paper_id, user_id, strictness, model, mode, request_id=None, review_type_id=1):
        """The ownership check, duplicate check, debit and job creation are one transaction."""
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            if not c.execute('SELECT 1 FROM papers WHERE id=? AND owner_id=?', (paper_id, user_id)).fetchone():
                raise LookupError('Không tìm thấy bài báo')
            if request_id:
                replay = c.execute('SELECT * FROM reviews WHERE billing_user_id=? AND request_id=?', (user_id, request_id)).fetchone()
                if replay:
                    if (replay['paper_id'], replay['strictness'], replay['billing_mode'], replay['review_type_id']) != (paper_id, strictness, mode, review_type_id):
                        raise ValueError('Mã yêu cầu review đã được sử dụng với cấu hình khác')
                    return {'id': replay['id'], 'status': replay['status']}, False
            existing = c.execute("SELECT id,status FROM reviews WHERE paper_id=? AND status IN ('queued','running')",
                                 (paper_id,)).fetchone()
            if existing:
                return dict(existing), False
            self.assert_paper_idle_storage(c, paper_id)
            self.assert_capacity(user_id, 0, c)
            template = c.execute('SELECT * FROM review_types WHERE id=? AND active=1', (review_type_id,)).fetchone()
            if not template:
                raise ValueError('Loại review không tồn tại hoặc đã được tắt')
            self.consume_job_budget(c, user_id, 'ai')
            if mode not in {'system', 'personal'}:
                raise ValueError('Chế độ thanh toán không hợp lệ')
            cost = 10 if mode == 'system' else 3
            if cost and not c.execute('UPDATE users SET credits=credits-? WHERE id=? AND credits>=? AND disabled=0',
                                      (cost, user_id, cost)).rowcount:
                raise ValueError('Không đủ credit. Vui lòng nạp thêm credit.')
            cursor = c.execute('''INSERT INTO reviews(paper_id,strictness,model,created_at,billing_user_id,billing_mode,credit_cost,request_id,
                                  review_type_id,review_type_name,review_type_revision,review_instructions,output_format)
                                  VALUES(?,?,?,CURRENT_TIMESTAMP,?,?,?,?,?,?,?,?,?)''',
                               (paper_id, strictness, model, user_id, mode, cost, request_id,
                                template['id'], template['name'], template['revision'], template['instructions'], template['output_format']))
            review_id = cursor.lastrowid
            if cost:
                c.execute('INSERT INTO credit_ledger(user_id,delta,kind,reference) VALUES(?,?,?,?)',
                          (user_id, -cost, 'review', f'review:{review_id}'))
            c.execute("UPDATE papers SET status='reviewing',updated_at=CURRENT_TIMESTAMP WHERE id=?", (paper_id,))
            return {'id': review_id, 'status': 'queued'}, True

    def refund_review(self, review_id):
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            self._refund_review(c, review_id)

    def _refund_review(self, c, review_id):
        row = c.execute("SELECT * FROM reviews WHERE id=? AND status='failed' AND refunded=0 AND credit_cost>0",
                        (review_id,)).fetchone()
        if row:
            c.execute('UPDATE users SET credits=credits+? WHERE id=?', (row['credit_cost'], row['billing_user_id']))
            c.execute('UPDATE reviews SET refunded=1 WHERE id=?', (review_id,))
            c.execute('INSERT INTO credit_ledger(user_id,delta,kind,reference) VALUES(?,?,?,?)',
                      (row['billing_user_id'], row['credit_cost'], 'refund', f'refund:{review_id}'))

    def recover_reviews(self):
        # Run once at startup in the documented single-worker deployment.
        with self.connect() as c:
            rows = c.execute("SELECT id,paper_id FROM reviews WHERE status IN ('queued','running')").fetchall()
        for row in rows:
            self.fail_review(row['id'], row['paper_id'], 'Máy chủ đã khởi động lại. Credit được hoàn; vui lòng review lại.')
        with self.connect() as c:
            rows = c.execute("SELECT id FROM reviews WHERE status='failed' AND refunded=0 AND credit_cost>0").fetchall()
        for row in rows:
            self.refund_review(row['id'])

    def new_order(self, user_id, request_id, amount, credits):
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            row = c.execute('SELECT * FROM orders WHERE user_id=? AND request_id=?', (user_id, request_id)).fetchone()
            if row:
                if row['amount'] != amount:
                    raise ValueError('Mã yêu cầu đã được sử dụng cho số tiền khác')
                return dict(row), False
            order_id = secrets.randbelow(8_000_000_000_000) + 1_000_000_000_000
            c.execute('INSERT INTO orders(id,user_id,request_id,amount,credits) VALUES(?,?,?,?,?)',
                      (order_id, user_id, request_id, amount, credits))
            return dict(c.execute('SELECT * FROM orders WHERE id=?', (order_id,)).fetchone()), True

    def order(self, order_id, user_id=None):
        with self.connect() as c:
            row = c.execute('SELECT * FROM orders WHERE id=?' + (' AND user_id=?' if user_id is not None else ''),
                            (order_id, user_id) if user_id is not None else (order_id,)).fetchone()
        return dict(row) if row else None

    def link_order(self, order_id, link_id, url):
        with self.connect() as c:
            c.execute("UPDATE orders SET payment_link_id=?,checkout_url=?,status=CASE WHEN status='paid' THEN status ELSE 'pending' END WHERE id=?",
                      (link_id, url, order_id))

    def settle_order(self, order_id, amount, link_id):
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            row = c.execute('SELECT * FROM orders WHERE id=?', (order_id,)).fetchone()
            if not row:
                return False  # Includes signed PayOS webhook setup probes; never creates a purchase.
            if amount != row['amount'] or not link_id or (row['payment_link_id'] and row['payment_link_id'] != link_id):
                raise ValueError('Thông tin thanh toán không khớp đơn hàng')
            if row['status'] == 'paid':
                return False
            c.execute("UPDATE orders SET status='paid',payment_link_id=?,paid_at=CURRENT_TIMESTAMP WHERE id=?", (link_id, order_id))
            c.execute('UPDATE users SET credits=credits+? WHERE id=?', (row['credits'], row['user_id']))
            c.execute('INSERT INTO credit_ledger(user_id,delta,kind,reference) VALUES(?,?,?,?)',
                      (row['user_id'], row['credits'], 'topup', f'order:{order_id}'))
            return True

    def wallet(self, user_id):
        with self.connect() as c:
            return {
                'credits': c.execute('SELECT credits FROM users WHERE id=?', (user_id,)).fetchone()[0],
                'orders': [dict(r) for r in c.execute('SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 100', (user_id,))],
                'ledger': [dict(r) for r in c.execute('SELECT * FROM credit_ledger WHERE user_id=? ORDER BY id DESC LIMIT 100', (user_id,))],
            }

    def admin_overview(self):
        with self.connect() as c:
            return {
                'users': [dict(r) for r in c.execute('SELECT id,email,name,role,disabled,credits,created_at FROM users ORDER BY id DESC LIMIT 200')],
                'orders': [dict(r) for r in c.execute('SELECT * FROM orders ORDER BY created_at DESC,id DESC LIMIT 200')],
                'audit': [dict(r) for r in c.execute('SELECT * FROM admin_audit ORDER BY id DESC LIMIT 100')],
                'unassigned_papers': c.execute('SELECT COUNT(*) FROM papers WHERE owner_id IS NULL').fetchone()[0],
            }

    def admin_user(self, actor_id, user_id, role, disabled):
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            actor = c.execute("SELECT 1 FROM users WHERE id=? AND role='admin' AND disabled=0", (actor_id,)).fetchone()
            if not actor:
                raise ValueError('Tài khoản quản trị không còn quyền thực hiện thao tác')
            row = c.execute('SELECT * FROM users WHERE id=?', (user_id,)).fetchone()
            if not row:
                raise LookupError('Không tìm thấy tài khoản')
            if user_id == actor_id and (disabled or role != 'admin'):
                raise ValueError('Không thể tự khóa hoặc tự hạ quyền tài khoản quản trị')
            if row['role'] == role and bool(row['disabled']) == disabled:
                return
            c.execute('UPDATE users SET role=?,disabled=? WHERE id=?', (role, int(disabled), user_id))
            if disabled:
                c.execute('DELETE FROM sessions WHERE user_id=?', (user_id,))
            c.execute('INSERT INTO admin_audit(actor_id,action,detail) VALUES(?,?,?)',
                      (actor_id, 'user', json.dumps({'id': user_id, 'role': role, 'disabled': disabled})))
            c.execute('INSERT INTO user_activity(user_id,actor_id,action,detail) VALUES(?,?,?,?)',
                      (user_id, actor_id, 'access_changed', json.dumps({'role': role, 'disabled': disabled,
                       'previous_role': row['role'], 'previous_disabled': bool(row['disabled'])})))

    def claim_legacy(self, actor_id):
        with self.connect() as c:
            count = c.execute('UPDATE papers SET owner_id=? WHERE owner_id IS NULL', (actor_id,)).rowcount
            c.execute('INSERT INTO admin_audit(actor_id,action,detail) VALUES(?,?,?)', (actor_id, 'claim_legacy', str(count)))
            return count
