import mongoose from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  communityFind: vi.fn(),
  communityFindOne: vi.fn(),
  communityCount: vi.fn(),
  communityUpdateOne: vi.fn(),
  membershipFind: vi.fn(),
  membershipFindOne: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("../community.model.js", () => ({
  CommunityModel: {
    find: mocks.communityFind,
    findOne: mocks.communityFindOne,
    countDocuments: mocks.communityCount,
    updateOne: mocks.communityUpdateOne,
  },
  CommunityMembershipModel: {
    find: mocks.membershipFind,
    findOne: mocks.membershipFindOne,
  },
}));
vi.mock("../../audit/audit.service.js", () => ({ auditService: { log: mocks.audit } }));

import { communityService } from "../community.service.js";

function listQuery(value: unknown) {
  return {
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(value),
  };
}

function oneQuery(value: unknown) {
  return { select: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(value) };
}

describe("community service access and membership presentation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.audit.mockResolvedValue(undefined);
    mocks.communityUpdateOne.mockResolvedValue({ modifiedCount: 1 });
  });

  it("lists private communities as discoverable metadata and includes viewer membership", async () => {
    const communityId = new mongoose.Types.ObjectId();
    mocks.communityFind.mockReturnValue(listQuery([{ _id: communityId, name: "Private Lab", slug: "private-lab", visibility: "private", rules: [], researchTopics: [], memberCount: 2 }]));
    mocks.communityCount.mockResolvedValue(1);
    mocks.membershipFind.mockReturnValue(listQuery([{ communityId, role: "member", status: "pending" }]));

    const result = await communityService.list(new mongoose.Types.ObjectId().toString(), 1, 20, "user");

    expect(result.data[0]).toMatchObject({
      id: communityId.toString(),
      viewerMembership: { role: "member", status: "pending" },
      contentRestricted: true,
      canManage: false,
    });
    expect(result.data[0]).not.toHaveProperty("ownerId");
  });

  it("returns private community metadata to a visitor without exposing its discussions", async () => {
    const communityId = new mongoose.Types.ObjectId();
    mocks.communityFindOne.mockReturnValue(oneQuery({ _id: communityId, name: "Review Circle", slug: "review-circle", visibility: "private", rules: ["Keep manuscripts confidential"], researchTopics: [], memberCount: 1 }));

    const result = await communityService.get("review-circle");

    expect(result).toMatchObject({ id: communityId.toString(), contentRestricted: true, rules: ["Keep manuscripts confidential"] });
  });

  it("allows an owner to promote a member to moderator", async () => {
    const target = { role: "member", status: "active", save: vi.fn().mockResolvedValue(undefined), id: "membership-id" };
    mocks.membershipFindOne
      .mockReturnValueOnce(oneQuery({ role: "owner", status: "active" }))
      .mockResolvedValueOnce(target);

    await communityService.updateMember(
      new mongoose.Types.ObjectId().toString(),
      new mongoose.Types.ObjectId().toString(),
      { role: "moderator" },
      new mongoose.Types.ObjectId().toString(),
      "user",
    );

    expect(target.role).toBe("moderator");
    expect(target.save).toHaveBeenCalled();
  });

  it("prevents a moderator from changing another moderator", async () => {
    const target = { role: "moderator", status: "active", save: vi.fn(), id: "membership-id" };
    mocks.membershipFindOne
      .mockReturnValueOnce(oneQuery({ role: "moderator", status: "active" }))
      .mockResolvedValueOnce(target);

    await expect(communityService.updateMember(
      new mongoose.Types.ObjectId().toString(),
      new mongoose.Types.ObjectId().toString(),
      { status: "banned" },
      new mongoose.Types.ObjectId().toString(),
      "user",
    )).rejects.toMatchObject({ statusCode: 403 });
    expect(target.save).not.toHaveBeenCalled();
  });
});
