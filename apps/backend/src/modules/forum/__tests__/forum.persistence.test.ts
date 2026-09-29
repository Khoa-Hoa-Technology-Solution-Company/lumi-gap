import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { communityService } from "../../communities/community.service.js";
import { forumService } from "../forum.service.js";

describe.sequential("research forum persistence and authorization", () => {
  const marker = crypto.randomUUID();
  const emails = {
    admin: `forum-admin-${marker}@example.test`,
    author: `forum-author-${marker}@example.test`,
    responder: `forum-responder-${marker}@example.test`,
    outsider: `forum-outsider-${marker}@example.test`,
  };
  let adminId = ""; let authorId = ""; let responderId = ""; let outsiderId = "";
  let communityId = ""; let paperId = ""; let gapId = ""; let publicProjectId = ""; let privateProjectId = "";
  const postIds: string[] = [];

  beforeAll(async () => {
    const prisma = getPrisma();
    const [admin, author, responder, outsider, paper] = await Promise.all([
      prisma.user.create({ data: { email: emails.admin, fullName: "Forum Admin", role: "admin", systemRole: "ADMIN" } }),
      prisma.user.create({ data: { email: emails.author, fullName: "Question Author" } }),
      prisma.user.create({ data: { email: emails.responder, fullName: "Evidence Responder" } }),
      prisma.user.create({ data: { email: emails.outsider, fullName: "Forum Outsider" } }),
      prisma.paper.create({ data: { title: `Forum paper ${marker}`, publicationYear: 2026, primaryProvider: "user", paperStatus: "downloaded", dataStatus: "active" } }),
    ]);
    adminId = admin.id; authorId = author.id; responderId = responder.id; outsiderId = outsider.id; paperId = paper.id;
    const [publicProject, privateProject, gap] = await Promise.all([
      prisma.project.create({ data: { title: `Public project ${marker}`, ownerId: author.id, visibility: "PUBLIC_SUMMARY" } }),
      prisma.project.create({ data: { title: `Private project ${marker}`, ownerId: author.id, visibility: "PRIVATE" } }),
      prisma.researchGap.create({ data: { topic: "Forum testing", normalizedTopic: `forum-testing-${marker}`, title: `Shareable gap ${marker}`, description: "Candidate gap", rationale: "Test evidence", source: "user", userId: author.id, forumShareable: true } }),
    ]);
    publicProjectId = publicProject.id; privateProjectId = privateProject.id; gapId = gap.id;
  });

  afterAll(async () => {
    const prisma = getPrisma();
    const commentIds = postIds.length
      ? (await prisma.forumComment.findMany({ where: { postId: { in: postIds } }, select: { id: true } })).map((comment) => comment.id)
      : [];
    await prisma.forumModerationAction.deleteMany({ where: { actorId: { in: [adminId, authorId, responderId, outsiderId].filter(Boolean) } } });
    if (postIds.length) {
      await prisma.contentReport.deleteMany({ where: { OR: [{ postId: { in: postIds } }, { commentId: { in: commentIds } }] } });
      await prisma.forumVote.deleteMany({ where: { OR: [{ postId: { in: postIds } }, { commentId: { in: commentIds } }] } });
      await prisma.forumReference.deleteMany({ where: { OR: [{ postId: { in: postIds } }, { commentId: { in: commentIds } }] } });
      await prisma.forumThreadFollow.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.forumPostTag.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.forumPostGap.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.forumPostProject.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.forumPostPaper.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.forumComment.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.forumPost.deleteMany({ where: { id: { in: postIds } } });
    }
    if (communityId) {
      await prisma.communityMembership.deleteMany({ where: { communityId } });
      await prisma.community.deleteMany({ where: { id: communityId } });
    }
    if (gapId) await prisma.researchGap.deleteMany({ where: { id: gapId } });
    await prisma.project.deleteMany({ where: { id: { in: [publicProjectId, privateProjectId].filter(Boolean) } } });
    if (paperId) await prisma.paper.deleteMany({ where: { id: paperId } });
    await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } });
  });

  it("restricts community creation to admins and persists idempotent membership", async () => {
    await expect(communityService.create({ name: `Unauthorized ${marker}` }, authorId, "user")).rejects.toMatchObject({ statusCode: 403 });
    const community = await communityService.create({ name: `Software Engineering ${marker}`, description: "Evidence-led software engineering discussion", researchField: "Software Engineering" }, adminId, "admin");
    communityId = community.id;
    await communityService.join(communityId, authorId);
    await communityService.join(communityId, authorId);
    await communityService.join(communityId, responderId);
    expect(await getPrisma().communityMembership.count({ where: { communityId, userId: authorId } })).toBe(1);
    await expect(forumService.createPost({ communityId, title: "Unauthorized post", content: "Not a member" }, outsiderId)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("persists all four thread types and rejects private research context", async () => {
    const question = await forumService.createPost({ communityId, type: "QUESTION", title: "How should this be evaluated?", content: "<script>alert(1)</script> Evidence is needed", tags: ["LLM", "llm"] }, authorId);
    const discussion = await forumService.createPost({ communityId, type: "DISCUSSION", title: "Open methods discussion", content: "Compare methods", linkedProjectId: publicProjectId }, authorId);
    const paperDiscussion = await forumService.createPost({ communityId, type: "PAPER_DISCUSSION", title: "Discuss this paper", content: "Assess the evidence", linkedPaperId: paperId }, authorId);
    const gapDiscussion = await forumService.createPost({ communityId, type: "RESEARCH_GAP_DISCUSSION", title: "Discuss this candidate gap", content: "Is evidence missing?", linkedResearchGapId: gapId }, authorId);
    postIds.push(question.id, discussion.id, paperDiscussion.id, gapDiscussion.id);
    expect([question.type, discussion.type, paperDiscussion.type, gapDiscussion.type]).toEqual(["QUESTION", "DISCUSSION", "PAPER_DISCUSSION", "RESEARCH_GAP_DISCUSSION"]);
    expect(question.content).not.toContain("<script>");
    expect(question.tags).toEqual(["LLM"]);
    await expect(forumService.createPost({ communityId, title: "Private project leak", content: "Must fail", linkedProjectId: privateProjectId }, authorId)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("persists responses, one vote, accepted response, following, and locked-thread boundaries", async () => {
    const question = await forumService.createPost({ communityId, type: "QUESTION", title: "Question lifecycle", content: "Please cite evidence" }, authorId);
    postIds.push(question.id);
    const response = await forumService.addComment(question.id, { content: "A focused answer" }, responderId);
    await forumService.vote("comment", response.id, 1, authorId, "user");
    await forumService.vote("comment", response.id, 1, authorId, "user");
    expect(await getPrisma().forumVote.count({ where: { commentId: response.id, userId: authorId } })).toBe(1);
    await expect(forumService.acceptAnswer(question.id, response.id, responderId)).rejects.toMatchObject({ statusCode: 403 });
    expect((await forumService.acceptAnswer(question.id, response.id, authorId)).acceptedCommentId).toBe(response.id);
    await forumService.follow(question.id, authorId, true);
    expect((await forumService.listPosts({ sort: "following" }, 1, 20, authorId, "user")).data.some((post) => post.id === question.id)).toBe(true);
    await forumService.moderatePost(question.id, "THREAD_LOCKED", "Temporarily closed", adminId, "admin");
    await expect(forumService.addComment(question.id, { content: "Late response" }, responderId)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("persists owner edits and removals while rejecting other users", async () => {
    const discussion = await forumService.createPost({ communityId, title: "Editable discussion", content: "Original body", tags: ["original"] }, authorId);
    postIds.push(discussion.id);
    const response = await forumService.addComment(discussion.id, { content: "Original response" }, responderId);

    await expect(forumService.updatePost(discussion.id, { title: "Unauthorized edit" }, outsiderId)).rejects.toMatchObject({ statusCode: 403 });
    await forumService.updatePost(discussion.id, { title: "Edited discussion", content: "Edited body", tags: ["edited"] }, authorId);
    const persistedPost = await forumService.getPost(discussion.id, authorId, "user");
    expect(persistedPost).toMatchObject({ title: "Edited discussion", content: "Edited body", tags: ["edited"] });
    expect(persistedPost.editedAt).toBeTruthy();

    await expect(forumService.updateComment(response.id, { content: "Unauthorized response edit" }, authorId)).rejects.toMatchObject({ statusCode: 403 });
    await forumService.updateComment(response.id, { content: "Edited response" }, responderId);
    const persistedResponse = (await forumService.listComments(discussion.id, 1, 20, responderId, "user")).data.find((comment) => comment.id === response.id);
    expect(persistedResponse).toMatchObject({ content: "Edited response", status: "active" });
    expect(persistedResponse?.editedAt).toBeTruthy();

    await expect(forumService.deleteComment(response.id, outsiderId, "user")).rejects.toMatchObject({ statusCode: 403 });
    await forumService.deleteComment(response.id, responderId, "user");
    const removedResponse = (await forumService.listComments(discussion.id, 1, 20, authorId, "user")).data.find((comment) => comment.id === response.id);
    expect(removedResponse).toMatchObject({ status: "deleted", content: "This response was removed by its author." });

    await forumService.deletePost(discussion.id, authorId, "user");
    const removedDiscussion = await forumService.getPost(discussion.id, authorId, "user");
    expect(removedDiscussion).toMatchObject({ status: "deleted", title: "This discussion was removed by its author.", content: "" });
  });

  it("enforces moderation permissions and creates report and action audit records", async () => {
    const post = await forumService.createPost({ communityId, title: "Moderation target", content: "Forum policy test" }, authorId);
    postIds.push(post.id);
    await forumService.report("post", post.id, { reason: "SPAM", description: "Repeated irrelevant promotion" }, responderId);
    await expect(forumService.listReports(undefined, "open", authorId, "user")).rejects.toMatchObject({ statusCode: 403 });
    const reports = await forumService.listReports(undefined, "open", adminId, "admin");
    const report = reports.find((item) => item.postId === post.id);
    expect(report).toBeTruthy();
    await expect(forumService.moderatePost(post.id, "THREAD_HIDDEN", "Member cannot hide", authorId, "user")).rejects.toMatchObject({ statusCode: 403 });
    await forumService.moderatePost(post.id, "THREAD_HIDDEN", "Confirmed spam", adminId, "admin");
    await forumService.reviewReport(report!.id, { status: "resolved", moderationNote: "Spam removed" }, adminId, "admin");
    const history = await forumService.listModerationActions(undefined, adminId, "admin");
    expect(history.some((action) => action.action === "THREAD_HIDDEN" && action.targetId === post.id)).toBe(true);
    expect(history.some((action) => action.action === "REPORT_RESOLVED" && action.targetId === report!.id)).toBe(true);
  });
});
