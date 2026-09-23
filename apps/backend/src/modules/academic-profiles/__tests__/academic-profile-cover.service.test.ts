import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindById: vi.fn(),
  profileFindOneAndUpdate: vi.fn(),
  profileFindOne: vi.fn(),
  normalize: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  publicLocation: vi.fn(),
  getMine: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("../../auth/models/user.model.js", () => ({ UserModel: { findById: mocks.userFindById } }));
vi.mock("../academic-profile.model.js", () => ({ AcademicProfileModel: {
  findOneAndUpdate: mocks.profileFindOneAndUpdate,
  findOne: mocks.profileFindOne,
} }));
vi.mock("../profile-cover-storage.service.js", () => ({
  normalizeProfileCover: mocks.normalize,
  profileCoverStorage: { save: mocks.save, remove: mocks.remove, publicLocation: mocks.publicLocation },
}));
vi.mock("../academic-profile.service.js", () => ({ academicProfileService: { getMine: mocks.getMine } }));
vi.mock("../../audit/audit.service.js", () => ({ auditService: { log: mocks.audit } }));

import { academicProfileCoverService } from "../academic-profile-cover.service.js";

const userId = "66f28c765111111111111111";
const query = (value: unknown) => ({ select: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(value) });

describe("academic profile cover ownership", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.userFindById.mockReturnValue(query({ academicProfileType: "lecturer", role: "user", isActive: true }));
    mocks.normalize.mockResolvedValue(Buffer.from("normalized"));
    mocks.save.mockResolvedValue("profile-covers/66f28c765111111111111111/new.webp");
    mocks.remove.mockResolvedValue(undefined);
    mocks.getMine.mockResolvedValue({ userId, coverUrl: `/academic-profiles/${userId}/cover?v=1` });
    mocks.audit.mockResolvedValue(undefined);
  });

  it("replaces the owner's cover and removes only the previous stored object", async () => {
    mocks.profileFindOneAndUpdate.mockResolvedValue({ coverStorageKey: "profile-covers/66f28c765111111111111111/old.webp" });

    const result = await academicProfileCoverService.upload(userId, Buffer.from("input"));

    expect(mocks.normalize).toHaveBeenCalled();
    expect(mocks.profileFindOneAndUpdate).toHaveBeenCalledWith(
      { userId },
      expect.objectContaining({ $set: expect.objectContaining({ coverStorageKey: expect.any(String) }) }),
      expect.objectContaining({ upsert: true, new: false }),
    );
    expect(mocks.remove).toHaveBeenCalledWith("profile-covers/66f28c765111111111111111/old.webp");
    expect(result).toHaveProperty("coverUrl");
  });

  it("rejects a nonacademic account before processing or saving an image", async () => {
    mocks.userFindById.mockReturnValue(query({ role: "admin", isActive: true }));
    await expect(academicProfileCoverService.upload(userId, Buffer.from("input")))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("does not expose a cover for an inactive account", async () => {
    mocks.userFindById.mockReturnValue(query({ academicProfileType: "student", isActive: false }));
    await expect(academicProfileCoverService.publicLocation(userId))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(mocks.profileFindOne).not.toHaveBeenCalled();
  });

  it("does not expose a private cover to another viewer", async () => {
    mocks.profileFindOne.mockReturnValue(query({
      coverStorageKey: "profile-covers/66f28c765111111111111111/private.webp",
      profileVisibility: "PRIVATE",
    }));

    await expect(academicProfileCoverService.publicLocation(userId, "66f28c765222222222222222"))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(mocks.publicLocation).not.toHaveBeenCalled();
  });
});
