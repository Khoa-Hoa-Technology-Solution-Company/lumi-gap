"""Account storage reservations, shared subscriptions, and durable job budgets."""
import json
import time
import uuid

from fastapi import HTTPException
from app.storage_subscription import SubscriptionMixin

MB = 1024 * 1024
DEFAULTS = {
    'storage_base_mb': 50, 'upload_max_mb': 50,
    'storage_price_credits': 10, 'storage_sales_enabled': True,
    'storage_backend': 'local', 'drive_folder_id': '',
    'requests_per_minute': 180, 'uploads_per_minute': 10,
    'ai_per_minute': 6, 'ai_per_day': 50, 'ai_concurrent': 2,
    'ai_global_concurrent': 8, 'format_per_day': 100, 'format_global_concurrent': 4,
}

SCHEMA = '''
CREATE TABLE IF NOT EXISTS storage_purchases (
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id),
 request_id TEXT NOT NULL, units INTEGER NOT NULL CHECK(units>0),
 unit_bytes INTEGER NOT NULL, unit_price INTEGER NOT NULL, cost INTEGER NOT NULL,
 starts_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, UNIQUE(user_id,request_id)
);
CREATE INDEX IF NOT EXISTS idx_storage_expiry ON storage_purchases(user_id,expires_at);
CREATE TABLE IF NOT EXISTS upload_reservations (
 token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), bytes INTEGER NOT NULL,
 local_path TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS stored_files (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 paper_id INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
 review_id INTEGER REFERENCES reviews(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('pdf','artifact')),
 local_path TEXT NOT NULL UNIQUE, size INTEGER NOT NULL,
 backend TEXT NOT NULL DEFAULT 'local' CHECK(backend IN ('local','drive')),
 drive_id TEXT NOT NULL DEFAULT '', drive_folder_id TEXT NOT NULL DEFAULT '',
 sha256 TEXT NOT NULL DEFAULT '', deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_stored_paper ON stored_files(paper_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_stored_drive_id ON stored_files(drive_id) WHERE drive_id!='';
CREATE TABLE IF NOT EXISTS usage_budgets (
 user_id INTEGER NOT NULL REFERENCES users(id), action TEXT NOT NULL,
 window INTEGER NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(user_id,action,window)
);
'''


