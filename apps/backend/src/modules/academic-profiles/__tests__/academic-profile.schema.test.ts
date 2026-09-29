import { describe, expect, it } from "vitest";
import { classifyAcademicPosition } from "@trend/shared-types";
import {
  AcademicIdentityLinkSchema,
  CreateAcademicIdentityLinkSchema,
  PublicHandleParamsSchema,
  UpdateAcademicIdentityLinkSchema,
  UpdateAcademicProfileDetailsSchema,
  UpdatePublicHandleSchema,
  VerificationRequestSchema,
  isValidOrcid,
} from "../dto/academic-profile.schema.js";

describe("academic profile input validation", () => {
  it("limits biography text to 500 words", () => {
    expect(UpdateAcademicProfileDetailsSchema.safeParse({ biography: Array.from({ length: 500 }, () => "word").join(" ") }).success).toBe(true);
    expect(UpdateAcademicProfileDetailsSchema.safeParse({ biography: Array.from({ length: 501 }, () => "word").join(" ") }).success).toBe(false);
  });

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

  it("accepts known and custom position titles while keeping classification server-controlled", () => {
    expect(UpdateAcademicProfileDetailsSchema.parse({ positionTitle: "PhD Candidate" })).not.toHaveProperty("positionCategory");
    expect(classifyAcademicPosition("PhD Candidate")).toEqual({ category: "STUDENT", source: "PREDEFINED" });
    expect(classifyAcademicPosition("Research Software Engineer")).toEqual({ category: "UNCLASSIFIED", source: "CUSTOM" });
  });

  it("validates position verification evidence references and methods", () => {
    expect(VerificationRequestSchema.safeParse({ type: "POSITION", evidenceType: "INSTITUTIONAL_PROFILE", reference: "https://university.example/staff/ada" }).success).toBe(true);
    expect(VerificationRequestSchema.safeParse({ type: "POSITION", evidenceType: "INSTITUTIONAL_PROFILE", reference: "http://university.example/staff/ada" }).success).toBe(true);
    expect(VerificationRequestSchema.safeParse({ type: "POSITION", evidenceType: "INSTITUTIONAL_PROFILE", reference: "javascript:alert(1)" }).success).toBe(false);
    expect(VerificationRequestSchema.safeParse({ type: "POSITION", evidenceType: "INSTITUTIONAL_PROFILE", reference: "https://user:pass@university.example/staff/ada" }).success).toBe(false);
    expect(VerificationRequestSchema.safeParse({ type: "POSITION", evidenceType: "DOCUMENT" }).success).toBe(true);
    expect(VerificationRequestSchema.safeParse({ evidenceType: "OTHER" }).success).toBe(false);
    expect(VerificationRequestSchema.parse({ evidenceType: "OTHER", reference: "Appointment letter" }).type).toBe("POSITION");
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

  it("validates flexible academic identity links without trusting status fields", () => {
    expect(CreateAcademicIdentityLinkSchema.safeParse({
      provider: "ORCID",
      identifier: "0000-0002-1825-0097",
      visibility: "PUBLIC",
    }).success).toBe(true);
    expect(CreateAcademicIdentityLinkSchema.safeParse({
      provider: "ORCID",
      profileUrl: "http://orcid.org/0000-0002-1825-0097",
      visibility: "PUBLIC",
    }).success).toBe(true);
    expect(CreateAcademicIdentityLinkSchema.safeParse({
      provider: "OPENALEX",
      profileUrl: "https://openalex.org/A123456789",
      visibility: "REGISTERED_USERS",
    }).success).toBe(true);
    expect(CreateAcademicIdentityLinkSchema.safeParse({
      provider: "GOOGLE_SCHOLAR",
      profileUrl: "https://scholar.google.com/citations?user=abc123",
      visibility: "PUBLIC",
    }).success).toBe(true);
    expect(CreateAcademicIdentityLinkSchema.safeParse({
      provider: "SEMANTIC_SCHOLAR",
      identifier: "123456789",
      visibility: "PRIVATE",
    }).success).toBe(true);
    expect(CreateAcademicIdentityLinkSchema.safeParse({
      provider: "OTHER",
      label: "University profile",
      profileUrl: "https://example.edu/researchers/ada",
    }).success).toBe(true);

    expect(CreateAcademicIdentityLinkSchema.safeParse({ provider: "ORCID", identifier: "0000-0002-1825-0098" }).success).toBe(false);
    expect(CreateAcademicIdentityLinkSchema.safeParse({ provider: "OPENALEX", identifier: "researcher-123" }).success).toBe(false);
    expect(CreateAcademicIdentityLinkSchema.safeParse({ provider: "GOOGLE_SCHOLAR", profileUrl: "https://example.com/citations?user=abc" }).success).toBe(false);
    expect(CreateAcademicIdentityLinkSchema.safeParse({ provider: "SEMANTIC_SCHOLAR", profileUrl: "https://semanticscholar.org/paper/123" }).success).toBe(false);
    expect(CreateAcademicIdentityLinkSchema.safeParse({ provider: "OTHER", profileUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(CreateAcademicIdentityLinkSchema.safeParse({ provider: "OTHER", profileUrl: "https://user:password@example.edu/profile" }).success).toBe(false);
    expect(CreateAcademicIdentityLinkSchema.safeParse({ provider: "OTHER", identifier: "javascript:alert(1)" }).success).toBe(false);
    expect(CreateAcademicIdentityLinkSchema.safeParse({ provider: "OTHER", label: "University profile", identifier: "https://example.edu/profile" }).success).toBe(true);
    expect(CreateAcademicIdentityLinkSchema.safeParse({ provider: "OTHER", identifier: "abc" }).success).toBe(false);
    expect(CreateAcademicIdentityLinkSchema.safeParse({ provider: "OTHER", profileUrl: "https://example.edu/profile", status: "CONNECTED" }).success).toBe(false);
    expect(CreateAcademicIdentityLinkSchema.safeParse({ provider: "OTHER", profileUrl: "https://example.edu/profile", connectionMethod: "OAUTH" }).success).toBe(false);
    expect(UpdateAcademicIdentityLinkSchema.safeParse({}).success).toBe(false);
    expect(AcademicIdentityLinkSchema.safeParse({ provider: "OTHER", label: "Profile", profileUrl: "http://example.edu/profile" }).success).toBe(true);
  });

  it("normalizes safe public handles and rejects reserved or deceptive paths", () => {
    expect(UpdatePublicHandleSchema.parse({ handle: "  NguyenDinhThanh-IT  " }).handle).toBe("nguyendinhthanh-it");
    expect(PublicHandleParamsSchema.parse({ handle: "  Lecturer.Nguyen  " }).handle).toBe("lecturer.nguyen");
    expect(UpdatePublicHandleSchema.safeParse({ handle: "lecturer.nguyen" }).success).toBe(false);
    for (const handle of ["admin", "search", "lecturers", "research-gaps", "a", "-thanh", ".thanh", "thanh-", "thanh.", "thanh--it", "thanh..it", "thanh/it", "thành-it"]) {
      expect(UpdatePublicHandleSchema.safeParse({ handle }).success).toBe(false);
    }
  });
});
