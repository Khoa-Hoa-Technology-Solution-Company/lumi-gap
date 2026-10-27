"""Shared authentication for service-to-service endpoints."""

import hmac
import os
from typing import Optional

from fastapi import Header, HTTPException


def verify_internal_key(x_internal_key: Optional[str] = Header(None)) -> None:
    expected = os.getenv("INTERNAL_SERVICE_KEY")
    if not expected:
        raise HTTPException(status_code=503, detail="Internal service key is not configured")
    if not x_internal_key or not hmac.compare_digest(
        expected.encode("utf-8"), x_internal_key.encode("utf-8")
    ):
        raise HTTPException(status_code=403, detail="Invalid internal service key")