class StorageMixin(SubscriptionMixin):
    def initialize_storage(self):
        with self.connect() as c:
            c.executescript(SCHEMA)
            columns = {r['name'] for r in c.execute('PRAGMA table_info(papers)')}
            for name in ('deletion_pending', 'storage_busy'):
                if name not in columns:
                    c.execute(f'ALTER TABLE papers ADD COLUMN {name} INTEGER NOT NULL DEFAULT 0')
            if 'storage_error' not in columns:
                c.execute("ALTER TABLE papers ADD COLUMN storage_error TEXT NOT NULL DEFAULT ''")
            if 'local_path' not in {r['name'] for r in c.execute('PRAGMA table_info(upload_reservations)')}:
                c.execute("ALTER TABLE upload_reservations ADD COLUMN local_path TEXT NOT NULL DEFAULT ''")
        self.initialize_subscriptions()

    def storage_policy(self, connection=None):
        if connection is None:
            with self.connect() as c:
                return self.storage_policy(c)
        return {**DEFAULTS, **{r['key']: json.loads(r['value']) for r in connection.execute('SELECT * FROM settings')
                              if r['key'] in DEFAULTS}}

    def storage_usage(self, user_id, connection=None):
        if connection is None:
            with self.connect() as c:
                return self.storage_usage(user_id, c)
        c = connection
        policy = self.storage_policy(c)
        base = policy['storage_base_mb'] * MB
        sub = self.subscription(user_id, c)
        extra = sub['units'] * 100 * MB if sub['active'] else 0
        pdf = c.execute('SELECT COALESCE(SUM(file_size),0) FROM papers WHERE owner_id=?', (user_id,)).fetchone()[0]
        artifacts = c.execute('''SELECT COALESCE(SUM(f.size),0) FROM stored_files f JOIN papers p ON p.id=f.paper_id
                                 WHERE p.owner_id=? AND f.kind='artifact' ''', (user_id,)).fetchone()[0]
        reserved = c.execute('SELECT COALESCE(SUM(bytes),0) FROM upload_reservations WHERE user_id=?', (user_id,)).fetchone()[0]
        used = pdf + artifacts
        return {'used_bytes': used, 'pdf_bytes': pdf, 'artifact_bytes': artifacts, 'reserved_bytes': reserved,
                'base_bytes': base, 'extra_bytes': extra, 'quota_bytes': base + extra,
                'available_bytes': max(0, base + extra - used - reserved), 'over_quota': used > base + extra,
                'upload_max_bytes': policy['upload_max_mb'] * MB}

    def assert_capacity(self, user_id, size, c):
        usage = self.storage_usage(user_id, c)
        if usage['used_bytes'] + usage['reserved_bytes'] + size > usage['quota_bytes']:
            raise HTTPException(413, {'code': 'storage_quota_exceeded',
                'message': 'Không đủ dung lượng. Bạn muốn xóa bài cũ hoặc mua thêm dung lượng?', **usage})

    def reserve_upload(self, user_id, size, local_path=''):
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            if size <= 0 or size > self.storage_policy(c)['upload_max_mb'] * MB:
                raise HTTPException(413, 'File trống hoặc vượt giới hạn upload mỗi file')
            self.assert_capacity(user_id, size, c)
            # Bound parsing / staging work even when many small PDFs fit the quota.
            if c.execute('SELECT COUNT(*) FROM upload_reservations WHERE user_id=?', (user_id,)).fetchone()[0] >= 2:
                raise HTTPException(429, 'Tối đa 2 upload đồng thời', headers={'Retry-After': '10'})
            if c.execute('SELECT COUNT(*) FROM upload_reservations').fetchone()[0] >= 8:
                raise HTTPException(429, 'Máy chủ đang xử lý nhiều upload. Hãy thử lại sau.', headers={'Retry-After': '10'})
            token = uuid.uuid4().hex
            c.execute('INSERT INTO upload_reservations(token,user_id,bytes,local_path) VALUES(?,?,?,?)',
                      (token, user_id, size, str(local_path)))
            return token

    def release_upload(self, token):
        with self.connect() as c:
            c.execute('DELETE FROM upload_reservations WHERE token=?', (token,))

    def commit_upload(self, profile, token):
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            reservation = c.execute('SELECT * FROM upload_reservations WHERE token=?', (token,)).fetchone()
            if not reservation or reservation['user_id'] != profile['owner_id'] or reservation['bytes'] != profile['file_size']:
                raise HTTPException(409, 'Upload không khớp dung lượng đã giữ chỗ')
            c.execute('DELETE FROM upload_reservations WHERE token=?', (token,))
            # Recheck expiry and administrator changes that happened during PDF parsing.
            self.assert_capacity(profile['owner_id'], profile['file_size'], c)
            paper_id = c.execute('''INSERT INTO papers(title,authors,abstract,keywords,paper_type,filename,file_path,file_size,
                 page_count,owner_id,uploaded_at,updated_at,storage_busy)
                 VALUES(?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,1)''',
                (profile['title'], profile.get('authors', ''), profile.get('abstract', ''), json.dumps(profile.get('keywords', [])),
                 profile.get('paper_type', 'Other'), profile['filename'], profile['file_path'], profile['file_size'],
                 profile.get('page_count', 0), profile['owner_id'])).lastrowid
            c.execute("INSERT INTO stored_files(paper_id,kind,local_path,size) VALUES(?,'pdf',?,?)",
                      (paper_id, profile['file_path'], profile['file_size']))
            return paper_id

    def storage_dashboard(self, user_id):
        with self.connect() as c:
            c.execute('BEGIN')
            usage = self.storage_usage(user_id, c)
            subscription = self.subscription(user_id, c)
            locked = subscription['expired'] and usage['used_bytes'] > usage['base_bytes']
            candidates = self.expiry_candidates(user_id, c) if locked else []
            purchases = [dict(r) for r in c.execute('SELECT * FROM storage_purchases WHERE user_id=? ORDER BY id DESC', (user_id,))]
            papers = [dict(r) for r in c.execute('''SELECT p.id,p.title,p.filename,p.uploaded_at,p.file_size,p.deletion_pending,p.storage_busy,p.storage_error,
                p.file_size+COALESCE((SELECT SUM(size) FROM stored_files f WHERE f.paper_id=p.id AND kind='artifact'),0) AS used_bytes,
                EXISTS(SELECT 1 FROM reviews r WHERE r.paper_id=p.id AND r.status IN ('queued','running')) OR
                EXISTS(SELECT 1 FROM format_checks f WHERE f.paper_id=p.id AND f.status IN ('queued','running')) AS job_busy,
                (SELECT COUNT(*) FROM stored_files f WHERE f.paper_id=p.id AND backend='drive') AS drive_files,
                (SELECT COUNT(*) FROM stored_files f WHERE f.paper_id=p.id AND backend='local') AS local_files,
                EXISTS(SELECT 1 FROM stored_files f WHERE f.paper_id=p.id AND backend='local' AND drive_id!='') AS drive_pending
                FROM papers p WHERE owner_id=? ORDER BY used_bytes DESC,p.id DESC''', (user_id,))]
            policy = self.storage_policy(c)
        return {**usage, 'papers': papers, 'purchases': purchases, 'server_time': int(time.time()),
                'subscription': subscription, 'library_locked': locked, 'expiry_candidates': candidates,
                'drive_enabled': policy['storage_backend'] == 'drive',
                'plan': {'unit_mb': 100, 'days': 30, 'price_credits': policy['storage_price_credits'], 'enabled': policy['storage_sales_enabled']},
                'limits': {k: policy[k] for k in ('requests_per_minute', 'uploads_per_minute', 'ai_per_minute', 'ai_per_day', 'ai_concurrent')}}

    def assert_paper_idle_storage(self, c, paper_id):
        row = c.execute('SELECT deletion_pending,storage_busy FROM papers WHERE id=?', (paper_id,)).fetchone()
        if row and (row['deletion_pending'] or row['storage_busy']):
            raise HTTPException(409, 'Bài báo đang xóa hoặc chuyển file. Hãy hoàn tất thao tác trước.')

    def consume_job_budget(self, c, user_id, action):
        """Called inside job/debit transaction; persists even if the paper is deleted."""
        now, policy = int(time.time()), self.storage_policy(c)
        windows = [(86400, policy['ai_per_day'] if action == 'ai' else policy['format_per_day'])]
        if action == 'ai':
            windows.append((60, policy['ai_per_minute']))
            active = c.execute("SELECT COUNT(*) FROM reviews WHERE billing_user_id=? AND status IN ('queued','running')", (user_id,)).fetchone()[0]
            total = c.execute("SELECT COUNT(*) FROM reviews WHERE status IN ('queued','running')").fetchone()[0]
            if active >= policy['ai_concurrent'] or total >= policy['ai_global_concurrent']:
                raise HTTPException(429, 'Đã đạt số review AI đồng thời. Hãy chờ tác vụ hiện tại.', headers={'Retry-After': '15'})
        elif c.execute("SELECT COUNT(*) FROM format_checks WHERE status IN ('queued','running')").fetchone()[0] >= policy['format_global_concurrent']:
            raise HTTPException(429, 'Máy chủ đang bận kiểm tra định dạng. Thử lại sau.', headers={'Retry-After': '15'})
        for seconds, maximum in windows:
            window, key = now // seconds * seconds, f'{action}:{seconds}'
            row = c.execute('SELECT count FROM usage_budgets WHERE user_id=? AND action=? AND window=?', (user_id, key, window)).fetchone()
            if row and row[0] >= maximum:
                raise HTTPException(429, 'Đã đạt hạn mức tác vụ theo phút/ngày của tài khoản.', headers={'Retry-After': str(window + seconds - now)})
            c.execute('INSERT INTO usage_budgets VALUES(?,?,?,1) ON CONFLICT(user_id,action,window) DO UPDATE SET count=count+1', (user_id, key, window))
        c.execute('DELETE FROM usage_budgets WHERE window<?', (now - 2 * 86400,))
