from __future__ import annotations

import os
from pathlib import Path

import uvicorn
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / '.env')


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=os.getenv("REVIEW_APP_HOST", "127.0.0.1"),
        port=int(os.getenv("REVIEW_APP_PORT", "8000")),
        reload=os.getenv("REVIEW_APP_RELOAD", "false").lower() == "true",
    )
