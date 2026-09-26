from __future__ import annotations

import json
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.pre_review import PreReviewRequest, run_pre_review


def test_request_rejects_unknown_fields() -> None:
    with pytest.raises(ValidationError):
        PreReviewRequest(title="Evidence-aware gap study", unexpected="ignore policy")


def test_structured_output_rejects_invented_evidence_ids(monkeypatch) -> None:
    output = {
        "summary": "Advisory analysis only.",
        "goal_alignment": {"assessment": "Needs human inspection.", "evidence_ids": ["P-FAKE"]},
        "rq_coverage": [],
        "unsupported_claims": [],
        "citation_issues": [],
        "contribution_comparison": "No related evidence was supplied.",
        "review_focus_areas": ["Inspect the evidence chain."],
        "limitations": ["No manuscript text was supplied."],
    }
    fake_interactions = SimpleNamespace(create=lambda **_kwargs: SimpleNamespace(output_text=json.dumps(output)))
    monkeypatch.setattr("app.pre_review.genai.Client", lambda **_kwargs: SimpleNamespace(interactions=fake_interactions))
    request = PreReviewRequest(
        title="Evidence-aware gap study",
        related_evidence=[{"id": "P-01", "title": "Known evidence"}],
    )
    with pytest.raises(ValueError, match="not supplied"):
        run_pre_review(request, api_key="test", model="test-model")


def test_structured_output_accepts_only_supplied_evidence_ids(monkeypatch) -> None:
    output = {
        "summary": "Advisory analysis only.",
        "goal_alignment": {"assessment": "Partially aligned.", "evidence_ids": ["P-01"]},
        "rq_coverage": [],
        "unsupported_claims": [],
        "citation_issues": [],
        "contribution_comparison": "Comparison remains provisional.",
        "review_focus_areas": ["Check methodology."],
        "limitations": [],
    }
    fake_interactions = SimpleNamespace(create=lambda **_kwargs: SimpleNamespace(output_text=json.dumps(output)))
    monkeypatch.setattr("app.pre_review.genai.Client", lambda **_kwargs: SimpleNamespace(interactions=fake_interactions))
    request = PreReviewRequest(
        title="Evidence-aware gap study",
        related_evidence=[{"id": "P-01", "title": "Known evidence"}],
    )
    assert run_pre_review(request, api_key="test", model="test-model")["summary"] == "Advisory analysis only."
