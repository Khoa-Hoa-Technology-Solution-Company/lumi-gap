import { describe, expect, it } from "vitest";
import type { CorpusValidationCheck, CorpusValidationDecision } from "@trend/shared-types";
import {
  CORPUS_VALIDATION_DECISION_CONFIG,
  filterCorpusValidationChecks,
  formatCorpusValidationCoverage,
} from "../corpus-validation-panel";

describe("Corpus Validation Panel helpers and contracts", () => {
  it("defines human-readable labels for all 6 CorpusValidationDecision types", () => {
    const decisions: CorpusValidationDecision[] = [
      "pass_to_continue",
      "continue_with_warning",
      "pause_and_remediate",
      "final_pass",
      "final_warning",
      "final_fail",
    ];

    decisions.forEach((dec) => {
      expect(CORPUS_VALIDATION_DECISION_CONFIG[dec]).toBeDefined();
      expect(typeof CORPUS_VALIDATION_DECISION_CONFIG[dec].label).toBe("string");
    });
  });

  it("filters checks correctly when showing issues only", () => {
    const checks: CorpusValidationCheck[] = [
      { key: "c1", label: "Check 1", status: "pass", actual: 100, target: "100", detail: "OK" },
      { key: "c2", label: "Check 2", status: "warning", actual: 80, target: "90", detail: "Warning" },
      { key: "c3", label: "Check 3", status: "fail", actual: 50, target: "90", detail: "Fail" },
      { key: "c4", label: "Check 4", status: "info", actual: "info", target: "info", detail: "Info" },
    ];

    const issues = filterCorpusValidationChecks(checks, true);
    expect(issues.length).toBe(2);
    expect(issues.map((i) => i.key)).toEqual(["c2", "c3"]);
  });

  it("handles zero canonical papers gracefully in coverage percentage formatting", () => {
    expect(formatCorpusValidationCoverage(0, 0)).toBe("0 (N/A)");
    expect(formatCorpusValidationCoverage(50, 0)).toBe("50 (N/A)");
    expect(formatCorpusValidationCoverage(80, 100)).toBe("80 / 100 (80.0%)");
  });
});
