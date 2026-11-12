import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { evaluateScreeningPair, outcomeState } from "../screening.calculator.js";
import {
  screeningDiscussionExtendSchema,
  screeningCloseUnresolvedSchema,
  screeningReopenUnresolvedSchema,
  screeningConfigSchema,
  screeningAgreementSchema,
  screeningAgreementConfirmSchema,
  screeningAgreementDeclineSchema,
  screeningRequestMoreInfoSchema,
} from "../dto/screening.schema.js";
import type { ScreeningSettings } from "@trend/shared-types";

describe("TEAM_SCREENING: Two-Reviewer Consensus Workflow", () => {
  const teamSettings: Pick<ScreeningSettings, "screeningMode" | "workflowVersion" | "exclusionCriteria" | "workflowKind"> = {
    workflowKind: "TEAM_SCREENING",
    workflowVersion: 12,
    exclusionCriteria: ["Wrong population", "Wrong study design"],
  };

  const effectivePair = (
    a: string,
    b: string,
    exclusionReasonA = "Wrong population",
    exclusionReasonB = "Wrong population"
  ) => [
    { reviewerId: "rev-1", roundId: "round-1", decision: a, exclusionReason: exclusionReasonA },
    { reviewerId: "rev-2", roundId: "round-1", decision: b, exclusionReason: exclusionReasonB },
  ];

  describe("Deterministic Decision Matrix (Section 7)", () => {
    it("INCLUDE + INCLUDE -> FINAL_INCLUDED", () => {
      const ballots = effectivePair("INCLUDE", "INCLUDE");
      expect(evaluateScreeningPair(teamSettings, "TITLE_ABSTRACT", ballots)).toBe("FINAL_INCLUDED");
    });

    it("EXCLUDE + EXCLUDE with valid criteria -> EXCLUDED", () => {
      const ballots = effectivePair("EXCLUDE", "EXCLUDE", "Wrong population", "Wrong population");
      expect(evaluateScreeningPair(teamSettings, "TITLE_ABSTRACT", ballots)).toBe("EXCLUDED");
    });

    it("EXCLUDE + EXCLUDE without valid criteria -> NEEDS_CLARIFICATION", () => {
      const ballots = effectivePair("EXCLUDE", "EXCLUDE", "Not in criteria", "Not in criteria");
      expect(evaluateScreeningPair(teamSettings, "TITLE_ABSTRACT", ballots)).toBe("NEEDS_CLARIFICATION");
    });

    it("EXCLUDE + EXCLUDE without exclusion evidence available -> NEEDS_CLARIFICATION", () => {
      const ballots = effectivePair("EXCLUDE", "EXCLUDE", "Wrong population", "Wrong population");
      expect(evaluateScreeningPair(teamSettings, "TITLE_ABSTRACT", ballots, false)).toBe("NEEDS_CLARIFICATION");
    });

    it("INCLUDE + EXCLUDE -> CONFLICT (Reviewer Discussion required)", () => {
      const ballots = effectivePair("INCLUDE", "EXCLUDE");
      expect(evaluateScreeningPair(teamSettings, "TITLE_ABSTRACT", ballots)).toBe("CONFLICT");
      const reversed = effectivePair("EXCLUDE", "INCLUDE");
      expect(evaluateScreeningPair(teamSettings, "TITLE_ABSTRACT", reversed)).toBe("CONFLICT");
    });

    it("INCLUDE + UNSURE -> NEEDS_CLARIFICATION (Clarification required)", () => {
      const ballots = effectivePair("INCLUDE", "UNSURE");
      expect(evaluateScreeningPair(teamSettings, "TITLE_ABSTRACT", ballots)).toBe("NEEDS_CLARIFICATION");
      const reversed = effectivePair("UNSURE", "INCLUDE");
      expect(evaluateScreeningPair(teamSettings, "TITLE_ABSTRACT", reversed)).toBe("NEEDS_CLARIFICATION");
    });

    it("EXCLUDE + UNSURE -> NEEDS_CLARIFICATION", () => {
      const ballots = effectivePair("EXCLUDE", "UNSURE");
      expect(evaluateScreeningPair(teamSettings, "TITLE_ABSTRACT", ballots)).toBe("NEEDS_CLARIFICATION");
      const reversed = effectivePair("UNSURE", "EXCLUDE");
      expect(evaluateScreeningPair(teamSettings, "TITLE_ABSTRACT", reversed)).toBe("NEEDS_CLARIFICATION");
    });

    it("UNSURE + UNSURE -> NEEDS_CLARIFICATION", () => {
      const ballots = effectivePair("UNSURE", "UNSURE");
      expect(evaluateScreeningPair(teamSettings, "TITLE_ABSTRACT", ballots)).toBe("NEEDS_CLARIFICATION");
    });

    it("requires exactly two distinct reviewers on the same round", () => {
      expect(evaluateScreeningPair(teamSettings, "TITLE_ABSTRACT", [])).toBe("WAITING_REVIEWS");
      const one = effectivePair("INCLUDE", "INCLUDE").slice(0, 1);
      expect(evaluateScreeningPair(teamSettings, "TITLE_ABSTRACT", one)).toBe("WAITING_SECOND_REVIEW");

      // Same reviewer claiming both slots fails
      const duplicateReviewer = [
        { reviewerId: "rev-1", roundId: "round-1", decision: "INCLUDE", exclusionReason: "" },
        { reviewerId: "rev-1", roundId: "round-1", decision: "INCLUDE", exclusionReason: "" },
      ];
      expect(evaluateScreeningPair(teamSettings, "TITLE_ABSTRACT", duplicateReviewer)).toBe("NEEDS_CLARIFICATION");

      // Mismatched rounds fails
      const differentRounds = [
        { reviewerId: "rev-1", roundId: "round-1", decision: "INCLUDE", exclusionReason: "" },
        { reviewerId: "rev-2", roundId: "round-2", decision: "INCLUDE", exclusionReason: "" },
      ];
      expect(evaluateScreeningPair(teamSettings, "TITLE_ABSTRACT", differentRounds)).toBe("NEEDS_CLARIFICATION");
    });
  });

  describe("Canonical State Machine and Terminal Outcomes (Section 3 & 11)", () => {
    it("maps outcomes correctly to screening states", () => {
      expect(outcomeState("FINAL_INCLUDED")).toBe("INCLUDED");
      expect(outcomeState("EXCLUDED")).toBe("EXCLUDED");
      expect(outcomeState("CONFLICT")).toBe("NEEDS_RESOLUTION");
      expect(outcomeState("NEEDS_CLARIFICATION")).toBe("NEEDS_MORE_INFO");
      expect(outcomeState("CLOSED_UNRESOLVED")).toBe("CLOSED_UNRESOLVED");
    });

    it("CLOSED_UNRESOLVED is distinct from EXCLUDED and INCLUDED", () => {
      const closed = outcomeState("CLOSED_UNRESOLVED");
      expect(closed).toBe("CLOSED_UNRESOLVED");
      expect(closed).not.toBe("EXCLUDED");
      expect(closed).not.toBe("INCLUDED");
      expect(closed).not.toBe("NEEDS_RESOLUTION");
    });
  });

  describe("Discussion Timing and Deadline Enforcement (Section 10)", () => {
    it("computes 48h initial deadline and 72h hard deadline with 1 max extension", () => {
      const discussionStarted = new Date("2026-11-01T10:00:00.000Z");
      const initialDeadline = new Date(discussionStarted.getTime() + 48 * 3600 * 1000);
      const maxExtensionHours = 24;
      const hardDeadline = new Date(initialDeadline.getTime() + maxExtensionHours * 3600 * 1000);

      expect(initialDeadline.toISOString()).toBe("2026-11-03T10:00:00.000Z");
      expect(hardDeadline.toISOString()).toBe("2026-11-04T10:00:00.000Z");
      expect(hardDeadline.getTime() - discussionStarted.getTime()).toBe(72 * 3600 * 1000);
    });

    it("single 24h extension extends effective deadline but cannot exceed hard deadline", () => {
      const discussionStarted = new Date("2026-11-01T10:00:00.000Z");
      const initialDeadline = new Date(discussionStarted.getTime() + 48 * 3600 * 1000);
      const hardDeadline = new Date(initialDeadline.getTime() + 24 * 3600 * 1000);

      // Extension of 24h
      const extendedDeadline = new Date(Math.min(initialDeadline.getTime() + 24 * 3600 * 1000, hardDeadline.getTime()));
      expect(extendedDeadline.toISOString()).toBe(hardDeadline.toISOString());

      // Additional extension attempt would exceed hard deadline
      const overExtended = new Date(Math.min(extendedDeadline.getTime() + 24 * 3600 * 1000, hardDeadline.getTime()));
      expect(overExtended.toISOString()).toBe(hardDeadline.toISOString());
    });
  });

  describe("Validation Schemas for Team Screening Commands", () => {
    it("validates discussion extension schema", () => {
      const valid = {
        expectedVersion: 3,
        hours: 24,
        reason: "Cần thêm thời gian để đối chiếu phương pháp",
        clientKey: randomUUID(),
      };
      expect(screeningDiscussionExtendSchema.safeParse(valid).success).toBe(true);

      // Hours > 24 rejected
      expect(screeningDiscussionExtendSchema.safeParse({ ...valid, hours: 25 }).success).toBe(false);
      // Hours < 1 rejected
      expect(screeningDiscussionExtendSchema.safeParse({ ...valid, hours: 0 }).success).toBe(false);
      // Short reason (< 5 chars) rejected
      expect(screeningDiscussionExtendSchema.safeParse({ ...valid, reason: "Ngắn" }).success).toBe(false);
    });

    it("validates close unresolved schema", () => {
      const valid = {
        expectedVersion: 4,
        reason: "NO_CONSENSUS" as const,
        note: "Hai reviewer giữ nguyên quan điểm về tiêu chí chọn mẫu",
        clientKey: randomUUID(),
      };
      expect(screeningCloseUnresolvedSchema.safeParse(valid).success).toBe(true);

      for (const reason of ["NO_CONSENSUS", "DEADLINE_EXPIRED", "NO_RESPONSE", "INSUFFICIENT_INFORMATION"]) {
        expect(screeningCloseUnresolvedSchema.safeParse({ ...valid, reason }).success).toBe(true);
      }

      // Invalid reason rejected
      expect(screeningCloseUnresolvedSchema.safeParse({ ...valid, reason: "OTHER_REASON" }).success).toBe(false);
    });

    it("validates reopen unresolved schema", () => {
      const valid = {
        expectedVersion: 5,
        reason: "Có thêm bài báo đính chính và tiêu chí cập nhật",
        clientKey: randomUUID(),
      };
      expect(screeningReopenUnresolvedSchema.safeParse(valid).success).toBe(true);
      // Short reason rejected
      expect(screeningReopenUnresolvedSchema.safeParse({ ...valid, reason: "abc" }).success).toBe(false);
    });

    it("validates config schema with workflowKind", () => {
      const config = {
        workflowKind: "TEAM_SCREENING" as const,
        expectedVersion: 0,
        requiredReviewers: 2,
        consensusPolicy: "UNANIMOUS" as const,
        resolutionPolicy: "CONSENSUS" as const,
        aiAssisted: false,
        inclusionCriteria: ["Sample criteria 1"],
        exclusionCriteria: ["Sample exclusion 1"],
        researchQuestions: ["Sample RQ 1"],
        clientKey: randomUUID(),
      };
      const parsed = screeningConfigSchema.safeParse(config);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.workflowKind).toBe("TEAM_SCREENING");
        expect(parsed.data.resolutionPolicy).toBe("CONSENSUS");
      }
    });

    it("validates agreement proposal, confirmation, and decline schemas", () => {
      const proposal = {
        expectedVersion: 2,
        decision: "INCLUDED" as const,
        reason: "Hai người cùng thống nhất bài đáp ứng đầy đủ tiêu chí đưa vào",
        confirmed: true as const,
        clientKey: randomUUID(),
      };
      expect(screeningAgreementSchema.safeParse(proposal).success).toBe(true);

      const confirm = {
        expectedVersion: 3,
        proposalId: randomUUID(),
        confirmed: true as const,
        clientKey: randomUUID(),
      };
      expect(screeningAgreementConfirmSchema.safeParse(confirm).success).toBe(true);

      const decline = {
        expectedVersion: 3,
        proposalId: randomUUID(),
        reason: "Tôi nhận thấy phương pháp chưa đối chiếu kỹ, cần thảo luận lại",
        confirmed: true as const,
        clientKey: randomUUID(),
      };
      expect(screeningAgreementDeclineSchema.safeParse(decline).success).toBe(true);
    });

    it("validates request more info schema", () => {
      const valid = {
        expectedVersion: 2,
        reason: "Cần toàn văn để kiểm tra số liệu phương pháp và tiêu chí chọn mẫu",
        clientKey: randomUUID(),
      };
      expect(screeningRequestMoreInfoSchema.safeParse(valid).success).toBe(true);

      // Short reason (< 10 chars) rejected
      expect(screeningRequestMoreInfoSchema.safeParse({ ...valid, reason: "Cần thêm" }).success).toBe(false);

      // Negative version rejected
      expect(screeningRequestMoreInfoSchema.safeParse({ ...valid, expectedVersion: -1 }).success).toBe(false);
    });

    it("enforces that proposal reason has at least 10 characters", () => {
      const shortProposal = {
        expectedVersion: 2,
        decision: "INCLUDED" as const,
        reason: "Quá ngắn",
        confirmed: true as const,
        clientKey: randomUUID(),
      };
      expect(screeningAgreementSchema.safeParse(shortProposal).success).toBe(false);
    });
  });
});
