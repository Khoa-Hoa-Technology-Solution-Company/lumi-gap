import mongoose from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindById: vi.fn(),
  userFind: vi.fn(),
  profileFindOne: vi.fn(),
  profileFindById: vi.fn(),
  profileFindOneAndUpdate: vi.fn(),
  profileUpdateOne: vi.fn(),
  profileFind: vi.fn(),
  profileCount: vi.fn(),
  paperFind: vi.fn(),
  paperCount: vi.fn(),
  audit: vi.fn(),
  notify: vi.fn(),
  trustedInstitutionFindOne: vi.fn(),
  invalidateEmailChallenges: vi.fn(),
  handleFindOne: vi.fn(),
  handleFindOneAndUpdate: vi.fn(),
  handleInit: vi.fn(),
  handleCount: vi.fn(),
}));

vi.mock("../../auth/models/user.model.js", () => ({
  UserModel: { findById: mocks.userFindById, find: mocks.userFind },
}));
vi.mock("../academic-profile.model.js", () => ({
  AcademicProfileModel: {
    findOne: mocks.profileFindOne,
    findById: mocks.profileFindById,
    findOneAndUpdate: mocks.profileFindOneAndUpdate,
    updateOne: mocks.profileUpdateOne,
    countDocuments: mocks.profileCount,
    find: mocks.profileFind,
  },
}));
vi.mock("../academic-profile-handle.model.js", () => ({
  AcademicProfileHandleModel: {
    findOne: mocks.handleFindOne,
    findOneAndUpdate: mocks.handleFindOneAndUpdate,
    init: mocks.handleInit,
    countDocuments: mocks.handleCount,
  },
}));
vi.mock("../../papers/models/paper.model.js", () => ({
  PaperModel: { find: mocks.paperFind, countDocuments: mocks.paperCount },
}));
vi.mock("../../audit/audit.service.js", () => ({ auditService: { log: mocks.audit } }));
vi.mock("../../notifications/notification.service.js", () => ({ notificationService: { create: mocks.notify } }));
vi.mock("../trusted-institution.model.js", () => ({
  TrustedInstitutionModel: { findOne: mocks.trustedInstitutionFindOne },
}));
vi.mock("../institutional-email-verification.service.js", () => ({
  institutionalEmailVerificationService: { invalidate: mocks.invalidateEmailChallenges },
}));

import { academicProfileService } from "../academic-profile.service.js";

const userId = new mongoose.Types.ObjectId().toString();
const otherUserId = new mongoose.Types.ObjectId().toString();
const adminId = new mongoose.Types.ObjectId().toString();
const profileId = new mongoose.Types.ObjectId().toString();
const paperId = new mongoose.Types.ObjectId().toString();
const now = new Date("2026-01-01T00:00:00.000Z");
const query = (value: unknown) => ({ select: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(value) });
const paperQuery = (value: unknown) => ({ select: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(value) });
const baseUser = {
  _id: new mongoose.Types.ObjectId(userId),
  fullName: "Dr Ada",
  avatarUrl: "https://example.test/ada.png",
  role: "user",
  academicProfileType: "lecturer",
  institution: "Lumi University",
  researchInterests: ["AI"],
  points: 175,
  isActive: true,
};
const baseProfile = {
  _id: new mongoose.Types.ObjectId(profileId),
  userId: new mongoose.Types.ObjectId(userId),
  affiliation: { department: "Computer Science", institutionalEmail: "ada@lumi.edu", institutionalEmailVerifiedAt: now },
  expertiseAreas: [],
  skills: [],
  researchKeywords: [],
  externalIdentities: [],
  featuredWorks: [],
  supportAvailability: { enabled: false, types: [], preferredTopics: [] },
  reviewAvailability: { enabled: false, types: [], preferredTopics: [] },
  profileVisibility: "PUBLIC",
  verificationStatus: "SELF_DECLARED",
  verificationEvidence: [{ type: "INSTITUTIONAL_EMAIL", value: "ada@lumi.edu", status: "VALIDATED", source: "SYSTEM", createdAt: now, validatedAt: now }],
  createdAt: now,
  updatedAt: now,
};

