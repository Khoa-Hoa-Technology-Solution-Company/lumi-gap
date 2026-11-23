import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { mentorshipApplicationSchema } from "../dto/mentorship-application.schema.js";
import { buildLecturerMatch } from "../lecturer-match-evidence.js";

describe("mentorshipApplicationSchema (simplified support offer + legacy compatibility)", () => {
  it("accepts a simplified support offer with only message and idempotencyKey", () => {
    const idempotencyKey = randomUUID();
    const parsed = mentorshipApplicationSchema.parse({
      message: "Mình có thể hỗ trợ nhóm thiết kế thực nghiệm và góp ý bản thảo định kỳ.",
      idempotencyKey,
    });
    expect(parsed).toEqual({
      message: "Mình có thể hỗ trợ nhóm thiết kế thực nghiệm và góp ý bản thảo định kỳ.",
      mentorRole: undefined,
      areas: [],
      methodologies: [],
      capabilities: [],
      availability: "",
      idempotencyKey,
    });
  });

  it("accepts optional availability (blank or short) without forcing a minimum length", () => {
    const idempotencyKey = randomUUID();
    expect(
      mentorshipApplicationSchema.parse({
        message: "I can advise on experimental methodology and manuscript structure.",
        availability: "",
        idempotencyKey,
      }).availability,
    ).toBe("");
    expect(
      mentorshipApplicationSchema.parse({
        message: "I can advise on experimental methodology and manuscript structure.",
        availability: "Thứ 6",
        idempotencyKey,
      }).availability,
    ).toBe("Thứ 6");
  });

  it("remains backward-compatible with legacy payloads sending areas, methodologies, capabilities, and mentorRole", () => {
    const idempotencyKey = randomUUID();
    const parsed = mentorshipApplicationSchema.parse({
      message: "I can guide computer vision study design and analysis",
      mentorRole: "SECONDARY",
      areas: ["Computer vision", "Computer vision"],
      methodologies: ["Survey"],
      capabilities: ["Study design"],
      availability: "One review meeting each week",
      idempotencyKey,
    });
    expect(parsed).toEqual({
      message: "I can guide computer vision study design and analysis",
      mentorRole: "SECONDARY",
      areas: ["Computer vision"],
      methodologies: ["Survey"],
      capabilities: ["Study design"],
      availability: "One review meeting each week",
      idempotencyKey,
    });
  });

  it("rejects messages shorter than 20 trimmed characters or invalid mentorRole", () => {
    const idempotencyKey = randomUUID();
    expect(() =>
      mentorshipApplicationSchema.parse({
        message: "   too short   ",
        idempotencyKey,
      }),
    ).toThrow();
    expect(() =>
      mentorshipApplicationSchema.parse({
        message: "A sufficiently long message describing mentoring support for the group.",
        mentorRole: "UNASSIGNED",
        idempotencyKey,
      }),
    ).toThrow();
  });

  it("builds lecturer match evidence safely when optional arrays are omitted", () => {
    const evidence = buildLecturerMatch(
      { topics: ["Machine Learning"], methodologies: ["Quantitative"], needs: "Weekly review" },
      {},
      undefined,
      [],
      true,
    );
    expect(evidence.verifiedLecturer).toBe(true);
    expect(evidence.topics).toEqual([]);
    expect(evidence.methodologies).toEqual([]);
  });
});
