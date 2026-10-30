import { describe, expect, it, vi } from "vitest";

vi.mock("../../../infrastructure/queue.js", () => ({ gapsQueue: { add: vi.fn() } }));

import {
  canViewCalibrationCheck,
  gapAccessLevel,
  isDecidableStatus,
  isReviewableStatus,
  reopensDecision,
  reviewQuoteError,
  secondReviewerError,
} from "../closure.access.js";

describe("gapAccessLevel", () => {
  it("makes the gap creator and the project owner managers", () => {
    expect(gapAccessLevel({ userId: "u1", gapOwnerId: "u1" })).toBe("manager");
    expect(gapAccessLevel({ userId: "u1", gapOwnerId: "u1", projectOwnerId: "owner", isActiveProjectMember: true })).toBe("manager");
    expect(gapAccessLevel({ userId: "owner", gapOwnerId: "u1", projectOwnerId: "owner" })).toBe("manager");
  });

  it("revokes access for a removed project member even if they originally created the project gap", () => {
    expect(gapAccessLevel({ userId: "u1", gapOwnerId: "u1", projectOwnerId: "owner", isActiveProjectMember: false })).toBe("none");
    expect(gapAccessLevel({ userId: "u1", gapOwnerId: "u1", hasProject: true, isActiveProjectMember: false })).toBe("none");
  });

  it("lets ACTIVE project members read but not manage", () => {
    expect(gapAccessLevel({ userId: "m", gapOwnerId: "u1", projectOwnerId: "owner", isActiveProjectMember: true })).toBe("member");
  });

  it("rejects everyone else", () => {
    expect(gapAccessLevel({ userId: "x", gapOwnerId: "u1", projectOwnerId: "owner" })).toBe("none");
    expect(gapAccessLevel({ userId: "x", gapOwnerId: "u1", projectOwnerId: null, isActiveProjectMember: false })).toBe("none");
  });
});

describe("canViewCalibrationCheck", () => {
  it("allows the calibration creator, admins and GAP_VALIDATION holders", () => {
    const base = { userId: "u", calibrationCreatorId: "creator", isAdmin: false, hasGapValidation: false };
    expect(canViewCalibrationCheck({ ...base, userId: "creator" })).toBe(true);
    expect(canViewCalibrationCheck({ ...base, isAdmin: true })).toBe(true);
    expect(canViewCalibrationCheck({ ...base, hasGapValidation: true })).toBe(true);
    expect(canViewCalibrationCheck(base)).toBe(false);
  });
});

describe("check status rules", () => {
  it("reviews and decides only after screening", () => {
    for (const status of ["SCREENING", "DECIDED"]) {
      expect(isReviewableStatus(status)).toBe(true);
      expect(isDecidableStatus(status)).toBe(true);
    }
    for (const status of ["QUEUED", "SEARCHING", "FAILED"]) {
      expect(isReviewableStatus(status)).toBe(false);
      expect(isDecidableStatus(status)).toBe(false);
    }
  });

  it("a deciding label reopens a decided check; a second review never does", () => {
    expect(reopensDecision("DECIDED", false)).toBe(true);
    expect(reopensDecision("DECIDED", undefined)).toBe(true);
    expect(reopensDecision("DECIDED", true)).toBe(false);
    expect(reopensDecision("SCREENING", false)).toBe(false);
  });
});

describe("reviewQuoteError", () => {
  const doc = { title: "Telehealth for heart failure", abstractText: "In a randomized trial, telehealth monitoring reduced 30-day readmissions among adults with heart failure." };

  it("requires a quote for ANSWERS and PARTIAL", () => {
    expect(reviewQuoteError({ ...doc, label: "ANSWERS" })).toMatch(/quote is required/);
    expect(reviewQuoteError({ ...doc, label: "PARTIAL", quote: "   " })).toMatch(/quote is required/);
  });

  it("accepts a verbatim quote (case and whitespace insensitive) and rejects an invented one", () => {
    expect(reviewQuoteError({ ...doc, label: "ANSWERS", quote: "telehealth monitoring  reduced 30-day readmissions" })).toBeNull();
    expect(reviewQuoteError({ ...doc, label: "ANSWERS", quote: "telehealth monitoring eliminated all readmissions" })).toMatch(/verbatim/);
    expect(reviewQuoteError({ ...doc, label: "ANSWERS", quote: "reduced" })).toMatch(/verbatim/);
  });

  it("needs no quote for UNRELATED or for a second reviewer", () => {
    expect(reviewQuoteError({ ...doc, label: "UNRELATED" })).toBeNull();
    expect(reviewQuoteError({ ...doc, label: "ANSWERS", asSecondReviewer: true })).toBeNull();
  });

  it("works for a document without an abstract (title only)", () => {
    expect(reviewQuoteError({ title: "A very specific title about telehealth", abstractText: null, label: "PARTIAL", quote: "very specific title about telehealth" })).toBeNull();
  });
});

describe("secondReviewerError", () => {
  it("needs a first label from another person", () => {
    expect(secondReviewerError({ firstReviewerId: null, firstLabel: null, reviewerId: "b" })).toMatch(/first reviewer must label/);
    expect(secondReviewerError({ firstReviewerId: "a", firstLabel: "ANSWERS", reviewerId: "a" })).toMatch(/different person/);
    expect(secondReviewerError({ firstReviewerId: "a", firstLabel: "ANSWERS", reviewerId: "b" })).toBeNull();
  });
});
