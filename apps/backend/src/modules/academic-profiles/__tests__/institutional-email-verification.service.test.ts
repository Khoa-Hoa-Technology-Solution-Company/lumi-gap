import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  profileFindOne: vi.fn(),
  profileFindOneAndUpdate: vi.fn(),
  challengeFindOneAndUpdate: vi.fn(),
  challengeUpdateOne: vi.fn(),
  challengeUpdateMany: vi.fn(),
  institutionFindOne: vi.fn(),
  sendCode: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("../academic-profile.model.js", () => ({ AcademicProfileModel: {
  findOne: mocks.profileFindOne,
  findOneAndUpdate: mocks.profileFindOneAndUpdate,
} }));
vi.mock("../academic-email-verification.model.js", () => ({ AcademicEmailVerificationChallengeModel: {
  findOneAndUpdate: mocks.challengeFindOneAndUpdate,
  updateOne: mocks.challengeUpdateOne,
  updateMany: mocks.challengeUpdateMany,
} }));
vi.mock("../trusted-institution.model.js", () => ({ TrustedInstitutionModel: { findOne: mocks.institutionFindOne } }));
vi.mock("../academic-email.service.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../academic-email.service.js")>();
  return { ...original, academicEmailDelivery: { sendVerificationCode: mocks.sendCode } };
});
vi.mock("../../audit/audit.service.js", () => ({ auditService: { log: mocks.audit } }));

import { institutionalEmailVerificationService } from "../institutional-email-verification.service.js";

const userId = "66f28c765111111111111111";
const email = "lecturer@fpt.edu.vn";
const profileQuery = (value: unknown) => ({ select: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(value) });
const institutionQuery = (value: unknown) => ({ lean: vi.fn().mockResolvedValue(value) });
const profile = { affiliation: { institutionalEmail: email } };
const institution = { _id: "66f28c765222222222222222", name: "FPT University" };

describe("institutionalEmailVerificationService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.profileFindOne.mockReturnValue(profileQuery(profile));
    mocks.institutionFindOne.mockReturnValue(institutionQuery(institution));
    mocks.challengeFindOneAndUpdate.mockResolvedValue({ id: "challenge-1" });
    mocks.challengeUpdateOne.mockResolvedValue({ modifiedCount: 1 });
    mocks.challengeUpdateMany.mockResolvedValue({ modifiedCount: 1 });
    mocks.profileFindOneAndUpdate.mockResolvedValue({ id: "profile-1" });
    mocks.sendCode.mockResolvedValue(undefined);
    mocks.audit.mockResolvedValue(undefined);
  });

  it("stores only an HMAC hash and never returns the OTP", async () => {
    const result = await institutionalEmailVerificationService.requestChallenge(userId);
    const deliveredCode = mocks.sendCode.mock.calls[0]?.[0].code as string;
    const storedUpdate = mocks.challengeFindOneAndUpdate.mock.calls[0]?.[1];

    expect(deliveredCode).toMatch(/^\d{6}$/);
    expect(storedUpdate.$set.codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(storedUpdate.$set.codeHash).not.toBe(deliveredCode);
    expect(result).not.toHaveProperty("code");
    expect(result.email).toContain("***@fpt.edu.vn");
  });

  it("rejects domains that are not explicitly registered", async () => {
    mocks.institutionFindOne.mockReturnValue(institutionQuery(null));
    await expect(institutionalEmailVerificationService.requestChallenge(userId))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.sendCode).not.toHaveBeenCalled();
  });

  it("atomically consumes a matching, unexpired, under-limit challenge", async () => {
    mocks.profileFindOne
      .mockReturnValueOnce(profileQuery(profile))
      .mockReturnValueOnce(profileQuery({ affiliation: { ...profile.affiliation, institutionalEmailVerifiedAt: new Date() } }));

    const result = await institutionalEmailVerificationService.verifyChallenge(userId, "123456");
    const filter = mocks.challengeFindOneAndUpdate.mock.calls[0]?.[0];
    const update = mocks.challengeFindOneAndUpdate.mock.calls[0]?.[1];

    expect(filter).toEqual(expect.objectContaining({
      userId,
      email,
      consumedAt: { $exists: false },
      expiresAt: { $gt: expect.any(Date) },
      $expr: { $lt: ["$attempts", "$maxAttempts"] },
    }));
    expect(update).toEqual({ $set: { consumedAt: expect.any(Date) } });
    expect(result.verified).toBe(true);
  });

  it("increments attempts for an invalid or expired code without consuming it", async () => {
    mocks.challengeFindOneAndUpdate.mockResolvedValue(null);
    await expect(institutionalEmailVerificationService.verifyChallenge(userId, "000000"))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.challengeUpdateOne).toHaveBeenCalledWith(
      expect.objectContaining({ expiresAt: { $gt: expect.any(Date) }, $expr: { $lt: ["$attempts", "$maxAttempts"] } }),
      { $inc: { attempts: 1 } },
    );
    expect(mocks.profileFindOneAndUpdate).not.toHaveBeenCalled();
  });
});
