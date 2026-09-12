"""Versioned formatting profiles and private, immutable check snapshots."""
import hashlib
import json
from pathlib import Path

from app.format_checker import PRESETS, FormatRules


SCHEMA = '''
CREATE TABLE IF NOT EXISTS format_templates (
 id INTEGER PRIMARY KEY, filename TEXT NOT NULL, sha256 TEXT NOT NULL, content BLOB NOT NULL
);
CREATE TABLE IF NOT EXISTS format_profiles (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
 source_url TEXT NOT NULL DEFAULT '', rules_json TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
 revision INTEGER NOT NULL DEFAULT 1, template_id INTEGER REFERENCES format_templates(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS format_checks (
 id INTEGER PRIMARY KEY, paper_id INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
 owner_id INTEGER NOT NULL REFERENCES users(id), request_id TEXT NOT NULL,
 profile_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', result_json TEXT,
 error TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, completed_at TEXT,
 UNIQUE(owner_id, request_id)
);
CREATE INDEX IF NOT EXISTS idx_format_checks_paper ON format_checks(paper_id, id);
'''


def profile_dict(row):
    if not row:
        return None
    result = dict(row)
    result['rules'] = json.loads(result.pop('rules_json'))
    result['active'] = bool(result['active'])
    return result


class FormatMixin:
    def initialize_formats(self):
        with self.connect() as c:
            c.executescript(SCHEMA)
            # A migration marker prevents deleted/disabled presets being reintroduced.
            if not c.execute("SELECT 1 FROM app_migrations WHERE name='format_profiles_v1'").fetchone():
                for p in PRESETS:
                    c.execute('INSERT INTO format_profiles(name,description,source_url,rules_json) VALUES(?,?,?,?)',
                              (p['name'], p['description'], p['source_url'], json.dumps(FormatRules.model_validate(p['rules']).model_dump(), ensure_ascii=False)))
                c.execute("INSERT INTO app_migrations(name,detail) VALUES('format_profiles_v1','Initial formatting presets')")

    def format_profiles(self, admin=False):
        with self.connect() as c:
            return [profile_dict(r) for r in c.execute('''SELECT p.*, t.filename AS template_filename, t.sha256 AS template_sha256
                FROM format_profiles p LEFT JOIN format_templates t ON t.id=p.template_id ''' +
                ('' if admin else 'WHERE p.active=1 ') + 'ORDER BY p.id')]

    def save_format_profile(self, actor, body, profile_id=None, template=None):
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            values = (body['name'], body['description'], body['source_url'],
                      json.dumps(body['rules'], ensure_ascii=False), int(body['active']))
            if profile_id is None:
                template_id = None
                if template:
                    filename, content = template
                    template_id = c.execute('INSERT INTO format_templates(filename,sha256,content) VALUES(?,?,?)',
                        (Path(filename.replace('\\', '/')).name, hashlib.sha256(content).hexdigest(), content)).lastrowid
                profile_id = c.execute('INSERT INTO format_profiles(name,description,source_url,rules_json,active,template_id) VALUES(?,?,?,?,?,?)',
                                       (*values, template_id)).lastrowid
            else:
                # Compare-and-swap: two open admin forms cannot silently overwrite one another.
                updated = c.execute('''UPDATE format_profiles SET name=?,description=?,source_url=?,rules_json=?,active=?,
                    revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=?''',
                    (*values, profile_id, body['revision']))
                if not updated.rowcount:
                    raise ValueError('Chuẩn đã thay đổi hoặc không tồn tại. Tải lại trước khi lưu.')
            c.execute('INSERT INTO admin_audit(actor_id,action,detail) VALUES(?,?,?)',
                      (actor, 'format_profile', json.dumps({'id': profile_id, 'name': body['name'], 'active': body['active']}, ensure_ascii=False)))
        return next(p for p in self.format_profiles(admin=True) if p['id'] == profile_id)

    def reserve_format_check(self, paper_id, owner_id, profile_id, request_id):
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            if not c.execute('SELECT 1 FROM papers WHERE id=? AND owner_id=?', (paper_id, owner_id)).fetchone():
                raise LookupError('Không tìm thấy bài báo')
            existing = c.execute('SELECT * FROM format_checks WHERE owner_id=? AND request_id=?', (owner_id, request_id)).fetchone()
            if existing:
                if existing['paper_id'] != paper_id or json.loads(existing['profile_json'])['id'] != profile_id:
                    raise ValueError('Mã yêu cầu đã được sử dụng cho lựa chọn khác')
                return existing['id'], False
            self.assert_paper_idle_storage(c, paper_id)
            self.assert_capacity(owner_id, 0, c)
            self.consume_job_budget(c, owner_id, 'format')
            row = c.execute('''SELECT p.*, t.filename AS template_filename, t.sha256 AS template_sha256
                FROM format_profiles p LEFT JOIN format_templates t ON t.id=p.template_id WHERE p.id=? AND p.active=1''', (profile_id,)).fetchone()
            if not row:
                raise LookupError('Chuẩn không tồn tại hoặc đã tắt')
            if c.execute("SELECT COUNT(*) FROM format_checks WHERE owner_id=? AND status IN ('queued','running')", (owner_id,)).fetchone()[0] >= 2:
                raise ValueError('Tối đa 2 kiểm tra định dạng đang xử lý mỗi tài khoản')
            check_id = c.execute('INSERT INTO format_checks(paper_id,owner_id,request_id,profile_json) VALUES(?,?,?,?)',
                                (paper_id, owner_id, request_id, json.dumps(profile_dict(row), ensure_ascii=False))).lastrowid
            return check_id, True

    def format_check(self, check_id, owner_id=None):
        with self.connect() as c:
            row = c.execute('SELECT * FROM format_checks WHERE id=?' + (' AND owner_id=?' if owner_id is not None else ''),
                            (check_id, owner_id) if owner_id is not None else (check_id,)).fetchone()
        if not row:
            return None
        result = dict(row)
        result['profile'] = json.loads(result.pop('profile_json'))
        result['result'] = json.loads(result.pop('result_json') or 'null')
        result.pop('owner_id')
        result.pop('request_id')
        return result

    def list_format_checks(self, paper_id, owner_id):
        with self.connect() as c:
            rows = c.execute('SELECT id FROM format_checks WHERE paper_id=? AND owner_id=? ORDER BY id DESC LIMIT 100', (paper_id, owner_id)).fetchall()
        checks = [self.format_check(r['id'], owner_id) for r in rows]
        return [{k: v for k, v in r.items() if k != 'result'} for r in checks]

    def update_format_check(self, check_id, status, result=None, error=''):
        with self.connect() as c:
            c.execute('''UPDATE format_checks SET status=?,result_json=?,error=?,
                completed_at=CASE WHEN ? IN ('completed','failed') THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id=?''',
                (status, json.dumps(result, ensure_ascii=False) if result else None, error, status, check_id))

    def recover_format_checks(self):
        with self.connect() as c:
            c.execute("""UPDATE format_checks SET status='failed',error='Kiểm tra bị gián đoạn do máy chủ khởi động lại. Hãy chạy lại.',
                completed_at=CURRENT_TIMESTAMP WHERE status IN ('queued','running')""")
