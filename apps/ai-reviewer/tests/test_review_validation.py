from __future__ import annotations

import copy
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.reviewer import (
    SCORE_KEYS,
    GeminiReviewProvider,
    review_with_validation,
    scores_from_result,
    validate_result,
)

PAGE_1 = "We evaluate the proposed method on three benchmark datasets and report strong gains over the base-\nline across all of them."
PAGE_2 = "The ﬁnal results show that the approach is limited to English text and was never tested on other languages."
PAGES = {1: PAGE_1, 2: PAGE_2}
GOOD_QUOTE = {"text": "report strong gains over the baseline across all of them", "page": 1}
GOOD_QUOTE_2 = {"text": "the final results show that the approach is limited to English", "page": 2}
FAKE_QUOTE = {"text": "this sentence never appears anywhere in the manuscript", "page": 1}


def bilingual(text: str = "x") -> dict:
    return {"en": text, "vi": text}


def criterion(score: int = 4, quotes: list | None = None, assessable: bool = True) -> dict:
    return {"score": score, "assessable": assessable, "evidence": bilingual(), "explanation": bilingual(), "quotes": quotes or []}


def issue(classification: str = "Confirmed issue", severity: str = "high", quotes: list | None = None) -> dict:
    return {
        "category": "methodology", "classification": classification, "severity": severity,
        "finding": "f", "evidence": "e", "recommendation": "r", "quotes": quotes if quotes is not None else [],
    }


def make_result(decision: str = "Borderline", issues: list | None = None, quality: int = 4, quotes: list | None = None) -> dict:
    criteria = {key: criterion() for key in SCORE_KEYS}
    criteria["scientific_quality"] = criterion(quality, quotes)
    return {
        "profile": {},
        "criteria": criteria,
        "journal_publication": {"decision": "No", "explanation": bilingual()},
        "overall_recommendation": {"decision": decision, "rationale": bilingual()},
        "remarks": {"summary": bilingual(), "strengths_en": ["a", "b"], "strengths_vi": ["a", "b"], "changes_en": ["a", "b"], "changes_vi": ["a", "b"], "tpc": bilingual()},
        "issues": issues or [],
        "claims": [],
        "reproducibility": {"score": 3, "available": [], "missing": []},
    }


def test_matching_quote_survives_hyphenation_and_ligatures() -> None:
    result = make_result(quotes=[GOOD_QUOTE, GOOD_QUOTE_2])
    assert validate_result(result, PAGES) == []
    assert result["criteria"]["scientific_quality"]["quotes"] == [GOOD_QUOTE, GOOD_QUOTE_2]
    assert result["validation_warnings"] == []


def test_fabricated_quote_is_removed_with_warning() -> None:
    result = make_result(quotes=[GOOD_QUOTE, FAKE_QUOTE])
    assert validate_result(result, PAGES) == []
    assert result["criteria"]["scientific_quality"]["quotes"] == [GOOD_QUOTE]
    assert result["validation_warnings"]


def test_quote_page_out_of_range_is_removed_without_violation() -> None:
    result = make_result(quotes=[{**GOOD_QUOTE, "page": 9}])
    assert validate_result(result, PAGES) == []
    assert result["criteria"]["scientific_quality"]["quotes"] == []
    assert any("out of range" in warning for warning in result["validation_warnings"])


def test_bad_quotes_alone_do_not_trigger_a_second_model_call() -> None:
    calls: list[str] = []

    def generate(text: str) -> dict:
        calls.append(text)
        return make_result(quotes=[FAKE_QUOTE, {**GOOD_QUOTE, "page": 9}], issues=[issue(quotes=[GOOD_QUOTE, FAKE_QUOTE])])

    result = review_with_validation(generate, "input", PAGES)
    assert len(calls) == 1
    assert result["issues"][0]["quotes"] == [GOOD_QUOTE]


