import { describe, expect, it } from "vitest";
import { canViewGapValidation, gapValidationConflict, resolveValidationStatus, type GapValidationDecision } from "../gap-validation.rules.js";

const outsider = { isCreator: false, isProjectMember: false, isExpert: false };
const expert = { ...outsider, isExpert: true };

describe("canViewGapValidation", () => {
  it("always lets the creator and project members see evidence and validations", () => {
    expect(canViewGapValidation({ ...outsider, isCreator: true }, "CANDIDATE")).toBe(true);
    expect(canViewGapValidation({ ...outsider, isProjectMember: true }, "DRAFT")).toBe(true);
  });

  it("shares a gap with experts only after its owner requested validation", () => {
    expect(canViewGapValidation(expert, "CANDIDATE")).toBe(false);
    expect(canViewGapValidation(expert, "UNDER_VALIDATION")).toBe(true);
    expect(canViewGapValidation(expert, "VALIDATED")).toBe(true);
  });

  it("never shows a gap to an unrelated user without the capability", () => {
    expect(canViewGapValidation(outsider, "UNDER_VALIDATION")).toBe(false);
    expect(canViewGapValidation(outsider, "VALIDATED")).toBe(false);
  });
});

describe("gapValidationConflict", () => {
  it("blocks the creator and members of the gap's project", () => {
    expect(gapValidationConflict({ isCreator: true, isProjectMember: false })).not.toBeNull();
    expect(gapValidationConflict({ isCreator: false, isProjectMember: true })).not.toBeNull();
  });

  it("allows an independent expert", () => {
    expect(gapValidationConflict({ isCreator: false, isProjectMember: false })).toBeNull();
  });
});

describe("resolveValidationStatus", () => {
  let tick = 0;
  const decision = (reviewerId: string, action: string): GapValidationDecision => ({ reviewerId, action, createdAt: new Date(Date.UTC(2026, 9, 10, 0, 0, tick++)) });

  it("keeps a gap under validation after a single VALIDATE when two experts are required", () => {
    expect(resolveValidationStatus([decision("e1", "VALIDATE")], "VALIDATE", 2)).toBe("UNDER_VALIDATION");
  });

  it("validates once two different experts validate", () => {
    expect(resolveValidationStatus([decision("e1", "VALIDATE"), decision("e2", "VALIDATE")], "VALIDATE", 2)).toBe("VALIDATED");
  });

  it("does not validate while another expert challenges", () => {
    const decisions = [decision("e1", "VALIDATE"), decision("e2", "VALIDATE"), decision("e3", "CHALLENGE")];
    expect(resolveValidationStatus(decisions, "CHALLENGE", 2)).toBe("UNDER_VALIDATION");
  });

  it("does not validate while another expert asks for more evidence or rejects", () => {
    expect(resolveValidationStatus([decision("e1", "VALIDATE"), decision("e2", "VALIDATE"), decision("e3", "REQUEST_EVIDENCE")], "VALIDATE", 2)).toBe("UNDER_VALIDATION");
    expect(resolveValidationStatus([decision("e1", "VALIDATE"), decision("e2", "VALIDATE"), decision("e3", "REJECT")], "VALIDATE", 2)).toBe("UNDER_VALIDATION");
  });

  it("gives one expert a single vote however often they press VALIDATE", () => {
    expect(resolveValidationStatus([decision("e1", "VALIDATE"), decision("e1", "VALIDATE")], "VALIDATE", 2)).toBe("UNDER_VALIDATION");
  });

  it("rejects once two different experts reject", () => {
    expect(resolveValidationStatus([decision("e1", "REJECT")], "REJECT", 2)).toBe("UNDER_VALIDATION");
    expect(resolveValidationStatus([decision("e1", "REJECT"), decision("e2", "REJECT")], "REJECT", 2)).toBe("REJECTED");
  });

  it("counts only an expert's latest decision when they change their mind", () => {
    const decisions = [decision("e1", "VALIDATE"), decision("e2", "VALIDATE"), decision("e1", "CHALLENGE")];
    expect(resolveValidationStatus(decisions, "CHALLENGE", 2)).toBe("UNDER_VALIDATION");
  });

  it("treats REFINE_SCOPE as a refinement whatever the votes are", () => {
    expect(resolveValidationStatus([decision("e1", "VALIDATE"), decision("e2", "REFINE_SCOPE")], "REFINE_SCOPE", 2)).toBe("REFINED");
  });

  it("behaves like a single decision when the quorum is 1", () => {
    expect(resolveValidationStatus([decision("e1", "VALIDATE")], "VALIDATE", 1)).toBe("VALIDATED");
    expect(resolveValidationStatus([decision("e1", "REJECT")], "REJECT", 1)).toBe("REJECTED");
    expect(resolveValidationStatus([decision("e1", "CHALLENGE")], "CHALLENGE", 1)).toBe("UNDER_VALIDATION");
  });
});
