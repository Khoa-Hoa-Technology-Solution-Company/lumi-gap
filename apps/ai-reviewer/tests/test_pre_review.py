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


MANUSCRIPT = "We claim that our model beats every baseline on all datasets without any statistical testing at all. Other text follows."


def _run(monkeypatch, output: dict, **request_fields) -> dict:
    fake_interactions = SimpleNamespace(create=lambda **_kwargs: SimpleNamespace(output_text=json.dumps(output)))
    monkeypatch.setattr("app.pre_review.genai.Client", lambda **_kwargs: SimpleNamespace(interactions=fake_interactions))
    request = PreReviewRequest(title="Evidence-aware gap study", **request_fields)
    return run_pre_review(request, api_key="test", model="test-model")


def _output(claims: list[dict]) -> dict:
    return {
        "summary": "s",
        "goal_alignment": {"assessment": "a", "evidence_ids": []},
        "rq_coverage": [],
        "unsupported_claims": claims,
        "citation_issues": ["Reference [3] is not in the bibliography."],
        "contribution_comparison": "c",
        "review_focus_areas": [],
        "limitations": [],
    }


def test_without_manuscript_claims_and_citation_issues_are_cleared(monkeypatch) -> None:
    claim = {"claim": "x", "quote": "invented quote that cannot be verified here", "reason": "r", "evidence_ids": []}
    result = _run(monkeypatch, _output([claim]))
    assert result["unsupported_claims"] == []
    assert result["citation_issues"] == []
    assert "Only submission metadata was analysed; the manuscript text was not available." in result["limitations"]


def test_with_manuscript_only_verbatim_claims_are_kept(monkeypatch) -> None:
    real = {"claim": "beats every baseline", "quote": "our model beats every baseline on all datasets", "reason": "r", "evidence_ids": []}
    fake = {"claim": "made up", "quote": "this sentence was never written by the authors", "reason": "r", "evidence_ids": []}
    result = _run(monkeypatch, _output([real, fake]), manuscript_text=MANUSCRIPT)
    assert result["unsupported_claims"] == [real]
    assert result["citation_issues"] == ["Reference [3] is not in the bibliography."]
    assert any("1 unsupported-claim item(s) were removed" in item for item in result["limitations"])
