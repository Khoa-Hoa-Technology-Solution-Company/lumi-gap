import mongoose from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  postCreate: vi.fn(), postFindOne: vi.fn(), postFindById: vi.fn(), postFindByIdAndUpdate: vi.fn(), postUpdateOne: vi.fn(),
  commentFindOne: vi.fn(), commentFindById: vi.fn(), commentFindByIdAndUpdate: vi.fn(),
  voteFindOneAndUpdate: vi.fn(), voteDeleteOne: vi.fn(), voteAggregate: vi.fn(),
  reportCreate: vi.fn(), moderator: vi.fn(), membership: vi.fn(), audit: vi.fn(), notify: vi.fn(),
}));

vi.mock("../forum.model.js", () => ({
  ForumPostModel: { create: mocks.postCreate, findById: mocks.postFindById, findByIdAndUpdate: mocks.postFindByIdAndUpdate, updateOne: mocks.postUpdateOne, findOne: mocks.postFindOne, find: vi.fn(), countDocuments: vi.fn() },
  ForumCommentModel: { findOne: mocks.commentFindOne, findById: mocks.commentFindById, findByIdAndUpdate: mocks.commentFindByIdAndUpdate, updateOne: vi.fn(), create: vi.fn(), find: vi.fn(), countDocuments: vi.fn() },
  ForumVoteModel: { findOneAndUpdate: mocks.voteFindOneAndUpdate, deleteOne: mocks.voteDeleteOne, aggregate: mocks.voteAggregate },
  ContentReportModel: { create: mocks.reportCreate, findById: vi.fn(), find: vi.fn() },
}));
vi.mock("../../communities/community.service.js", () => ({ getActiveCommunityMembership: mocks.membership, isCommunityModerator: mocks.moderator }));
vi.mock("../../communities/community.model.js", () => ({ CommunityModel: { findById: vi.fn(), distinct: vi.fn() }, CommunityMembershipModel: { distinct: vi.fn() } }));
vi.mock("../../papers/models/paper.model.js", () => ({ PaperModel: { exists: vi.fn(), find: vi.fn() } }));
vi.mock("../../gaps/models/research-gap.model.js", () => ({ ResearchGapModel: { exists: vi.fn() } }));
vi.mock("../../projects/models/project.model.js", () => ({ ProjectModel: { exists: vi.fn() } }));
vi.mock("../../academic-profiles/academic-profile.model.js", () => ({ AcademicProfileModel: { find: vi.fn() } }));
vi.mock("../../audit/audit.service.js", () => ({ auditService: { log: mocks.audit } }));
vi.mock("../../notifications/notification.service.js", () => ({ notificationService: { create: mocks.notify } }));

import { requireAuth } from "../../../common/middleware/auth.js";
import { forumService } from "../forum.service.js";

const userId = new mongoose.Types.ObjectId().toString();
const otherId = new mongoose.Types.ObjectId().toString();
const postId = new mongoose.Types.ObjectId().toString();
const commentId = new mongoose.Types.ObjectId().toString();
const communityId = new mongoose.Types.ObjectId().toString();
const query = (value: unknown) => ({ select: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(value) });

describe("forumService authorization and idempotency", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.audit.mockResolvedValue(undefined); mocks.notify.mockResolvedValue(undefined); });

  it("creates a post for an authenticated user", async () => {
    mocks.postCreate.mockResolvedValue({ id: postId });
    const result = await forumService.createPost({ type: "question", title: "A valid research question", content: "What evidence supports this?" }, userId);
    expect(result).toEqual({ id: postId });
    expect(mocks.postCreate).toHaveBeenCalledWith(expect.objectContaining({ authorId: userId, body: "What evidence supports this?" }));
  });

  it("rejects a guest at the authentication boundary", async () => {
    const next = vi.fn();
    await requireAuth({ headers: {} } as any, {} as any, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it("lets the owner edit a post and rejects a non-owner", async () => {
    mocks.postFindById.mockResolvedValue({ authorId: new mongoose.Types.ObjectId(userId), status: "active" });
    mocks.postFindByIdAndUpdate.mockResolvedValue({ id: postId, title: "Updated" });
    await expect(forumService.updatePost(postId, { title: "Updated" }, userId)).resolves.toMatchObject({ title: "Updated" });
    mocks.postFindById.mockResolvedValue({ authorId: new mongoose.Types.ObjectId(userId), status: "active" });
    await expect(forumService.updatePost(postId, { title: "Hijacked" }, otherId)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("allows only the question author to accept an answer", async () => {
    const post = { authorId: new mongoose.Types.ObjectId(userId), type: "question", status: "active", title: "Question", save: vi.fn(), acceptedCommentId: undefined };
    mocks.postFindById.mockResolvedValue(post);
    mocks.commentFindOne.mockReturnValue(query({ authorId: otherId }));
    await expect(forumService.acceptAnswer(postId, commentId, userId)).resolves.toBe(post);
    expect(post.acceptedCommentId?.toString()).toBe(commentId);
    mocks.postFindById.mockResolvedValue({ ...post, authorId: new mongoose.Types.ObjectId(userId) });
    await expect(forumService.acceptAnswer(postId, commentId, otherId)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("upserts one vote per user and recalculates the score", async () => {
    mocks.postFindOne.mockReturnValue(query({ communityId: undefined }));
    mocks.voteFindOneAndUpdate.mockResolvedValue({ value: 1 });
    mocks.voteAggregate.mockResolvedValue([{ score: 1 }]);
    mocks.postUpdateOne.mockResolvedValue({});
    const result = await forumService.vote("post", postId, 1, userId, "user");
    expect(mocks.voteFindOneAndUpdate).toHaveBeenCalledWith(
      { subjectKind: "post", subjectId: postId, userId }, expect.any(Object),
      expect.objectContaining({ upsert: true }),
    );
    expect(result.score).toBe(1);
  });

  it("creates a content report", async () => {
    mocks.postFindById.mockReturnValue(query({ communityId, status: "active" }));
    mocks.reportCreate.mockResolvedValue({ id: "report-1" });
    await expect(forumService.report("post", postId, { reason: "other" }, userId)).resolves.toEqual({ id: "report-1" });
  });

  it("scopes community moderators and still permits an admin globally", async () => {
    mocks.postFindById.mockReturnValue(query({ communityId }));
    mocks.moderator.mockResolvedValue(false);
    await expect(forumService.moderatePost(postId, "hidden", userId, "user")).rejects.toMatchObject({ statusCode: 403 });
    mocks.postFindById.mockReturnValue(query({ communityId }));
    mocks.postFindByIdAndUpdate.mockResolvedValue({ id: postId, status: "hidden" });
    await expect(forumService.moderatePost(postId, "hidden", userId, "admin")).resolves.toMatchObject({ status: "hidden" });
  });
});
