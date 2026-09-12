"""Versioned review instructions authored by administrators."""
import json

from app.config import PROJECT_AGENT_PATH, REVIEW_SPEC_PATH


REVIEW_TYPES_SCHEMA = """
CREATE TABLE IF NOT EXISTS review_types (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '', instructions TEXT NOT NULL,
 output_format TEXT NOT NULL CHECK(output_format IN ('conference','markdown')),
 active INTEGER NOT NULL DEFAULT 1, revision INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"""


class ReviewTypesMixin:
    def initialize_review_types(self):
        with self.connect() as c:
            c.executescript(REVIEW_TYPES_SCHEMA)
            if not c.execute('SELECT 1 FROM review_types WHERE id=1').fetchone():
                instructions = ('PROJECT AGENT:\n' + PROJECT_AGENT_PATH.read_text(encoding='utf-8')
                                + '\n\nCANONICAL SPECIFICATION:\n' + REVIEW_SPEC_PATH.read_text(encoding='utf-8'))
                c.execute("INSERT INTO review_types(id,name,description,instructions,output_format) VALUES(1,?,?,?,'conference')",
                          ('Review hội nghị', 'Đánh giá khoa học song ngữ theo phiếu hội nghị hiện tại.', instructions))
            columns = {r['name'] for r in c.execute('PRAGMA table_info(reviews)')}
            for name, definition in {
                'review_type_id': 'INTEGER NOT NULL DEFAULT 1',
                'review_type_name': "TEXT NOT NULL DEFAULT 'Review hội nghị'",
                'review_type_revision': 'INTEGER NOT NULL DEFAULT 1',
                'review_instructions': "TEXT NOT NULL DEFAULT ''",
                'output_format': "TEXT NOT NULL DEFAULT 'conference'",
            }.items():
                if name not in columns:
                    c.execute(f'ALTER TABLE reviews ADD COLUMN {name} {definition}')

    def list_review_types(self, admin=False):
        with self.connect() as c:
            fields = '*' if admin else 'id,name,description,output_format,revision'
            return [dict(r) for r in c.execute(f'SELECT {fields} FROM review_types ' +
                                               ('' if admin else 'WHERE active=1 ') + 'ORDER BY id')]

    def review_type(self, type_id):
        with self.connect() as c:
            row = c.execute('SELECT * FROM review_types WHERE id=?', (type_id,)).fetchone()
        return dict(row) if row else None

    def save_review_type(self, actor_id, name, description, instructions, active=True, type_id=None):
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            if type_id is None:
                type_id = c.execute("INSERT INTO review_types(name,description,instructions,active,output_format) VALUES(?,?,?,?,'markdown')",
                                    (name, description, instructions, int(active))).lastrowid
            else:
                if not c.execute('SELECT 1 FROM review_types WHERE id=?', (type_id,)).fetchone():
                    raise LookupError('Không tìm thấy loại review')
                c.execute('''UPDATE review_types SET name=?,description=?,instructions=?,active=?,revision=revision+1,
                             updated_at=CURRENT_TIMESTAMP WHERE id=?''', (name, description, instructions, int(active), type_id))
            c.execute('INSERT INTO admin_audit(actor_id,action,detail) VALUES(?,?,?)',
                      (actor_id, 'review_type', json.dumps({'id': type_id, 'name': name, 'active': active}, ensure_ascii=False)))
            return dict(c.execute('SELECT * FROM review_types WHERE id=?', (type_id,)).fetchone())
