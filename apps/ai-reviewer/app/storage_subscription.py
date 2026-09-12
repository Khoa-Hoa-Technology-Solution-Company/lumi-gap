"""One renewable storage balance per account; purchases are its immutable ledger."""
import time
import uuid

from fastapi import HTTPException

MB = 1024 * 1024
PERIOD = 30 * 86400
GRACE = 7 * 86400

SCHEMA = '''
CREATE TABLE IF NOT EXISTS storage_subscriptions (
 user_id INTEGER PRIMARY KEY REFERENCES users(id), units INTEGER NOT NULL CHECK(units>0),
 expires_at INTEGER NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
 warning_sent_at INTEGER, cleanup_busy INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS storage_quotes (
 id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), action TEXT NOT NULL,
 units INTEGER NOT NULL, total_units INTEGER NOT NULL, unit_price INTEGER NOT NULL,
 cost INTEGER NOT NULL, revision INTEGER NOT NULL, previous_expiry INTEGER NOT NULL,
 valid_until INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS storage_email_outbox (
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id),
 cycle INTEGER NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
 attempts INTEGER NOT NULL DEFAULT 0, next_attempt INTEGER NOT NULL DEFAULT 0,
 sent_at INTEGER, error TEXT NOT NULL DEFAULT '', UNIQUE(user_id,cycle,kind)
);
CREATE INDEX IF NOT EXISTS idx_storage_mail_due ON storage_email_outbox(status,next_attempt);
CREATE TABLE IF NOT EXISTS storage_cleanup_log (
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id),
 cycle INTEGER NOT NULL, paper_id INTEGER NOT NULL UNIQUE, bytes INTEGER NOT NULL,
 deleted_at INTEGER NOT NULL
);
'''


