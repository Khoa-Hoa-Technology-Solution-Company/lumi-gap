import { describe, expect, it } from "vitest";
import { UpdateAcademicProfileDetailsSchema, UpdatePublicHandleSchema, isValidOrcid } from "../dto/academic-profile.schema.js";

describe("academic profile input validation", () => {
  it("validates ORCID using its checksum", () => {
    expect(isValidOrcid("0000-0002-1825-0097")).toBe(true);
    expect(isValidOrcid("https://orcid.org/0000-0002-1825-0097")).toBe(true);
    expect(isValidOrcid("0000-0002-1825-0098")).toBe(false);
  });

  it("normalizes and deduplicates expertise values", () => {
    const parsed = UpdateAcademicProfileDetailsSchema.parse({
      expertiseAreas: ["  Software Testing ", "software testing", "AI"],
    });
    expect(parsed.expertiseAreas).toEqual(["Software Testing", "AI"]);
  });

  it("rejects invalid support/review values and excessive arrays", () => {
    expect(UpdateAcademicProfileDetailsSchema.safeParse({
      supportAvailability: { enabled: true, types: ["AUTO_ASSIGN"], preferredTopics: [] },
    }).success).toBe(false);
    expect(UpdateAcademicProfileDetailsSchema.safeParse({
      skills: Array.from({ length: 41 }, (_, index) => `skill-${index}`),
    }).success).toBe(false);
  });

  it("rejects verification fields supplied through profile PATCH", () => {
    expect(UpdateAcademicProfileDetailsSchema.safeParse({ verificationStatus: "VERIFIED" }).success).toBe(false);
    expect(UpdateAcademicProfileDetailsSchema.safeParse({ verifiedBy: "000000000000000000000001" }).success).toBe(false);
  });

  it("keeps a manually supplied ORCID as an identity input without trust fields", () => {
    const parsed = UpdateAcademicProfileDetailsSchema.parse({
      externalIdentities: [{ provider: "ORCID", externalId: "0000-0002-1825-0097" }],
    });
    expect(parsed.externalIdentities?.[0]).not.toHaveProperty("status");
    expect(parsed.externalIdentities?.[0]).not.toHaveProperty("source");
  });

  it("validates provider-specific academic identity formats", () => {
    expect(UpdateAcademicProfileDetailsSchema.safeParse({
      externalIdentities: [
        { provider: "OPENALEX", externalId: "A123456789" },
        { provider: "GOOGLE_SCHOLAR", profileUrl: "https://scholar.google.com/citations?user=abc123" },
        { provider: "SEMANTIC_SCHOLAR", profileUrl: "https://www.semanticscholar.org/author/Ada-Lovelace/123" },
      ],
    }).success).toBe(true);

    expect(UpdateAcademicProfileDetailsSchema.safeParse({
      externalIdentities: [{ provider: "OPENALEX", externalId: "researcher-123" }],
    }).success).toBe(false);
    expect(UpdateAcademicProfileDetailsSchema.safeParse({
      externalIdentities: [{ provider: "GOOGLE_SCHOLAR", profileUrl: "https://example.com/citations?user=abc" }],
    }).success).toBe(false);
    expect(UpdateAcademicProfileDetailsSchema.safeParse({
      externalIdentities: [{ provider: "SEMANTIC_SCHOLAR", profileUrl: "https://semanticscholar.org/paper/123" }],
    }).success).toBe(false);
  });

  it("normalizes safe public handles and rejects reserved or deceptive paths", () => {
    expect(UpdatePublicHandleSchema.parse({ handle: "  NguyenDinhThanh-IT  " }).handle).toBe("nguyendinhthanh-it");
    for (const handle of ["admin", "search", "lecturers", "research-gaps", "a", "-thanh", "thanh-", "thanh--it", "thanh/it", "thành-it"]) {
      expect(UpdatePublicHandleSchema.safeParse({ handle }).success).toBe(false);
    }
  });
});
