from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv


ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")
DATA_DIR = ROOT_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
OUTPUT_DIR = ROOT_DIR / "outputs"
STATIC_DIR = ROOT_DIR / "app" / "static"
DB_PATH = Path(os.getenv("REVIEW_DB_PATH", str(DATA_DIR / "review_agent.db")))
PROJECT_AGENT_PATH = ROOT_DIR / "AGENTS.md"
REVIEW_SPEC_PATH = ROOT_DIR / "scientific_paper_review_agent_codex_prompt_v2_bilingual.md"

ALLOWED_RECOMMENDATIONS = (
    "Strong Reject",
    "Reject",
    "Borderline",
    "Accept",
    "Strong Accept",
)
ALLOWED_STRICTNESS = ("lenient", "balanced", "strict")
MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # Initial value; the admin storage policy controls HTTP uploads.


def ensure_directories() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
