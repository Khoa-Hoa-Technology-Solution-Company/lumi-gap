import { expect, it } from "vitest";
import { screeningChoiceTone, screeningStatusTone } from "../screening-status";

it.each([
  ["NOT_REVIEWED", "neutral"], ["IN_REVIEW", "attention"], ["WAITING_REVIEWER", "neutral"],
  ["WAITING_FULLTEXT", "neutral"], ["AWAITING_FINALIZATION", "neutral"], ["BACKGROUND", "neutral"],
  ["NEEDS_RESOLUTION", "dispute"], ["CONFLICT", "dispute"], ["NEEDS_MORE_INFO", "warning"],
  ["ADJUDICATING", "adjudication"], ["INCLUDED", "success"], ["ADVANCE_TO_FULLTEXT", "success"],
  ["EXCLUDED", "excluded"], ["UNKNOWN_STATE", "neutral"],
])("gives %s its semantic tone %s without inspecting translated labels", (status, tone) => {
  expect(screeningStatusTone({ status })).toBe(tone);
});

it.each(["NEEDS_CLARIFICATION", "NEEDS_MORE_INFORMATION"] as const)("does not color %s like a binary disagreement", classification => {
  expect(screeningStatusTone({ status: "NEEDS_RESOLUTION", classification })).toBe("warning");
});
it("distinguishes incompatible exclusion reasons from missing information", () => {
  expect(screeningStatusTone({ status: "NEEDS_RESOLUTION", classification: "EXCLUSION_REASON_MISMATCH" })).toBe("dispute");
});
it.each(["COLLECTING", "WAITING_ASSIGNMENT", "ASSIGNED", "IN_PROGRESS"])("uses adjudication color for case %s even when the round needs more information", caseStatus => {
  expect(screeningStatusTone({ status: "NEEDS_MORE_INFO", caseStatus })).toBe("adjudication");
});
it.each(["NEEDS_MORE_INFO", "COI_REVIEW"])("shows case %s as needing attention", caseStatus => {
  expect(screeningStatusTone({ status: "ADJUDICATING", caseStatus })).toBe("warning");
});
it("shows the actual decision after adjudication instead of treating every completed case as accepted", () => {
  expect(screeningStatusTone({ status: "INCLUDED", caseStatus: "COMPLETED" })).toBe("success");
  expect(screeningStatusTone({ status: "EXCLUDED", caseStatus: "COMPLETED" })).toBe("excluded");
  expect(screeningStatusTone({ caseStatus: "COMPLETED" })).toBe("neutral");
});
it("does not present invalidated or unconfirmed legacy outcomes as current acceptance", () => {
  expect(screeningStatusTone({ status: "INCLUDED", invalidated: true })).toBe("neutral");
  expect(screeningStatusTone({ status: "INCLUDED", legacyNeedsAudit: true })).toBe("warning");
});
it("uses separate colors for the personal ballot, uncertainty and the group outcome", () => {
  expect(screeningChoiceTone("INCLUDE")).toBe("success");
  expect(screeningChoiceTone("EXCLUDE")).toBe("excluded");
  expect(screeningChoiceTone("UNSURE")).toBe("warning");
  expect(screeningStatusTone({ status: "WAITING_REVIEWER" })).toBe("neutral");
});