def test_required_criterion_cannot_be_marked_not_assessable() -> None:
    result = make_result(decision="Accept", quality=2)
    result["criteria"]["scientific_quality"]["assessable"] = False
    violations = validate_result(result, PAGES)
    assert result["criteria"]["scientific_quality"]["assessable"] is True
    assert any("scientific_quality" in violation for violation in violations)
    assert any("assessable=false ignored" in warning for warning in result["validation_warnings"])
    assert scores_from_result(result)["scientific_quality"] == 2


def test_confirmed_high_issue_without_quote_is_a_violation() -> None:
    result = make_result(issues=[issue()])
    assert any("no verified quote" in violation for violation in validate_result(result, PAGES))


def test_structural_errors_still_raise() -> None:
    result = make_result()
    result["criteria"]["originality"]["score"] = 9
    with pytest.raises(ValueError):
        validate_result(result, PAGES)


def test_unquoted_confirmed_issue_is_downgraded_after_retry() -> None:
    calls: list[str] = []

    def generate(text: str) -> dict:
        calls.append(text)
        return make_result(issues=[issue()])

    result = review_with_validation(generate, "input", PAGES)
    assert len(calls) == 2
    assert "FAILED VALIDATION" in calls[1]
    assert result["issues"][0]["classification"] == "Potential issue"
    assert any("downgraded" in warning for warning in result["validation_warnings"])


def test_accept_with_low_scientific_quality_raises_after_retry() -> None:
    calls: list[str] = []

    def generate(text: str) -> dict:
        calls.append(text)
        return make_result(decision="Accept", quality=2)

    with pytest.raises(ValueError, match="inconsistent"):
        review_with_validation(generate, "input", PAGES)
    assert len(calls) == 2


def test_accept_with_confirmed_high_issue_is_fixed_by_downgrade() -> None:
    result = review_with_validation(lambda _t: make_result(decision="Accept", issues=[issue()]), "input", PAGES)
    assert result["issues"][0]["classification"] == "Potential issue"


def test_second_attempt_is_used_when_first_fails_and_second_passes() -> None:
    answers = [make_result(issues=[issue()]), make_result(issues=[issue(quotes=[GOOD_QUOTE])])]
    calls: list[str] = []

    def generate(text: str) -> dict:
        calls.append(text)
        return answers[len(calls) - 1]

    result = review_with_validation(generate, "input", PAGES)
    assert len(calls) == 2
    assert result is answers[1]
    assert result["issues"][0]["classification"] == "Confirmed issue"


def test_valid_first_answer_calls_model_once() -> None:
    calls: list[str] = []

    def generate(text: str) -> dict:
        calls.append(text)
        return make_result(issues=[issue(quotes=[GOOD_QUOTE])])

    review_with_validation(generate, "input", PAGES)
    assert len(calls) == 1


def test_gemini_provider_validates_and_calls_model_twice(monkeypatch) -> None:
    outputs = [make_result(issues=[issue()]), make_result(issues=[issue(quotes=[GOOD_QUOTE])])]
    calls: list[str] = []

    def create(**kwargs):
        calls.append(kwargs["input"])
        return SimpleNamespace(output_text=json.dumps(outputs[len(calls) - 1]))

    monkeypatch.setattr("app.reviewer.build_review_request", lambda *_a, **_k: ("instructions", "manuscript", PAGES))
    monkeypatch.setattr("app.reviewer.genai.Client", lambda **_k: SimpleNamespace(interactions=SimpleNamespace(create=create)))
    result = GeminiReviewProvider(model="m", api_key="k").review(Path("x.pdf"), "balanced")
    assert len(calls) == 2
    assert result["issues"][0]["quotes"] == [GOOD_QUOTE]


def test_not_assessable_criterion_has_no_score() -> None:
    result = make_result()
    result["criteria"]["originality"] = criterion(3, assessable=False)
    scores = scores_from_result(copy.deepcopy(result))
    assert scores["originality"] is None
    assert scores["scientific_quality"] == 4


def test_personal_expertise_is_not_a_scored_criterion() -> None:
    assert "personal_expertise" not in SCORE_KEYS