function mockPresentation(profile: Record<string, unknown> = baseProfile, user = baseUser) {
  mocks.userFindById.mockReturnValueOnce(query(user));
  mocks.profileFindOne.mockReturnValueOnce(query(profile));
  mocks.paperFind.mockReturnValueOnce(paperQuery([]));
}

describe("academicProfileService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.audit.mockResolvedValue(undefined);
    mocks.notify.mockResolvedValue(undefined);
    mocks.invalidateEmailChallenges.mockResolvedValue(undefined);
    mocks.trustedInstitutionFindOne.mockReturnValue(query(null));
    mocks.profileUpdateOne.mockResolvedValue({ acknowledged: true });
    mocks.paperCount.mockResolvedValue(0);
    mocks.handleInit.mockResolvedValue(undefined);
    mocks.handleFindOne.mockReturnValue(query(null));
    mocks.handleCount.mockResolvedValue(0);
  });

  it("handles a legacy lecturer without an AcademicProfile as SELF_DECLARED", async () => {
    mocks.userFindById.mockReturnValue(query({ ...baseUser, role: "lecturer", academicProfileType: undefined }));
    mocks.profileFindOne.mockReturnValue(query(null));
    mocks.paperFind.mockReturnValue(paperQuery([]));

    const result = await academicProfileService.getMine(userId);

    expect(mocks.profileUpdateOne).toHaveBeenCalledWith(
      { userId },
      { $setOnInsert: { userId, verificationStatus: "SELF_DECLARED" } },
      { upsert: true },
    );
    expect(result.verificationStatus).toBe("SELF_DECLARED");
  });

  it("updates only the authenticated user's profile and keeps manual ORCID unverified", async () => {
    const hydratedUser = { ...baseUser, save: vi.fn().mockResolvedValue(undefined) };
    mocks.userFindById.mockResolvedValueOnce(hydratedUser);
    mocks.profileFindOne.mockReturnValueOnce(query(baseProfile));
    mocks.profileFindOneAndUpdate.mockResolvedValue({ ...baseProfile });
    mockPresentation({
      ...baseProfile,
      externalIdentities: [{
        provider: "ORCID",
        externalId: "0000-0002-1825-0097",
        status: "UNVERIFIED",
        source: "SELF_ASSERTED",
      }],
    });

    const result = await academicProfileService.updateMine(userId, {
      headline: "Empirical software researcher",
      externalIdentities: [{ provider: "ORCID", externalId: "0000-0002-1825-0097" }],
    });

    expect(mocks.profileFindOneAndUpdate).toHaveBeenCalledWith(
      { userId },
      expect.objectContaining({
        $set: expect.objectContaining({
          externalIdentities: [expect.objectContaining({ status: "UNVERIFIED", source: "SELF_ASSERTED" })],
        }),
      }),
      expect.any(Object),
    );
    expect(mocks.profileFindOneAndUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ userId: otherUserId }), expect.anything(), expect.anything());
    expect(result.externalIdentities[0]?.status).toBe("UNVERIFIED");
  });

  it("preserves provider-verified provenance only when the identity value is unchanged", async () => {
    const linkedAt = new Date("2026-01-02T00:00:00.000Z");
    const verifiedAt = new Date("2026-01-03T00:00:00.000Z");
    const oauthProfile = {
      ...baseProfile,
      externalIdentities: [{
        provider: "ORCID",
        externalId: "0000-0002-1825-0097",
        status: "VERIFIED",
        source: "OAUTH",
        linkedAt,
        verifiedAt,
      }],
    };
    const hydratedUser = { ...baseUser, save: vi.fn().mockResolvedValue(undefined) };
    mocks.userFindById.mockResolvedValueOnce(hydratedUser);
    mocks.profileFindOne.mockReturnValueOnce(query(oauthProfile));
    mocks.profileFindOneAndUpdate.mockResolvedValue(oauthProfile);
    mockPresentation(oauthProfile);

    await academicProfileService.updateMine(userId, {
      externalIdentities: [{ provider: "ORCID", externalId: "0000-0002-1825-0097" }],
    });

    expect(mocks.profileFindOneAndUpdate).toHaveBeenCalledWith(
      { userId },
      expect.objectContaining({ $set: expect.objectContaining({
        externalIdentities: [expect.objectContaining({ status: "VERIFIED", source: "OAUTH", linkedAt, verifiedAt })],
      }) }),
      expect.any(Object),
    );
  });

  it("invalidates email verification and active challenges when the email changes", async () => {
    const hydratedUser = { ...baseUser, save: vi.fn().mockResolvedValue(undefined) };
    mocks.userFindById.mockResolvedValueOnce(hydratedUser);
    mocks.profileFindOne.mockReturnValueOnce(query(baseProfile));
    mocks.profileFindOneAndUpdate.mockResolvedValue(baseProfile);
    mockPresentation({
      ...baseProfile,
      affiliation: { ...baseProfile.affiliation, institutionalEmail: "new@fpt.edu.vn", institutionalEmailVerifiedAt: undefined },
      verificationEvidence: [],
    });

    await academicProfileService.updateMine(userId, {
      affiliation: { institutionalEmail: "new@fpt.edu.vn" },
    });

    expect(mocks.profileFindOneAndUpdate).toHaveBeenCalledWith(
      { userId },
      expect.objectContaining({ $set: expect.objectContaining({
        "affiliation.institutionalEmail": "new@fpt.edu.vn",
        "affiliation.institutionalEmailVerifiedAt": null,
        verificationEvidence: [],
      }) }),
      expect.any(Object),
    );
    expect(mocks.invalidateEmailChallenges).toHaveBeenCalledWith(userId);
  });

  it("allows an inline section to clear optional fields without reviving legacy values", async () => {
    const hydratedUser = { ...baseUser, save: vi.fn().mockResolvedValue(undefined) };
    mocks.userFindById.mockResolvedValueOnce(hydratedUser);
    mocks.profileFindOne.mockReturnValueOnce(query({ ...baseProfile, bio: "Old biography", department: "Old department" }));
    mocks.profileFindOneAndUpdate.mockResolvedValue(baseProfile);
    mockPresentation({ ...baseProfile, biography: null, bio: null, department: null, academicTitle: null });

    await academicProfileService.updateMine(userId, {
      biography: "",
      academicTitle: null,
      affiliation: { department: "" },
    });

    expect(mocks.profileFindOneAndUpdate).toHaveBeenCalledWith(
      { userId },
      expect.objectContaining({ $set: expect.objectContaining({
        biography: null,
        bio: null,
        academicTitle: null,
        "affiliation.department": null,
        department: null,
      }) }),
      expect.any(Object),
    );
  });

  it("resolves canonical metadata for a featured LumiGap paper", async () => {
    mocks.userFindById.mockReturnValue(query(baseUser));
    mocks.profileFindOne.mockReturnValue(query({
      ...baseProfile,
      featuredWorks: [{ paperId: new mongoose.Types.ObjectId(paperId), source: "LUMIGAP" }],
    }));
    mocks.paperFind.mockReturnValue(paperQuery([{
      _id: new mongoose.Types.ObjectId(paperId),
      title: "Canonical title",
      publicationYear: 2025,
      externalIds: { doi: "10.1000/example" },
    }]));

    const result = await academicProfileService.getPublic(userId);

    expect(result.featuredWorks[0]).toEqual(expect.objectContaining({
      paperId,
      title: "Canonical title",
      canonical: true,
      source: "LUMIGAP",
    }));
  });

  it("claims a public URL for the owner and keeps it separate from Lecturer verification", async () => {
    mockPresentation(baseProfile);
    mocks.handleFindOneAndUpdate.mockResolvedValue({ handle: "ada-software", userId });
    mocks.profileFindOneAndUpdate.mockResolvedValue({ ...baseProfile, publicHandle: "ada-software" });
    mockPresentation({ ...baseProfile, publicHandle: "ada-software" });

    const result = await academicProfileService.setPublicHandle(userId, "ada-software");

    expect(mocks.handleFindOneAndUpdate).toHaveBeenCalledWith(
      { handle: "ada-software" },
      { $setOnInsert: { handle: "ada-software", userId } },
      expect.objectContaining({ upsert: true }),
    );
    expect(result.publicHandle).toBe("ada-software");
    expect(result.verificationStatus).toBe("SELF_DECLARED");
  });

  it("rejects a public URL already claimed by another user", async () => {
    mockPresentation(baseProfile);
    mocks.handleFindOneAndUpdate.mockResolvedValue({ handle: "ada-software", userId: otherUserId });

    await expect(academicProfileService.setPublicHandle(userId, "ada-software"))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(mocks.profileFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("stops one account from claiming unlimited old public URLs", async () => {
    mockPresentation(baseProfile);
    mocks.handleCount.mockResolvedValue(20);

    await expect(academicProfileService.setPublicHandle(userId, "another-handle"))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(mocks.handleFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("resolves an old URL to the user's current public profile", async () => {
    mocks.handleFindOne.mockReturnValue(query({ handle: "ada-old", userId }));
    mockPresentation({ ...baseProfile, publicHandle: "ada-new" });

    const result = await academicProfileService.getPublicByHandle("ada-old");

    expect(result.publicHandle).toBe("ada-new");
    expect(result.affiliation).not.toHaveProperty("institutionalEmail");
  });

  it("atomically submits lecturer verification and audits evidence types", async () => {
    mocks.userFindById.mockReturnValueOnce(query(baseUser));
    mocks.profileFindOne.mockReturnValueOnce(query(baseProfile));
    mocks.profileFindOneAndUpdate.mockResolvedValue({ ...baseProfile, id: profileId, verificationStatus: "PENDING" });
    mockPresentation({ ...baseProfile, verificationStatus: "PENDING", verificationRequestedAt: now });

    const result = await academicProfileService.requestVerification(userId);

    expect(mocks.profileFindOneAndUpdate).toHaveBeenCalledWith(
      { userId, verificationStatus: { $nin: ["PENDING", "VERIFIED"] } },
      expect.objectContaining({ $set: expect.objectContaining({ verificationStatus: "PENDING" }) }),
      expect.any(Object),
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      "academic_profile.verification.requested",
      expect.objectContaining({ details: expect.objectContaining({ evidenceTypes: ["INSTITUTIONAL_EMAIL"] }) }),
    );
    expect(result.verificationStatus).toBe("PENDING");
  });

  it("does not allow a non-Lecturer to request Lecturer verification", async () => {
    mocks.userFindById.mockReturnValueOnce(query({ ...baseUser, academicProfileType: "student" }));
    await expect(academicProfileService.requestVerification(userId)).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.profileFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("prevents a lecturer from approving their own request", async () => {
    mocks.profileFindOneAndUpdate.mockResolvedValue(null);
    await expect(academicProfileService.decideVerification(profileId, { decision: "approve" }, userId))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(mocks.profileFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ userId: { $ne: userId }, verificationStatus: "PENDING" }),
      expect.any(Object), expect.any(Object),
    );
  });

  it.each(["approve", "reject"] as const)("allows an admin to %s a pending request", async (decision) => {
    const decided = { ...baseProfile, id: profileId, verificationStatus: decision === "approve" ? "VERIFIED" : "REJECTED" };
    mocks.profileFindOneAndUpdate.mockResolvedValue(decided);
    mockPresentation(decided);
    const input = decision === "approve"
      ? { decision, method: "ADMIN_REVIEW" } as const
      : { decision, reason: "Insufficient evidence" } as const;

    const result = await academicProfileService.decideVerification(profileId, input, adminId);

    expect(result.verificationStatus).toBe(decided.verificationStatus);
    expect(mocks.audit).toHaveBeenCalledWith(
      `academic_profile.verification.${decision}d`,
      expect.objectContaining({ details: { decision, targetUserId: userId } }),
    );
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ targetKind: "academic_profile" }));
  });

  it("omits all private verification and institutional-email fields publicly", async () => {
    mockPresentation({
      ...baseProfile,
      coverStorageKey: `profile-covers/${userId}/550e8400-e29b-41d4-a716-446655440000.webp`,
      coverUpdatedAt: now,
      verificationStatus: "REJECTED",
      verifiedBy: adminId,
      rejectedBy: adminId,
      rejectionReason: "Private reason",
      verificationNote: "Private note",
      verificationEvidence: [{ type: "INSTITUTIONAL_EMAIL", value: "ada@lumi.edu", status: "REJECTED", source: "USER", createdAt: now }],
    });

    const result = await academicProfileService.getPublic(userId);

    expect(result).not.toHaveProperty("id");
    expect(result).not.toHaveProperty("institutionalEmail");
    expect(result.affiliation).not.toHaveProperty("institutionalEmail");
    expect(result).not.toHaveProperty("verification");
    expect(result).not.toHaveProperty("verificationEvidence");
    expect(result).not.toHaveProperty("coverStorageKey");
    expect(result.coverUrl).toMatch(new RegExp(`/academic-profiles/${userId}/cover`));
    expect(result.points).toBe(175);
  });

  it("enforces profile visibility on the server", async () => {
    mockPresentation({ ...baseProfile, profileVisibility: "PRIVATE" });
    await expect(academicProfileService.getPublic(userId))
      .rejects.toMatchObject({ statusCode: 404 });

    mockPresentation({ ...baseProfile, profileVisibility: "PRIVATE" });
    await expect(academicProfileService.getPublic(userId, userId))
      .resolves.toMatchObject({ userId, profileVisibility: "PRIVATE" });
  });

  it("does not expose private reviewer workload preferences publicly", async () => {
    mockPresentation({
      ...baseProfile,
      reviewAvailability: {
        enabled: true,
        types: ["RESEARCH_PAPER"],
        preferredTopics: ["AI"],
        acceptedFields: ["Software Engineering"],
        maximumActiveReviews: 2,
        preferredReviewWorkload: "Light",
        temporarilyUnavailableUntil: new Date("2025-01-01T00:00:00.000Z"),
        autoRecommendationEnabled: true,
      },
    });

    const result = await academicProfileService.getPublic(userId);

    expect(result.reviewAvailability).toMatchObject({
      enabled: true,
      types: ["RESEARCH_PAPER"],
      acceptedFields: ["Software Engineering"],
    });
    expect(result.reviewAvailability).not.toHaveProperty("maximumActiveReviews");
    expect(result.reviewAvailability).not.toHaveProperty("preferredReviewWorkload");
    expect(result.reviewAvailability).not.toHaveProperty("temporarilyUnavailableUntil");
    expect(result.reviewAvailability).not.toHaveProperty("autoRecommendationEnabled");
  });

  it("returns verified badge data only after an actual VERIFIED state", async () => {
    mocks.userFindById.mockReturnValueOnce(query(baseUser));
    mocks.profileFindOne.mockReturnValueOnce(query({ verificationStatus: "SELF_DECLARED" }));
    await expect(academicProfileService.isVerifiedLecturer(userId)).resolves.toBe(false);

    mocks.userFindById.mockReturnValueOnce(query(baseUser));
    mocks.profileFindOne.mockReturnValueOnce(query({ verificationStatus: "VERIFIED" }));
    await expect(academicProfileService.isVerifiedLecturer(userId)).resolves.toBe(true);
  });

  it("never treats a student as a verified lecturer", async () => {
    mocks.userFindById.mockReturnValueOnce(query({ ...baseUser, academicProfileType: "student" }));
    mocks.profileFindOne.mockReturnValueOnce(query({ verificationStatus: "VERIFIED" }));
    await expect(academicProfileService.isVerifiedLecturer(userId)).resolves.toBe(false);
  });
});
