import mongoose from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindById: vi.fn(),
  profileFindOne: vi.fn(),
  profileFindOneAndUpdate: vi.fn(),
  audit: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("../../auth/models/user.model.js", () => ({ UserModel: { findById: mocks.userFindById } }));
vi.mock("../academic-profile.model.js", () => ({
  AcademicProfileModel: {
    findOne: mocks.profileFindOne,
    findOneAndUpdate: mocks.profileFindOneAndUpdate,
    updateOne: vi.fn(), countDocuments: vi.fn(), find: vi.fn(),
  },
}));
vi.mock("../../audit/audit.service.js", () => ({ auditService: { log: mocks.audit } }));
vi.mock("../../notifications/notification.service.js", () => ({ notificationService: { create: mocks.notify } }));

import { academicProfileService } from "../academic-profile.service.js";

const userId = new mongoose.Types.ObjectId().toString();
const adminId = new mongoose.Types.ObjectId().toString();
const profileId = new mongoose.Types.ObjectId().toString();
const now = new Date("2026-01-01T00:00:00.000Z");
const query = (value: unknown) => ({ select: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(value) });
const baseUser = { _id: new mongoose.Types.ObjectId(userId), fullName: "Dr Ada", role: "user", academicProfileType: "lecturer", institution: "Lumi University", researchInterests: ["AI"], isActive: true };
const baseProfile = { _id: new mongoose.Types.ObjectId(profileId), userId: new mongoose.Types.ObjectId(userId), department: "Computer Science", institutionalEmail: "ada@lumi.edu", expertiseAreas: [], skills: [], externalIdentities: [], supportAvailability: { enabled: false, types: [], preferredTopics: [] }, reviewAvailability: { enabled: false, types: [], preferredTopics: [] }, verificationStatus: "SELF_DECLARED", createdAt: now, updatedAt: now };

describe("academicProfileService", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.audit.mockResolvedValue(undefined); mocks.notify.mockResolvedValue(undefined); });

  it("does not treat a student as a verified lecturer", async () => {
    mocks.userFindById.mockReturnValue(query({ ...baseUser, academicProfileType: "student" }));
    mocks.profileFindOne.mockReturnValue(query({ verificationStatus: "VERIFIED" }));
    await expect(academicProfileService.isVerifiedLecturer(userId)).resolves.toBe(false);
  });

  it("does not treat a self-declared lecturer as verified", async () => {
    mocks.userFindById.mockReturnValue(query(baseUser));
    mocks.profileFindOne.mockReturnValue(query({ verificationStatus: "SELF_DECLARED" }));
    await expect(academicProfileService.isVerifiedLecturer(userId)).resolves.toBe(false);
  });

  it("allows a lecturer with institutional data to request verification and audits it", async () => {
    const profile = { ...baseProfile, save: vi.fn().mockResolvedValue(undefined), id: profileId, rejectionReason: undefined };
    mocks.userFindById
      .mockReturnValueOnce(query(baseUser))
      .mockReturnValueOnce(query(baseUser));
    mocks.profileFindOne
      .mockResolvedValueOnce(profile)
      .mockReturnValueOnce({ lean: vi.fn().mockResolvedValue({ ...baseProfile, verificationStatus: "PENDING", verificationRequestedAt: now }) });
    const result = await academicProfileService.requestVerification(userId);
    expect(profile.verificationStatus).toBe("PENDING");
    expect(profile.save).toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith("academic_profile.verification.requested", expect.any(Object));
    expect(result.verificationStatus).toBe("PENDING");
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
    mocks.userFindById.mockReturnValue(query(baseUser));
    mocks.profileFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(decided) });
    const input = decision === "approve" ? { decision } as const : { decision, reason: "Insufficient evidence" } as const;
    const result = await academicProfileService.decideVerification(profileId, input, adminId);
    expect(result.verificationStatus).toBe(decided.verificationStatus);
    expect(mocks.audit).toHaveBeenCalled();
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ targetKind: "academic_profile" }));
  });

  it("omits private verification fields from the public presenter", async () => {
    mocks.userFindById.mockReturnValue(query(baseUser));
    mocks.profileFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ ...baseProfile, verificationStatus: "REJECTED", verifiedBy: adminId, rejectionReason: "Private reason", verificationNote: "Private note" }) });
    const result = await academicProfileService.getPublic(userId);
    expect(result).not.toHaveProperty("institutionalEmail");
    expect(result).not.toHaveProperty("verifiedBy");
    expect(result).not.toHaveProperty("rejectionReason");
    expect(result).not.toHaveProperty("verificationNote");
  });
});