class SubscriptionMixin:
    def initialize_subscriptions(self):
        with self.connect() as c:
            c.executescript(SCHEMA)
            columns = {r['name'] for r in c.execute('PRAGMA table_info(storage_purchases)')}
            for name, definition in {'action': "TEXT NOT NULL DEFAULT 'legacy'", 'total_units': 'INTEGER NOT NULL DEFAULT 0',
                                     'quote_id': "TEXT NOT NULL DEFAULT ''"}.items():
                if name not in columns:
                    c.execute(f'ALTER TABLE storage_purchases ADD COLUMN {name} {definition}')
            columns = {r['name'] for r in c.execute('PRAGMA table_info(papers)')}
            if 'deletion_cycle' not in columns:
                c.execute('ALTER TABLE papers ADD COLUMN deletion_cycle INTEGER')
            if not c.in_transaction:
                c.execute('BEGIN IMMEDIATE')
            if not c.execute("SELECT 1 FROM app_migrations WHERE name='storage_shared_plan_v1'").fetchone():
                now = int(time.time())
                for user in c.execute('SELECT DISTINCT user_id FROM storage_purchases').fetchall():
                    rows = c.execute('SELECT * FROM storage_purchases WHERE user_id=? ORDER BY expires_at DESC', (user['user_id'],)).fetchall()
                    selected = [r for r in rows if r['expires_at'] > now] or [r for r in rows if r['expires_at'] == rows[0]['expires_at']]
                    # Grant the latest paid-through date to the merged active capacity. Never shorten paid time.
                    c.execute('INSERT OR IGNORE INTO storage_subscriptions(user_id,units,expires_at) VALUES(?,?,?)',
                              (user['user_id'], sum(r['units'] for r in selected), max(r['expires_at'] for r in selected)))
                c.execute("INSERT INTO app_migrations(name,detail) VALUES('storage_shared_plan_v1','Merge active capacity, preserve latest expiry; legacy ledger unchanged')")

    def subscription(self, user_id, connection=None):
        if connection is None:
            with self.connect() as c:
                return self.subscription(user_id, c)
        row = connection.execute('SELECT * FROM storage_subscriptions WHERE user_id=?', (user_id,)).fetchone()
        price = self.storage_policy(connection)['storage_price_credits']
        now = int(time.time())
        if not row:
            return {'units': 0, 'expires_at': None, 'revision': 0, 'active': False, 'expired': False,
                    'renewal_cost': 0, 'cleanup_busy': False, 'warning_sent_at': None, 'delete_after': None}
        result = dict(row)
        result.update(active=row['expires_at'] > now, expired=row['expires_at'] <= now,
                      renewal_cost=row['units'] * price,
                      delete_after=max(row['expires_at'] + GRACE, (row['warning_sent_at'] or now) + GRACE))
        return result

    def storage_quote(self, user_id, action, units=0):
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            sub, policy, now = self.subscription(user_id, c), self.storage_policy(c), int(time.time())
            if action not in {'add', 'renew'} or (action == 'add' and not 1 <= units <= 100) or (action == 'renew' and units != 0):
                raise HTTPException(422, 'Lựa chọn mua/gia hạn không hợp lệ')
            if action == 'renew' and not sub['units']:
                raise HTTPException(409, 'Chưa có dung lượng mua thêm để gia hạn')
            total = sub['units'] + units
            if total > 10000:
                raise HTTPException(422, 'Tổng dung lượng mua thêm tối đa 1.000.000 MB')
            # User policy: additions pay the full unit fee and share the existing renewal date.
            charged_units = units if action == 'add' and sub['active'] else total
            quote_id = str(uuid.uuid4())
            valid_until = min(now + 600, sub['expires_at']) if sub['active'] else now + 600
            c.execute('INSERT INTO storage_quotes VALUES(?,?,?,?,?,?,?,?,?,?)',
                      (quote_id, user_id, action, units, total, policy['storage_price_credits'], charged_units * policy['storage_price_credits'],
                       sub['revision'], sub['expires_at'] or 0, valid_until))
            c.execute('DELETE FROM storage_quotes WHERE valid_until<?', (now - 86400,))
            quote = dict(c.execute('SELECT * FROM storage_quotes WHERE id=?', (quote_id,)).fetchone())
            quote['expires_at'] = sub['expires_at'] if action == 'add' and sub['active'] else max(now, sub['expires_at'] or 0) + PERIOD
            quote['renewal_cost'] = total * policy['storage_price_credits']
            quote['renews_expired_balance'] = action == 'add' and sub['expired']
            return quote

    def buy_storage(self, user_id, quote_id, request_id):
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            old = c.execute('SELECT * FROM storage_purchases WHERE user_id=? AND request_id=?', (user_id, request_id)).fetchone()
            if old:
                if old['quote_id'] != quote_id:
                    raise HTTPException(409, 'Mã yêu cầu đã dùng cho lựa chọn khác')
                return dict(old)
            quote = c.execute('SELECT * FROM storage_quotes WHERE id=? AND user_id=?', (quote_id, user_id)).fetchone()
            sub, policy = self.subscription(user_id, c), self.storage_policy(c)
            # Read the deadline clock after the snapshot so crossing expiry cannot
            # reuse an active-addition quote to reactivate the old balance cheaply.
            now = int(time.time())
            if (not quote or quote['valid_until'] <= now or quote['revision'] != sub['revision']
                    or quote['previous_expiry'] != (sub['expires_at'] or 0)):
                raise HTTPException(409, 'Báo giá hết hạn hoặc gói đã thay đổi. Lấy báo giá mới trước khi xác nhận.')
            if not policy['storage_sales_enabled'] or quote['unit_price'] != policy['storage_price_credits']:
                raise HTTPException(409, 'Giá hoặc trạng thái bán đã thay đổi. Hãy lấy báo giá mới.')
            if sub['cleanup_busy'] or c.execute('SELECT 1 FROM papers WHERE owner_id=? AND deletion_pending=1 AND deletion_cycle IS NOT NULL', (user_id,)).fetchone():
                raise HTTPException(409, 'Đang hoàn tất xóa dữ liệu hết hạn. Thử lại sau hoặc hoàn tất các bài đang chờ xóa trước khi thanh toán.')
            if not c.execute('UPDATE users SET credits=credits-? WHERE id=? AND credits>=? AND disabled=0',
                             (quote['cost'], user_id, quote['cost'])).rowcount:
                raise HTTPException(409, 'Không đủ credit. Vui lòng nạp thêm trong ví.')
            expiry = sub['expires_at'] if quote['action'] == 'add' and sub['active'] else max(now, sub['expires_at'] or 0) + PERIOD
            # Bound prepayment: at most two 30-day periods ahead.
            if expiry > now + 2 * PERIOD:
                raise HTTPException(409, 'Gói đã được gia hạn trước. Hãy chờ đến kỳ tiếp theo.')
            warning = sub['warning_sent_at'] if expiry == sub['expires_at'] else None
            c.execute('''INSERT INTO storage_subscriptions(user_id,units,expires_at,revision,warning_sent_at)
                         VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET units=excluded.units,expires_at=excluded.expires_at,
                         revision=excluded.revision,warning_sent_at=excluded.warning_sent_at''',
                      (user_id, quote['total_units'], expiry, sub['revision'] + 1, warning))
            purchase_id = c.execute('''INSERT INTO storage_purchases(user_id,request_id,units,unit_bytes,unit_price,cost,starts_at,expires_at,action,total_units,quote_id)
                                      VALUES(?,?,?,?,?,?,?,?,?,?,?)''',
                (user_id, request_id, quote['units'] if quote['action'] == 'add' else quote['total_units'], 100 * MB,
                 quote['unit_price'], quote['cost'], now, expiry, quote['action'], quote['total_units'], quote_id)).lastrowid
            c.execute('INSERT INTO credit_ledger(user_id,delta,kind,reference) VALUES(?,?,?,?)',
                      (user_id, -quote['cost'], 'storage', f'storage:{purchase_id}'))
            return dict(c.execute('SELECT * FROM storage_purchases WHERE id=?', (purchase_id,)).fetchone())

    def assert_storage_access(self, user_id, connection=None):
        if user_id is None:
            return
        if connection is None:
            with self.connect() as c:
                return self.assert_storage_access(user_id, c)
        sub, usage = self.subscription(user_id, connection), self.storage_usage(user_id, connection)
        if sub['expired'] and usage['used_bytes'] > usage['base_bytes']:
            raise HTTPException(423, {'code': 'storage_expired', 'message': 'Gói dung lượng đã hết hạn và tài khoản vượt mức miễn phí. Gia hạn hoặc xóa bớt bài để mở lại thư viện.',
                                      'renewal_cost': sub['renewal_cost'], 'delete_after': sub['delete_after']})

    def expiry_candidates(self, user_id, c):
        usage = self.storage_usage(user_id, c)
        remaining, selected = usage['used_bytes'], []
        for row in c.execute('''SELECT p.id,p.file_size+COALESCE((SELECT SUM(size) FROM stored_files f
                               WHERE f.paper_id=p.id AND kind='artifact'),0) AS bytes FROM papers p
                               WHERE owner_id=? ORDER BY uploaded_at ASC,id ASC''', (user_id,)):
            if remaining <= usage['base_bytes']:
                break
            if row['bytes'] <= 0:
                continue
            selected.append(dict(row))
            remaining -= row['bytes']
        return selected
