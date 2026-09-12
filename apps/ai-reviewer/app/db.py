from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from app.config import DB_PATH
from app.accounts_db import AccountsMixin
from app.review_types import ReviewTypesMixin
from app.format_db import FormatMixin
from app.storage_db import StorageMixin
from app.admin_db import AdminMixin


SCHEMA = """
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS papers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    authors TEXT NOT NULL DEFAULT '',
    abstract TEXT NOT NULL DEFAULT '',
    keywords TEXT NOT NULL DEFAULT '[]',
    paper_type TEXT NOT NULL DEFAULT 'Other',
    filename TEXT NOT NULL,
    file_path TEXT NOT NULL UNIQUE,
    file_size INTEGER NOT NULL DEFAULT 0,
    page_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reviewing','reviewed','failed')),
    uploaded_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paper_id INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','failed')),
    strictness TEXT NOT NULL DEFAULT 'balanced',
    model TEXT NOT NULL DEFAULT '',
    recommendation TEXT,
    journal_publication TEXT,
    scores_json TEXT NOT NULL DEFAULT '{}',
    report_markdown TEXT NOT NULL DEFAULT '',
    output_dir TEXT NOT NULL DEFAULT '',
    error TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_reviews_paper_id ON reviews(paper_id);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status);
"""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Database(AccountsMixin, ReviewTypesMixin, FormatMixin, StorageMixin, AdminMixin):
    def __init__(self, path: Path | str = DB_PATH) -> None:
        self.path = Path(path)

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self.path, timeout=30)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        try:
            yield connection
            connection.commit()
        finally:
            connection.close()

    def initialize(self) -> None:
        with self.connect() as connection:
            connection.executescript(SCHEMA)
        self.initialize_accounts()
        self.initialize_review_types()
        self.migrate_credit_pricing()
        self.initialize_formats()
        self.initialize_storage()
        self.initialize_admin()

    @staticmethod
    def _paper_dict(row: sqlite3.Row) -> dict[str, Any]:
        item = dict(row)
        item["keywords"] = json.loads(item.get("keywords") or "[]")
        return item

    @staticmethod
    def _review_dict(row: sqlite3.Row) -> dict[str, Any]:
        item = dict(row)
        item["scores"] = json.loads(item.pop("scores_json") or "{}")
        return item

    def upsert_paper(self, profile: dict[str, Any]) -> int:
        now = utc_now()
        file_path = str(Path(profile["file_path"]).resolve())
        with self.connect() as connection:
            existing = connection.execute(
                "SELECT id FROM papers WHERE file_path = ?", (file_path,)
            ).fetchone()
            values = (
                profile["title"],
                profile.get("authors", ""),
                profile.get("abstract", ""),
                json.dumps(profile.get("keywords", []), ensure_ascii=False),
                profile.get("paper_type", "Other"),
                profile["filename"],
                file_path,
                int(profile.get("file_size", 0)),
                int(profile.get("page_count", 0)),
                now,
            )
            if existing:
                connection.execute(
                    """
                    UPDATE papers SET title=?, authors=?, abstract=?, keywords=?, paper_type=?,
                        filename=?, file_size=?, page_count=?, updated_at=? WHERE id=?
                    """,
                    values[:6] + values[7:] + (existing["id"],),
                )
                return int(existing["id"])
            cursor = connection.execute(
                """
                INSERT INTO papers (
                    title, authors, abstract, keywords, paper_type, filename, file_path,
                    file_size, page_count, status, uploaded_at, updated_at, owner_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
                """,
                values[:-1] + (now, now, profile.get("owner_id")),
            )
            return int(cursor.lastrowid)

    def list_papers(self, query: str = "", status: str = "", owner_id: int | None = None) -> list[dict[str, Any]]:
        where: list[str] = []
        params: list[Any] = []
        if owner_id is not None:
            where.append("p.owner_id = ?")
            params.append(owner_id)
        if query:
            where.append("(p.title LIKE ? OR p.authors LIKE ? OR p.filename LIKE ?)")
            pattern = f"%{query}%"
            params.extend([pattern, pattern, pattern])
        if status:
            where.append("p.status = ?")
            params.append(status)
        clause = f"WHERE {' AND '.join(where)}" if where else ""
        sql = f"""
            SELECT p.*,
                r.id AS latest_review_id,
                r.recommendation,
                r.created_at AS reviewed_at,
                r.status AS review_status,
                r.scores_json
            FROM papers p
            LEFT JOIN reviews r ON r.id = (
                SELECT id FROM reviews WHERE paper_id=p.id AND status='completed'
                ORDER BY id DESC LIMIT 1
            )
            {clause}
            ORDER BY p.updated_at DESC, p.id DESC
        """
        with self.connect() as connection:
            rows = connection.execute(sql, params).fetchall()
        items: list[dict[str, Any]] = []
        for row in rows:
            item = dict(row)
            item["keywords"] = json.loads(item.get("keywords") or "[]")
            item["scores"] = json.loads(item.pop("scores_json") or "{}")
            items.append(item)
        return items

    def get_paper(self, paper_id: int, owner_id: int | None = None) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute("SELECT * FROM papers WHERE id=?", (paper_id,)).fetchone()
            if not row or (owner_id is not None and row["owner_id"] != owner_id):
                return None
            paper = self._paper_dict(row)
            review_rows = connection.execute(
                "SELECT * FROM reviews WHERE paper_id=? ORDER BY id DESC", (paper_id,)
            ).fetchall()
        paper["reviews"] = [self._review_dict(review) for review in review_rows]
        return paper

    def update_paper_profile(self, paper_id: int, **fields: Any) -> None:
        allowed = {"title", "authors", "abstract", "keywords", "paper_type", "status"}
        updates: list[str] = []
        values: list[Any] = []
        for key, value in fields.items():
            if key not in allowed:
                continue
            updates.append(f"{key}=?")
            values.append(json.dumps(value, ensure_ascii=False) if key == "keywords" else value)
        if not updates:
            return
        updates.append("updated_at=?")
        values.extend([utc_now(), paper_id])
        with self.connect() as connection:
            connection.execute(f"UPDATE papers SET {', '.join(updates)} WHERE id=?", values)

    def create_review(self, paper_id: int, strictness: str, model: str) -> int:
        with self.connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO reviews (paper_id, status, strictness, model, created_at)
                VALUES (?, 'queued', ?, ?, ?)
                """,
                (paper_id, strictness, model, utc_now()),
            )
            connection.execute(
                "UPDATE papers SET status='reviewing', updated_at=? WHERE id=?",
                (utc_now(), paper_id),
            )
            return int(cursor.lastrowid)

    def update_review(self, review_id: int, **fields: Any) -> None:
        allowed = {
            "status", "recommendation", "journal_publication", "scores_json",
            "report_markdown", "output_dir", "error", "completed_at", "model", "strictness",
        }
        updates: list[str] = []
        values: list[Any] = []
        for key, value in fields.items():
            if key in allowed:
                updates.append(f"{key}=?")
                values.append(value)
        if not updates:
            return
        values.append(review_id)
        with self.connect() as connection:
            connection.execute(f"UPDATE reviews SET {', '.join(updates)} WHERE id=?", values)

    def complete_review(
        self,
        review_id: int,
        paper_id: int,
        scores: dict[str, Any],
        report: str,
        output_dir: str,
    ) -> None:
        with self.connect() as connection:
            connection.execute(
                """
                UPDATE reviews SET status='completed', recommendation=?, journal_publication=?,
                    scores_json=?, report_markdown=?, output_dir=?, completed_at=?, error=''
                WHERE id=?
                """,
                (
                    scores.get("overall_recommendation"),
                    scores.get("journal_publication"),
                    json.dumps(scores, ensure_ascii=False),
                    report,
                    output_dir,
                    utc_now(),
                    review_id,
                ),
            )
            connection.execute(
                "UPDATE papers SET status='reviewed', updated_at=? WHERE id=?",
                (utc_now(), paper_id),
            )

    def fail_review(self, review_id: int, paper_id: int, error: str) -> None:
        with self.connect() as connection:
            connection.execute('BEGIN IMMEDIATE')
            connection.execute(
                "UPDATE reviews SET status='failed', error=?, completed_at=? WHERE id=?",
                (error[:4000], utc_now(), review_id),
            )
            completed = connection.execute(
                "SELECT 1 FROM reviews WHERE paper_id=? AND status='completed' LIMIT 1", (paper_id,)
            ).fetchone()
            status = "reviewed" if completed else "failed"
            connection.execute(
                "UPDATE papers SET status=?, updated_at=? WHERE id=?", (status, utc_now(), paper_id)
            )

            # A failed job becomes deletable only after its credit refund commits.
            self._refund_review(connection, review_id)

    def get_review(self, review_id: int) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute("SELECT * FROM reviews WHERE id=?", (review_id,)).fetchone()
        return self._review_dict(row) if row else None

    def import_review(
        self,
        paper_id: int,
        scores: dict[str, Any],
        report: str,
        output_dir: str,
    ) -> int:
        with self.connect() as connection:
            existing = connection.execute(
                "SELECT id FROM reviews WHERE paper_id=? AND output_dir=? AND status='completed'",
                (paper_id, output_dir),
            ).fetchone()
            if existing:
                return int(existing["id"])
            now = utc_now()
            cursor = connection.execute(
                """
                INSERT INTO reviews (
                    paper_id, status, strictness, model, recommendation, journal_publication,
                    scores_json, report_markdown, output_dir, created_at, completed_at
                ) VALUES (?, 'completed', 'balanced', 'existing-review', ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    paper_id,
                    scores.get("overall_recommendation"),
                    scores.get("journal_publication"),
                    json.dumps(scores, ensure_ascii=False),
                    report,
                    output_dir,
                    now,
                    now,
                ),
            )
            connection.execute(
                "UPDATE papers SET status='reviewed', updated_at=? WHERE id=?", (now, paper_id)
            )
            return int(cursor.lastrowid)

    def dashboard(self, owner_id: int | None = None) -> dict[str, Any]:
        with self.connect() as connection:
            counts = connection.execute(
                """
                SELECT COUNT(*) total,
                    SUM(status='reviewed') reviewed,
                    SUM(status='reviewing') reviewing,
                    SUM(status IN ('pending','failed')) pending
                FROM papers WHERE (? IS NULL OR owner_id=?)
                """, (owner_id, owner_id)
            ).fetchone()
            recommendations = connection.execute(
                """
                SELECT recommendation, COUNT(*) count FROM reviews
                WHERE status='completed' AND output_format='conference' AND paper_id IN (SELECT id FROM papers WHERE (? IS NULL OR owner_id=?)) AND id IN (
                    SELECT MAX(id) FROM reviews WHERE status='completed' AND output_format='conference' GROUP BY paper_id
                ) GROUP BY recommendation ORDER BY count DESC
                """, (owner_id, owner_id)
            ).fetchall()
            score_rows = connection.execute(
                """
                SELECT scores_json FROM reviews WHERE status='completed' AND output_format='conference' AND paper_id IN (SELECT id FROM papers WHERE (? IS NULL OR owner_id=?)) AND id IN (
                    SELECT MAX(id) FROM reviews WHERE status='completed' AND output_format='conference' GROUP BY paper_id
                )
                """, (owner_id, owner_id)
            ).fetchall()
        numeric_keys = [
            "scientific_quality", "originality", "quality_of_writing",
            "topical_suitability", "completeness_of_references",
            "innovation_potential", "implementation_viability", "personal_expertise",
        ]
        sums = {key: 0.0 for key in numeric_keys}
        seen = {key: 0 for key in numeric_keys}
        for row in score_rows:
            scores = json.loads(row["scores_json"] or "{}")
            for key in numeric_keys:
                value = scores.get(key)
                if isinstance(value, (int, float)):
                    sums[key] += float(value)
                    seen[key] += 1
        averages = {key: round(sums[key] / seen[key], 2) if seen[key] else 0 for key in numeric_keys}
        return {
            "counts": {key: int(counts[key] or 0) for key in counts.keys()},
            "recommendations": [dict(row) for row in recommendations],
            "average_scores": averages,
        }
