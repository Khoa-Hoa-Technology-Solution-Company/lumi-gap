from __future__ import annotations

import json
import re
from pathlib import Path

from app.config import OUTPUT_DIR, ROOT_DIR
from app.db import Database
from app.pdf_utils import extract_pdf


def normalize(value: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", value.lower())) - {
        "a", "an", "the", "of", "on", "and", "using", "for", "from", "based",
    }


def similarity(left: str, right: str) -> float:
    left_tokens = normalize(left)
    right_tokens = normalize(right)
    if not left_tokens or not right_tokens:
        return 0.0
    return len(left_tokens & right_tokens) / len(left_tokens | right_tokens)


def import_workspace(database: Database) -> None:
    paper_ids: dict[Path, int] = {}
    for pdf_path in sorted(ROOT_DIR.glob("*.pdf")):
        try:
            profile, _ = extract_pdf(pdf_path)
            paper_ids[pdf_path] = database.upsert_paper(profile)
        except Exception:
            continue

    papers = database.list_papers()
    score_paths = sorted(OUTPUT_DIR.rglob("review_scores.json")) if OUTPUT_DIR.exists() else []
    for score_path in score_paths:
        output_dir = score_path.parent
        report_path = output_dir / "final_review_bilingual.md"
        analysis_path = output_dir / "paper_analysis.json"
        if not score_path.exists() or not report_path.exists():
            continue
        try:
            scores = json.loads(score_path.read_text(encoding="utf-8"))
            report = report_path.read_text(encoding="utf-8")
            analysis = json.loads(analysis_path.read_text(encoding="utf-8")) if analysis_path.exists() else {}
        except (OSError, json.JSONDecodeError):
            continue
        title = analysis.get("title", output_dir.name.replace("_", " "))
        match = max(papers, key=lambda paper: similarity(title, paper["title"]), default=None)
        if not match or similarity(title, match["title"]) < 0.28:
            continue
        review_id = database.import_review(match["id"], scores, report, str(output_dir.resolve()))
        internal_path = output_dir / "internal_scores.json"
        if internal_path.exists():
            try:
                internal = json.loads(internal_path.read_text(encoding="utf-8"))
                strictness = internal.get("strictness")
                if strictness in {"lenient", "balanced", "strict"}:
                    database.update_review(review_id, strictness=strictness, model="existing-review")
            except (OSError, json.JSONDecodeError):
                pass
        updates: dict[str, object] = {}
        paper_type = analysis.get("paper_type")
        if isinstance(paper_type, list) and paper_type:
            updates["paper_type"] = " · ".join(str(item) for item in paper_type)
        elif isinstance(paper_type, str) and paper_type:
            updates["paper_type"] = paper_type
        if updates:
            database.update_paper_profile(match["id"], **updates)
