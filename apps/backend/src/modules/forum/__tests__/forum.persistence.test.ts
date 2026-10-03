import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import { once } from "node:events";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import * as database from "../../../infrastructure/database/prisma.js";
import { communityService } from "../../communities/community.service.js";
import { forumService } from "../forum.service.js";
import { forumRouter } from "../forum.routes.js";
import { notificationService } from "../../notifications/notification.service.js";
import { backfillForumSlugs } from "../forum-slugs.js";

// Positional shim over the query-object `communityService.list` signature.
const listCommunities = (userId: string | undefined, page: number, pageSize: number, role?: Parameters<typeof communityService.list>[2], activeOnly = false) =>
  communityService.list(userId, { page, pageSize, sort: "recent", scope: "all", activeOnly: activeOnly ? "true" : undefined }, role);

describe.sequential("research forum persistence and authorization", () => {
  const marker = crypto.randomUUID();
  const emails = {
    admin: `forum-admin-${marker}@example.test`,
    author: `forum-author-${marker}@example.test`,
    responder: `forum-responder-${marker}@example.test`,
    outsider: `forum-outsider-${marker}@example.test`,
  };
  let adminId = ""; let authorId = ""; let responderId = ""; let outsiderId = "";
  let communityId = ""; let paperId = ""; let gapId = ""; let publicProjectId = ""; let privateProjectId = ""; let corpusId = "";
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
    const [publicProject, privateProject] = await Promise.all([
      prisma.project.create({ data: { title: `Public project ${marker}`, ownerId: author.id, visibility: "PUBLIC_SUMMARY" } }),
      prisma.project.create({ data: { title: `Private project ${marker}`, ownerId: author.id, visibility: "PRIVATE" } }),
    ]);
    const corpus = await prisma.literatureCorpus.create({ data: { ownerId: author.id, projectId: publicProject.id, name: `Forum corpus ${marker}`, topic: "Forum testing" } });
    const gap = await prisma.researchGap.create({ data: { topic: "Forum testing", normalizedTopic: `forum-testing-${marker}`, title: `Shareable gap ${marker}`, description: "Candidate gap", rationale: "Test evidence", source: "user", userId: author.id, projectId: publicProject.id, corpusId: corpus.id, forumShareable: true } });
    publicProjectId = publicProject.id; privateProjectId = privateProject.id; corpusId = corpus.id; gapId = gap.id;
  });

  afterAll(async () => {
    const prisma = getPrisma();
    // A failed presenter assertion can occur after insert, before the caller records the id.
    const persisted = await prisma.forumPost.findMany({ where: { authorId: { in: [authorId, responderId].filter(Boolean) } }, select: { id: true } });
    for (const post of persisted) if (!postIds.includes(post.id)) postIds.push(post.id);
    const commentIds = postIds.length
      ? (await prisma.forumComment.findMany({ where: { postId: { in: postIds } }, select: { id: true } })).map((comment) => comment.id)
      : [];
    await prisma.forumModerationAction.deleteMany({ where: { actorId: { in: [adminId, authorId, responderId, outsiderId].filter(Boolean) } } });
    if (postIds.length) {
      await prisma.contentReport.deleteMany({ where: { OR: [{ postId: { in: postIds } }, { commentId: { in: commentIds } }] } });
      await prisma.forumVote.deleteMany({ where: { OR: [{ postId: { in: postIds } }, { commentId: { in: commentIds } }] } });
      await prisma.forumReaction.deleteMany({ where: { targetId: { in: [...postIds, ...commentIds] } } });
      await prisma.forumReference.deleteMany({ where: { OR: [{ postId: { in: postIds } }, { commentId: { in: commentIds } }] } });
      await prisma.forumThreadFollow.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.forumPostView.deleteMany({ where: { postId: { in: postIds } } });
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
    if (gapId) {
      await prisma.gapEvidenceRecord.deleteMany({ where: { gapId } });
      await prisma.researchGapPaper.deleteMany({ where: { gapId } });
    }
    if (corpusId) await prisma.corpusPaper.deleteMany({ where: { corpusId } });
    await prisma.projectActivity.deleteMany({ where: { projectId: { in: [publicProjectId, privateProjectId].filter(Boolean) } } });
    await prisma.projectPaper.deleteMany({ where: { projectId: { in: [publicProjectId, privateProjectId].filter(Boolean) } } });
    if (gapId) await prisma.researchGap.deleteMany({ where: { id: gapId } });
    if (corpusId) await prisma.literatureCorpus.deleteMany({ where: { id: corpusId } });
    await prisma.project.deleteMany({ where: { id: { in: [publicProjectId, privateProjectId].filter(Boolean) } } });
    if (paperId) await prisma.paper.deleteMany({ where: { id: paperId } });
    await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } });
  });

  it("restricts community creation to admins and persists idempotent membership", async () => {
    await expect(communityService.create({ name: `Unauthorized ${marker}` }, { sub: authorId, role: "user", systemRole: "USER" })).rejects.toMatchObject({ statusCode: 403 });
    const community = await communityService.create({ name: `Software Engineering ${marker}`, description: "Evidence-led software engineering discussion", researchField: "Software Engineering" }, { sub: adminId, role: "admin", systemRole: "ADMIN" });
    communityId = community.id;
    await communityService.join(communityId, authorId);
    await communityService.join(communityId, authorId);
    await communityService.join(communityId, responderId);
    expect(await getPrisma().communityMembership.count({ where: { communityId, userId: authorId } })).toBe(1);
    await expect(forumService.createPost({ communityId, title: "Unauthorized post", content: "Not a member" }, outsiderId)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("allocates readable collision-safe slugs, retains aliases and keeps URLs stable on edits", async () => {
    const title = `Readable collision ${marker}`;
    const before = await getPrisma().community.findUniqueOrThrow({ where: { id: communityId } });
    const topics = await Promise.all([1, 2].map(() => forumService.createPost({ communityId, title, content: "Concurrent submissions" }, authorId)));
    postIds.push(...topics.map((topic) => topic.id));
    const base = topics.map((topic) => topic.publicSlug!).sort((a, b) => a.length - b.length);
    expect(base[1]).toBe(`${base[0]}-2`);
    expect((await getPrisma().community.findUniqueOrThrow({ where: { id: communityId } })).threadCount).toBe(before.threadCount + 2);
    const alias = `old-citation-${marker}-000000000000`;
    await getPrisma().forumPost.update({ where: { id: topics[0]!.id }, data: { publicSlugAliases: [alias] } });
    expect((await forumService.getPost(alias)).id).toBe(topics[0]!.id);
    expect((await forumService.updatePost(topics[0]!.id, { title: "A different title" }, authorId)).publicSlug).toBe(topics[0]!.publicSlug);
    const reserved = await forumService.createPost({ communityId, title: alias, content: "Must not steal a published alias" }, authorId);
    postIds.push(reserved.id);
    expect(reserved.publicSlug).toBe(`${alias}-2`);
    expect((await forumService.getPost(alias)).id).toBe(topics[0]!.id);
  });

  it("gives fresh post-migration fixtures readable URLs without renaming published links", async () => {
    const title = `Fresh imported title ${marker}`;
    const rows = await Promise.all([1, 2].map(() => getPrisma().forumPost.create({ data: { authorId, communityId, title, body: "Fixture" } })));
    const ids = rows.map((post) => post.id); postIds.push(...ids);
    await backfillForumSlugs(ids);
    const first = await getPrisma().forumPost.findMany({ where: { id: { in: ids } }, orderBy: { publicSlug: "asc" } });
    expect(first[0]!.publicSlug).toBeTruthy();
    expect(first[1]!.publicSlug).toBe(`${first[0]!.publicSlug}-2`);
    await getPrisma().forumPost.update({ where: { id: first[0]!.id }, data: { title: "Reworded imported topic" } });
    await backfillForumSlugs(ids);
    expect((await getPrisma().forumPost.findUniqueOrThrow({ where: { id: first[0]!.id } })).publicSlug).toBe(first[0]!.publicSlug);
  });

  it("discovers actual related and suggested topics without duplication or evidence changes", async () => {
    const tag = `cosmology-${marker}`;
    const source = await forumService.createPost({ communityId, title: "Supernova gravitational redshift measurement", tags: [tag], content: "Source" }, authorId);
    const related = await forumService.createPost({ communityId, title: "Black hole observation limits", tags: [tag], content: "Related by tag" }, authorId);
    const suggested = await forumService.createPost({ communityId, title: "Ocean currents at continental margins", content: "Other community discussion" }, authorId);
    const hidden = await forumService.createPost({ communityId, title: "Hidden black hole observation", tags: [tag], content: "Hidden" }, authorId);
    const deleted = await forumService.createPost({ communityId, title: "Deleted black hole observation", tags: [tag], content: "Deleted" }, authorId);
    postIds.push(source.id, related.id, suggested.id, hidden.id, deleted.id);
    await getPrisma().forumPost.update({ where: { id: hidden.id }, data: { status: "hidden" } });
    await getPrisma().forumPost.update({ where: { id: deleted.id }, data: { status: "deleted" } });
    const gapBefore = await getPrisma().researchGap.findUniqueOrThrow({ where: { id: gapId } });
    const evidenceBefore = await getPrisma().gapEvidenceRecord.count({ where: { gapId } });
    const result = await forumService.postDiscovery(source.publicSlug!);
    expect(result.related).toContainEqual(expect.objectContaining({ id: related.id, reason: "SHARED_TAGS" }));
    expect(result.suggested).toContainEqual(expect.objectContaining({ id: suggested.id, reason: "SAME_COMMUNITY" }));
    const ids = [...result.related, ...result.suggested].map((topic) => topic.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of [source.id, hidden.id, deleted.id]) expect(ids).not.toContain(id);
    expect(result.related.length).toBeLessThanOrEqual(5);
    expect(result.suggested.length).toBeLessThanOrEqual(5);
    expect((await getPrisma().forumPost.findUniqueOrThrow({ where: { id: source.id } })).viewCount).toBe(0);
    expect(await getPrisma().gapEvidenceRecord.count({ where: { gapId } })).toBe(evidenceBefore);
    expect(await getPrisma().researchGap.findUniqueOrThrow({ where: { id: gapId } })).toMatchObject({ confidence: gapBefore.confidence, evidenceConfidence: gapBefore.evidenceConfidence, validationStatus: gapBefore.validationStatus });
    expect(JSON.stringify(result)).not.toContain('"body"');
    await expect(forumService.postDiscovery(hidden.id, adminId, "admin")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("does not use a now-private academic context as the reason for a recommendation", async () => {
    const source = await forumService.createPost({ communityId, title: "Public source about methodological limitations", linkedResearchGapId: gapId, linkedProjectId: publicProjectId, content: "Source" }, authorId);
    const candidate = await forumService.createPost({ communityId, title: "A different public source", linkedResearchGapId: gapId, content: "Candidate" }, authorId);
    postIds.push(source.id, candidate.id);
    try {
      await getPrisma().researchGap.update({ where: { id: gapId }, data: { forumShareable: false } });
      await getPrisma().project.update({ where: { id: publicProjectId }, data: { visibility: "PRIVATE" } });
      const result = await forumService.postDiscovery(source.id);
      expect(result.related.find((topic) => topic.id === candidate.id)?.reason).not.toBe("SAME_GAP");
      expect(JSON.stringify(result)).not.toContain(gapId);
      expect(JSON.stringify(result)).not.toContain(publicProjectId);
    } finally {
      await getPrisma().researchGap.update({ where: { id: gapId }, data: { forumShareable: true } });
      await getPrisma().project.update({ where: { id: publicProjectId }, data: { visibility: "PUBLIC_SUMMARY" } });
    }
  });

  it("filters private/archived recommendations and protects discovery source aliases", async () => {
    const tag = `privacy-${marker}`;
    const source = await forumService.createPost({ title: "Private recommendation boundary source", tags: [tag], content: "Public source" }, authorId);
    const related = await forumService.createPost({ communityId, title: "Restricted recommendation candidate", tags: [tag], content: "Member-only" }, authorId);
    postIds.push(source.id, related.id);
    const alias = `restricted-${marker}-000000000000`;
    await getPrisma().forumPost.update({ where: { id: related.id }, data: { publicSlugAliases: [alias] } });
    try {
      await getPrisma().community.update({ where: { id: communityId }, data: { visibility: "private" } });
      expect((await forumService.postDiscovery(source.id)).related.map((topic) => topic.id)).not.toContain(related.id);
      expect((await forumService.postDiscovery(source.id, outsiderId, "user")).related.map((topic) => topic.id)).not.toContain(related.id);
      expect((await forumService.postDiscovery(source.id, authorId, "user")).related.map((topic) => topic.id)).toContain(related.id);
      expect((await forumService.postDiscovery(source.id, adminId, "admin")).related.map((topic) => topic.id)).toContain(related.id);
      for (const locator of [related.id, related.publicSlug!, alias]) await expect(forumService.postDiscovery(locator)).rejects.toMatchObject({ statusCode: 403 });
      await getPrisma().community.update({ where: { id: communityId }, data: { status: "ARCHIVED" } });
      expect((await forumService.postDiscovery(source.id, adminId, "admin")).related.map((topic) => topic.id)).not.toContain(related.id);
    } finally { await getPrisma().community.update({ where: { id: communityId }, data: { visibility: "public", status: "ACTIVE" } }); }
  });

  it("persists all four thread types and rejects private research context", async () => {
    const question = await forumService.createPost({ communityId, type: "QUESTION", title: "How should this be evaluated?", content: "<script>alert(1)</script> Evidence is needed", tags: ["LLM", "llm"] }, authorId);
    const discussion = await forumService.createPost({ communityId, type: "DISCUSSION", title: "Open methods discussion", content: "Compare methods", linkedProjectId: publicProjectId }, authorId);
    const paperDiscussion = await forumService.createPost({ communityId, type: "PAPER_DISCUSSION", title: "Discuss this paper", content: "Assess the evidence", linkedPaperId: paperId }, authorId);
    const gapDiscussion = await forumService.createPost({ communityId, type: "RESEARCH_GAP_DISCUSSION", title: "Discuss this candidate gap", content: "Is evidence missing?", linkedResearchGapId: gapId }, authorId);
    postIds.push(question.id, discussion.id, paperDiscussion.id, gapDiscussion.id);
    expect([question.type, discussion.type, paperDiscussion.type, gapDiscussion.type]).toEqual(["QUESTION", "DISCUSSION", "PAPER_DISCUSSION", "RESEARCH_GAP_DISCUSSION"]);
    expect(await getPrisma().forumPostGap.count({ where: { postId: gapDiscussion.id, gapId } })).toBe(1);
    expect(question.content).not.toContain("<script>");
    expect(question.tags).toEqual(["LLM"]);
    await expect(forumService.createPost({ communityId, title: "Private project leak", content: "Must fail", linkedProjectId: privateProjectId }, authorId)).rejects.toMatchObject({ statusCode: 403 });
    const privateGap = await getPrisma().researchGap.create({ data: { topic: "Private gap", normalizedTopic: `private-gap-${marker}`, title: `Private gap ${marker}`, description: "Private candidate", rationale: "Private evidence", source: "user", userId: authorId, forumShareable: false } });
    await expect(forumService.createPost({ communityId, type: "RESEARCH_GAP_DISCUSSION", title: "Private gap leak", content: "Must fail", linkedResearchGapId: privateGap.id }, authorId)).rejects.toMatchObject({ statusCode: 403 });
    await expect(forumService.listPosts({ linkedResearchGapId: privateGap.id }, 1, 20, authorId, "user")).rejects.toMatchObject({ statusCode: 403 });
    await getPrisma().researchGap.delete({ where: { id: privateGap.id } });
  });

  it("keeps forum activity separate from gap evidence and requires formal review before evidence linking", async () => {
    const gapBefore = await getPrisma().researchGap.findUniqueOrThrow({ where: { id: gapId } });
    const discussion = await forumService.createPost({ communityId, type: "RESEARCH_GAP_DISCUSSION", title: "Could a newer paper challenge this gap?", content: "Please review newer literature before changing the gap.", linkedResearchGapId: gapId }, authorId);
    postIds.push(discussion.id);
    const response = await forumService.addComment(discussion.id, { content: "This paper may be relevant, but it needs formal screening.", references: [{ paperId }] }, responderId);
    await forumService.vote("post", discussion.id, 1, responderId, "user");

    const activity = await forumService.gapDiscussionContext(gapId, authorId, "user");
    expect(activity.summary.threadCount).toBeGreaterThanOrEqual(1);
    expect(activity.summary.citationCount).toBeGreaterThanOrEqual(1);
    expect(activity.discussions.some((post) => post.id === discussion.id)).toBe(true);
    expect(await getPrisma().gapEvidenceRecord.count({ where: { gapId } })).toBe(0);
    const gapAfterActivity = await getPrisma().researchGap.findUniqueOrThrow({ where: { id: gapId } });
    expect(gapAfterActivity.confidence).toBe(gapBefore.confidence);
    expect(gapAfterActivity.evidenceConfidence).toBe(gapBefore.evidenceConfidence);
    expect(gapAfterActivity.validationStatus).toBe(gapBefore.validationStatus);

    const citation = response.references.find((reference) => reference.paperId === paperId);
    expect(citation?.id).toBeTruthy();
    await expect(forumService.reviewCitationAsEvidence(gapId, { referenceId: citation!.id!, projectId: publicProjectId, relation: "COUNTER", confirmRelation: true, explanation: "This should not skip screening." }, authorId)).resolves.toMatchObject({ status: "PAPER_ADDED_TO_PROJECT" });
    expect(await getPrisma().gapEvidenceRecord.count({ where: { gapId } })).toBe(0);

    await expect(forumService.reviewCitationAsEvidence(gapId, { referenceId: citation!.id!, projectId: publicProjectId, screeningStatus: "INCLUDED", relation: "COUNTER", confirmRelation: true, explanation: "The paper is included, but extraction must happen first." }, authorId)).resolves.toMatchObject({ status: "EVIDENCE_EXTRACTION_REQUIRED" });
    expect(await getPrisma().gapEvidenceRecord.count({ where: { gapId } })).toBe(0);

    const projectPaper = await getPrisma().projectPaper.findUniqueOrThrow({ where: { projectId_paperId: { projectId: publicProjectId, paperId } } });
    const extractionRequired = await forumService.forumCitationEvidenceOptions(gapId, citation!.id!, publicProjectId, authorId);
    expect(extractionRequired).toMatchObject({ status: "EVIDENCE_EXTRACTION_REQUIRED", message: "Extract evidence from this paper before linking it to the candidate gap." });
    await getPrisma().corpusPaper.create({ data: {
      corpusId,
      paperId,
      addedById: authorId,
      included: true,
      evidence: {
        findings: "Developers using LLM review tools showed measurable gains.",
        limitations: "The study only evaluated a short laboratory task.",
      },
    } });

    const evidenceOptions = await forumService.forumCitationEvidenceOptions(gapId, citation!.id!, publicProjectId, authorId);
    expect(evidenceOptions.status).toBe("EVIDENCE_SELECTION_REQUIRED");
    expect(evidenceOptions.extractedEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ evidenceType: "FINDING", excerpt: "Developers using LLM review tools showed measurable gains.", sourceLocation: "CorpusPaper.evidence.findings" }),
      expect.objectContaining({ evidenceType: "LIMITATION", excerpt: "The study only evaluated a short laboratory task.", sourceLocation: "CorpusPaper.evidence.limitations" }),
    ]));

    await expect(forumService.reviewCitationAsEvidence(gapId, {
      referenceId: citation!.id!,
      projectId: publicProjectId,
      relation: "COUNTER",
      evidenceSelections: [{ evidenceType: "FINDING", excerpt: "This excerpt is not present in the extraction." }],
      confirmRelation: true,
      explanation: "An arbitrary excerpt must never become formal gap evidence.",
    }, authorId)).resolves.toMatchObject({ status: "EVIDENCE_SELECTION_REQUIRED" });
    expect(await getPrisma().gapEvidenceRecord.count({ where: { gapId } })).toBe(0);

    await expect(forumService.reviewCitationAsEvidence(gapId, {
      referenceId: citation!.id!,
      projectId: publicProjectId,
      screeningStatus: "EXCLUDED",
      exclusionReason: "INSUFFICIENT_RELEVANT_EVIDENCE",
      relation: "COUNTER",
      evidenceSelections: [{ evidenceType: "LIMITATION", excerpt: "The study only evaluated a short laboratory task." }],
      confirmRelation: true,
      explanation: "Excluded papers cannot provide formal candidate-gap evidence.",
    }, authorId)).resolves.toMatchObject({ status: "SCREENING_REQUIRED" });
    expect(await getPrisma().gapEvidenceRecord.count({ where: { gapId } })).toBe(0);

    await expect(forumService.reviewCitationAsEvidence(gapId, {
      referenceId: citation!.id!,
      projectId: publicProjectId,
      screeningStatus: "UNDECIDED",
      relation: "COUNTER",
      evidenceSelections: [{ evidenceType: "LIMITATION", excerpt: "The study only evaluated a short laboratory task." }],
      confirmRelation: true,
      explanation: "Undecided papers cannot provide formal candidate-gap evidence.",
    }, authorId)).resolves.toMatchObject({ status: "SCREENING_REQUIRED" });
    expect(await getPrisma().gapEvidenceRecord.count({ where: { gapId } })).toBe(0);

    await expect(forumService.reviewCitationAsEvidence(gapId, {
      referenceId: citation!.id!,
      projectId: publicProjectId,
      screeningStatus: "INCLUDED",
      relation: "COUNTER",
      evidenceSelections: [{ evidenceType: "LIMITATION", excerpt: "The study only evaluated a short laboratory task." }],
      explanation: "The researcher must explicitly confirm the selected relation.",
    }, authorId)).resolves.toMatchObject({ status: "RELATION_CONFIRMATION_REQUIRED" });

    await expect(forumService.reviewCitationAsEvidence(gapId, {
      referenceId: citation!.id!,
      projectId: publicProjectId,
      relation: "RELATED",
      evidenceSelections: [{ evidenceType: "FINDING", excerpt: "Developers using LLM review tools showed measurable gains." }],
      confirmRelation: true,
    }, authorId)).resolves.toMatchObject({ status: "RELATED_ONLY" });
    expect(await getPrisma().gapEvidenceRecord.count({ where: { gapId } })).toBe(0);

    await expect(forumService.reviewCitationAsEvidence(gapId, {
      referenceId: citation!.id!,
      projectId: publicProjectId,
      relation: "COUNTER",
      evidenceSelections: [{ evidenceType: "LIMITATION", excerpt: "The study only evaluated a short laboratory task." }],
      confirmRelation: true,
      explanation: "This limitation weakens the candidate gap's assumed generalizability.",
    }, authorId)).resolves.toMatchObject({ status: "EVIDENCE_LINKED" });
    expect(await getPrisma().gapEvidenceRecord.count({ where: { gapId, evidenceKind: "COUNTER" } })).toBe(1);
    const persistedEvidence = await getPrisma().gapEvidenceRecord.findFirstOrThrow({ where: { gapId, evidenceKind: "COUNTER" } });
    expect(persistedEvidence).toMatchObject({
      gapId,
      paperId,
      projectPaperId: projectPaper.id,
      corpusPaperId: expect.any(String),
      forumReferenceId: citation!.id,
      forumPostId: discussion.id,
      forumCommentId: response.id,
      evidenceType: "LIMITATION",
      excerpt: "The study only evaluated a short laboratory task.",
      sourceLocation: "CorpusPaper.evidence.limitations",
    });
    const gapAfterEvidence = await getPrisma().researchGap.findUniqueOrThrow({ where: { id: gapId } });
    expect(gapAfterEvidence.confidence).toBe(gapBefore.confidence);
    expect(gapAfterEvidence.validationStatus).toBe(gapBefore.validationStatus);
    await expect(forumService.reviewCitationAsEvidence(gapId, { referenceId: citation!.id!, projectId: publicProjectId, relation: "SUPPORTING", confirmRelation: true, explanation: "Admin moderation rights should not grant scholarly evidence authority." }, adminId)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("persists the emoji palette idempotently without changing scholarly evidence or access boundaries", async () => {
    const topic = await forumService.createPost({ communityId, title: `Emoji palette ${marker}`, content: "Community feedback only" }, authorId);
    postIds.push(topic.id);
    const response = await forumService.addComment(topic.id, { content: "A response with reactions" }, responderId);
    const reactions = ["LIKE", "INSIGHTFUL", "CELEBRATE", "CURIOUS", "LOVE", "LAUGH", "SURPRISED", "SAD", "AGREE", "DISAGREE"] as const;
    const gapBefore = await getPrisma().researchGap.findUniqueOrThrow({ where: { id: gapId } });
    const evidenceBefore = await getPrisma().gapEvidenceRecord.count({ where: { gapId } });
    for (const name of reactions) {
      await forumService.react("post", topic.publicSlug, name, true, responderId, "user");
      const repeated = await forumService.react("post", topic.id, name, true, responderId, "user");
      expect(repeated.counts[name]).toBe(1);
      expect(repeated.viewerReactions).toEqual([name]);
      expect(Object.values(repeated.counts).reduce((sum, count) => sum + count, 0)).toBe(1);
      await forumService.react("comment", response.id, name, true, authorId, "user");
    }
    expect((await forumService.getPost(topic.id, responderId, "user")).viewerReactions).toEqual(["DISAGREE"]);
    const comments = await forumService.listComments(topic.id, 1, 20, authorId, "user");
    expect(comments.data[0]).toMatchObject({ reactionCounts: Object.fromEntries(reactions.map((name) => [name, name === "DISAGREE" ? 1 : 0])), viewerReactions: ["DISAGREE"] });
    const staleRemoval = await forumService.react("post", topic.id, "LOVE", false, responderId, "user");
    expect(staleRemoval.viewerReactions).toEqual(["DISAGREE"]);
    const removed = await forumService.react("post", topic.id, "DISAGREE", false, responderId, "user");
    expect(removed.counts.DISAGREE).toBe(0);
    expect(removed.viewerReactions).toEqual([]);
    expect(removed.reactors.DISAGREE).toBeUndefined();
    expect(await getPrisma().gapEvidenceRecord.count({ where: { gapId } })).toBe(evidenceBefore);
    expect(await getPrisma().researchGap.findUniqueOrThrow({ where: { id: gapId } })).toMatchObject({ confidence: gapBefore.confidence, validationStatus: gapBefore.validationStatus });
    await getPrisma().community.update({ where: { id: communityId }, data: { visibility: "private" } });
    try {
      await expect(forumService.react("post", topic.id, "LOVE", true, outsiderId, "user")).rejects.toMatchObject({ statusCode: 403 });
      await expect(forumService.react("comment", response.id, "LOVE", true, outsiderId, "user")).rejects.toMatchObject({ statusCode: 403 });
    } finally {
      await getPrisma().community.update({ where: { id: communityId }, data: { visibility: "public" } });
    }
    await forumService.moderateComment(response.id, "RESPONSE_HIDDEN", "Policy review", adminId, "admin");
    await expect(forumService.react("comment", response.id, "LOVE", true, authorId, "user")).rejects.toMatchObject({ statusCode: 404 });
    await forumService.moderatePost(topic.id, "THREAD_HIDDEN", "Policy review", adminId, "admin");
    await expect(forumService.react("post", topic.id, "LOVE", true, responderId, "user")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("keeps one reaction per member and target during concurrent replacements", async () => {
    const prisma = getPrisma();
    const topic = await forumService.createPost({ communityId, title: `Single reaction ${marker}`, content: "One choice per member" }, authorId);
    postIds.push(topic.id);
    const response = await forumService.addComment(topic.id, { content: "Independent response reactions" }, responderId);
    for (const [kind, targetId] of [["post", topic.id], ["comment", response.id]] as const) {
      await Promise.all((["LIKE", "LOVE", "AGREE", "CELEBRATE"] as const).map((reaction) => forumService.react(kind, targetId, reaction, true, authorId, "user")));
      const stored = await prisma.forumReaction.findMany({ where: { targetType: kind, targetId, userId: authorId } });
      expect(stored).toHaveLength(1);
      await expect(prisma.forumReaction.create({ data: { targetType: kind, targetId, userId: authorId, reaction: "CURIOUS" } })).rejects.toMatchObject({ code: "P2002" });
      await forumService.react(kind, targetId, "INSIGHTFUL", true, responderId, "user");
      expect(await prisma.forumReaction.count({ where: { targetType: kind, targetId } })).toBe(2);
      await forumService.react(kind, targetId, stored[0]!.reaction as Parameters<typeof forumService.react>[2], false, authorId, "user");
      expect(await prisma.forumReaction.count({ where: { targetType: kind, targetId, userId: authorId } })).toBe(0);
    }
  });

  it("persists responses, one vote, accepted response, following, and locked-thread boundaries", async () => {
    const question = await forumService.createPost({ communityId, type: "QUESTION", title: "Question lifecycle", content: "Please cite evidence" }, authorId);
    postIds.push(question.id);
    const response = await forumService.addComment(question.id, { content: "A focused answer" }, responderId);
    await forumService.vote("comment", response.id, 1, authorId, "user");
    await forumService.vote("comment", response.id, 1, authorId, "user");
    expect(await getPrisma().forumVote.count({ where: { commentId: response.id, userId: authorId } })).toBe(1);
    await forumService.react("comment", response.id, "INSIGHTFUL", true, authorId, "user");
    const reacted = await forumService.getPost(question.id, authorId, "user");
    const listedResponse = (await forumService.listComments(question.id, 1, 20, authorId, "user")).data.find((item) => item.id === response.id);
    expect(listedResponse).toMatchObject({ reactionCounts: { INSIGHTFUL: 1 }, viewerReactions: ["INSIGHTFUL"] });
    expect(reacted).toMatchObject({ reactionCounts: expect.any(Object) });
    await forumService.react("comment", response.id, "INSIGHTFUL", false, authorId, "user");
    await expect(forumService.acceptAnswer(question.id, response.id, responderId)).rejects.toMatchObject({ statusCode: 403 });
    expect((await forumService.acceptAnswer(question.id, response.id, authorId)).acceptedCommentId).toBe(response.id);
    const slug = question.publicSlug;
    expect((await forumService.updatePost(question.id, { title: "Reworded question lifecycle" }, authorId)).publicSlug).toBe(slug);
    await forumService.follow(question.id, authorId, true);
    expect((await forumService.listPosts({ sort: "following" }, 1, 20, authorId, "user")).data.some((post) => post.id === question.id)).toBe(true);
    await forumService.moderatePost(question.id, "THREAD_LOCKED", "Temporarily closed", adminId, "admin");
    await expect(forumService.addComment(question.id, { content: "Late response" }, responderId)).rejects.toMatchObject({ statusCode: 409 });
    await expect(forumService.acceptAnswer(question.id, undefined, authorId)).rejects.toMatchObject({ statusCode: 409 });
    expect((await forumService.getPost(question.id, authorId, "user")).acceptedCommentId).toBe(response.id);
    await forumService.moderatePost(question.id, "THREAD_UNLOCKED", undefined, adminId, "admin");
    await forumService.moderateComment(response.id, "RESPONSE_HIDDEN", "Policy review", adminId, "admin");
    await expect(forumService.acceptAnswer(question.id, response.id, authorId)).rejects.toMatchObject({ statusCode: 400 });
    await forumService.moderatePost(question.id, "THREAD_HIDDEN", "Policy review", adminId, "admin");
    await expect(forumService.acceptAnswer(question.id, undefined, authorId)).rejects.toMatchObject({ statusCode: 404 });
    await forumService.moderatePost(question.id, "THREAD_RESTORED", undefined, adminId, "admin");
    await forumService.moderateComment(response.id, "RESPONSE_RESTORED", undefined, adminId, "admin");
    await forumService.acceptAnswer(question.id, response.id, authorId);
    expect((await forumService.updatePost(question.id, { type: "DISCUSSION" }, authorId)).acceptedCommentId).toBeUndefined();
    await expect(forumService.acceptAnswer(question.id, response.id, authorId)).rejects.toMatchObject({ statusCode: 400 });
  });

  it("preserves the exact reply target, persists citations and activity, and deduplicates recipients", async () => {
    const prisma = getPrisma();
    const topic = await forumService.createPost({ communityId, type: "QUESTION", title: "Reply provenance", content: "Original question" }, authorId);
    postIds.push(topic.id);
    const parent = await forumService.addComment(topic.id, { content: "Initial reply" }, responderId);
    const child = await forumService.addComment(topic.id, { content: "Follow-up", parentCommentId: parent.id }, authorId);
    await forumService.follow(topic.id, responderId, true);
    const beforeNotifications = await prisma.notification.count({ where: { targetUuid: topic.id } });
    const reply = await forumService.addComment(topic.id, { content: "Reply to the follow-up with a citation", parentCommentId: child.id, references: [{ paperId }] }, responderId);
    expect(reply).toMatchObject({ parentCommentId: child.id, parentComment: { id: child.id, author: { fullName: "Question Author" } }, helpfulCount: 0 });
    expect(reply.references).toEqual([expect.objectContaining({ paperId, verified: true })]);
    expect(JSON.stringify(reply)).not.toMatch(/pdfPath|filePath|fullText|storageKey/);
    const topicAfter = await forumService.getPost(topic.id, authorId, "user");
    expect(topicAfter).toMatchObject({ replyCount: 3, canReply: true, helpfulCount: 0 });
    expect(new Date(topicAfter.lastActivityAt).getTime()).toBe(new Date(reply.createdAt).getTime());
    expect(await prisma.forumPost.findUniqueOrThrow({ where: { id: topic.id } })).toMatchObject({ commentCount: 3 });
    expect(await prisma.notification.count({ where: { targetUuid: topic.id } })).toBe(beforeNotifications + 1);
    expect(await prisma.notification.findFirst({ where: { targetUuid: topic.id, userId: authorId }, orderBy: { createdAt: "desc" } })).toMatchObject({ type: "FORUM_REPLY_CREATED" });
    const listed = await forumService.listComments(topic.id, 1, 100, authorId, "user");
    expect(listed.data.map((comment) => comment.id)).toEqual([parent.id, child.id, reply.id]);
    await forumService.vote("comment", reply.id, 1, authorId, "user");
    expect((await forumService.listComments(topic.id, 1, 100)).data[2].helpfulCount).toBe(1);
    expect((await forumService.getPost(topic.id)).helpfulCount).toBe(0);
  });

  it("rejects non-members, cross-thread/hidden/deleted targets, sanitized empty copy and rejected citations", async () => {
    const first = await forumService.createPost({ communityId, title: "Reply authorization", content: "Public question" }, authorId);
    const second = await forumService.createPost({ communityId, title: "Other discussion", content: "Other context" }, authorId);
    postIds.push(first.id, second.id);
    const foreign = await forumService.addComment(second.id, { content: "Foreign reply" }, responderId);
    await expect(forumService.addComment(first.id, { content: "Cross thread", parentCommentId: foreign.id }, responderId)).rejects.toMatchObject({ statusCode: 400 });
    await expect(forumService.addComment(first.id, { content: "Nonmember" }, outsiderId)).rejects.toMatchObject({ statusCode: 403 });
    expect((await forumService.getPost(first.id, outsiderId, "user")).canReply).toBe(false);
    await expect(forumService.addComment(first.id, { content: "<p></p>" }, authorId)).rejects.toMatchObject({ statusCode: 400 });
    await expect(forumService.addComment(first.id, { content: "Unsafe citation", references: [{ doi: "10.1145/test", title: "Metadata", url: "javascript:alert(1)" }] }, authorId)).rejects.toMatchObject({ statusCode: 400 });
    const parent = await forumService.addComment(first.id, { content: "Removable private words", references: [{ paperId }] }, responderId);
    await forumService.moderateComment(parent.id, "RESPONSE_HIDDEN", "Policy review", adminId, "admin");
    await expect(forumService.addComment(first.id, { content: "Hidden target", parentCommentId: parent.id }, authorId)).rejects.toMatchObject({ statusCode: 400 });
    await forumService.deleteComment(parent.id, responderId, "user");
    await expect(forumService.addComment(first.id, { content: "Deleted target", parentCommentId: parent.id }, authorId)).rejects.toMatchObject({ statusCode: 400 });
    const removed = (await forumService.listComments(first.id, 1, 100)).data[0];
    expect(removed).toMatchObject({ status: "deleted", body: "This response was removed by its author.", references: [] });
    expect(JSON.stringify(removed)).not.toContain("Removable private words");
  });

  it("rolls back reply/reference/counters if transactional notification persistence fails, but not if push delivery fails", async () => {
    const prisma = getPrisma();
    const topic = await forumService.createPost({ communityId, title: "Atomic reply records", content: "Test consistency" }, authorId);
    postIds.push(topic.id);
    const before = await prisma.forumPost.findUniqueOrThrow({ where: { id: topic.id } });
    const createFailure = vi.spyOn(notificationService, "create").mockRejectedValueOnce(new Error("Notification storage unavailable"));
    try {
      await expect(forumService.addComment(topic.id, { content: "Must rollback", references: [{ paperId }] }, responderId)).rejects.toThrow("Notification storage unavailable");
      expect(await prisma.forumComment.count({ where: { postId: topic.id } })).toBe(0);
      expect(await prisma.forumPost.findUniqueOrThrow({ where: { id: topic.id } })).toMatchObject({ commentCount: 0, lastActivityAt: before.lastActivityAt });
    } finally { createFailure.mockRestore(); }
    const pushFailure = vi.spyOn(notificationService, "dispatch").mockRejectedValueOnce(new Error("Push unavailable"));
    try {
      const reply = await forumService.addComment(topic.id, { content: "Committed reply", references: [{ paperId }] }, responderId);
      expect(reply.references).toHaveLength(1);
      expect((await forumService.getPost(topic.id)).replyCount).toBe(1);
      expect(await prisma.notification.count({ where: { targetUuid: topic.id } })).toBe(1);
    } finally { pushFailure.mockRestore(); }
  });

  it("checks the latest locked state under the persistence lock", async () => {
    const prisma = getPrisma();
    const topic = await forumService.createPost({ communityId, title: "Concurrent lock", content: "Do not accept late replies" }, authorId);
    postIds.push(topic.id);
    let release!: () => void;
    let ready!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const locked = new Promise<void>((resolve) => { ready = resolve; });
    const moderation = prisma.$transaction(async (tx) => {
      await tx.forumPost.update({ where: { id: topic.id }, data: { status: "locked" } });
      ready();
      await gate;
    });
    await locked;
    const lateReply = forumService.addComment(topic.id, { content: "Late reply" }, responderId);
    const rejection = expect(lateReply).rejects.toMatchObject({ statusCode: 409 });
    release();
    await moderation;
    await rejection;
    expect(await prisma.forumComment.count({ where: { postId: topic.id } })).toBe(0);
  });

  it("derives list metrics from visible replies, root helpful votes, participants, activity, and deduped views", async () => {
    const discussion = await forumService.createPost({ communityId, title: "Metrics semantics", content: "Measure the discussion without mixing response votes." }, authorId);
    postIds.push(discussion.id);
    await forumService.addComment(discussion.id, { content: "First response" }, responderId);
    await forumService.addComment(discussion.id, { content: "Second response" }, adminId);
    const third = await forumService.addComment(discussion.id, { content: "Additional methodological point" }, responderId);
    await forumService.moderateComment(third.id, "RESPONSE_HIDDEN", "Repeated argument", adminId, "admin");
    await forumService.vote("post", discussion.id, 1, responderId, "user");
    await forumService.vote("comment", (await forumService.listComments(discussion.id, 1, 20, responderId, "user")).data[0].id, 1, adminId, "admin");

    const first = await forumService.getPost(discussion.id, authorId, "user", "test-viewer");
    const second = await forumService.getPost(discussion.id, authorId, "user", "test-viewer");
    expect(first).toMatchObject({ commentCount: 2, replyCount: 2, helpfulCount: 1, viewCount: 1 });
    expect(second.viewCount).toBe(1);
    expect(first.participants?.map((participant) => participant.id)).toEqual(expect.arrayContaining([authorId, responderId, adminId]));
    expect(first.participants?.length).toBe(3);
    expect(new Date(first.lastActivityAt as string).getTime()).toBeGreaterThanOrEqual(new Date(first.createdAt).getTime());
    const listed = (await forumService.listPosts({ query: "Metrics semantics" }, 1, 10, authorId, "user")).data[0];
    expect(listed).toMatchObject({ replyCount: 2, helpfulCount: 1, viewCount: 1 });
    const activityBeforeVote = listed.lastActivityAt;
    await forumService.vote("post", discussion.id, 1, adminId, "admin");
    const afterVote = (await forumService.listPosts({ query: "Metrics semantics" }, 1, 10, authorId, "user")).data[0];
    expect(afterVote.lastActivityAt).toEqual(activityBeforeVote);
  });

  it("records daily views atomically, deduplicates eight hours, and keeps analytics reads out of lifetime totals", async () => {
    const prisma = getPrisma();
    const topic = await forumService.createPost({ communityId, title: "Recent view history", content: "View tracking" }, authorId);
    postIds.push(topic.id);
    const key = `anon:${marker}`;
    await Promise.all(Array.from({ length: 5 }, () => forumService.getPost(topic.id, undefined, undefined, key)));
    expect((await forumService.getPost(topic.id)).viewCount).toBe(1);
    const history = await forumService.recentViews(topic.publicSlug!);
    expect(history).toMatchObject({ cooldownHours: 8, timeZone: "UTC", daily: [{ date: new Date().toISOString().slice(0, 10), count: 1 }] });
    await prisma.forumPostView.updateMany({ where: { postId: topic.id, viewerKey: key }, data: { viewedAt: new Date(Date.now() - (8 * 60 - 1) * 60_000) } });
    await forumService.getPost(topic.id, undefined, undefined, key);
    expect((await forumService.getPost(topic.id)).viewCount).toBe(1);
    await prisma.forumPostView.updateMany({ where: { postId: topic.id, viewerKey: key }, data: { viewedAt: new Date(Date.now() - 8 * 60 * 60_000 - 1000) } });
    await Promise.all(Array.from({ length: 5 }, () => forumService.getPost(topic.id, undefined, undefined, key)));
    expect((await forumService.recentViews(topic.id)).daily.at(-1)?.count).toBe(2);
    expect((await forumService.getPost(topic.id)).viewCount).toBe(2);
    expect(JSON.stringify(history)).not.toMatch(/viewerKey|anon:|userId|email/);
  });

  it("returns actual daily values and tracked zero days without inventing a breakdown of older lifetime views", async () => {
    const prisma = getPrisma();
    const topic = await forumService.createPost({ communityId, title: "Daily view series", content: "Historical breakdown" }, authorId);
    postIds.push(topic.id);
    const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
    const start = new Date(today.getTime() - 3 * 86400000);
    await prisma.forumPost.update({ where: { id: topic.id }, data: { viewCount: 99, viewsTrackedSince: start } });
    await prisma.forumPostDailyView.createMany({ data: [{ postId: topic.id, day: start, count: 6 }, { postId: topic.id, day: today, count: 2 }] });
    const history = await forumService.recentViews(topic.id);
    expect(history.daily.map((day) => day.count)).toEqual([6, 0, 0, 2]);
    expect(history.trackingStartedAt).toBe(start.toISOString());
    expect((await forumService.getPost(topic.id)).viewCount).toBe(99);
  });

  it("paginates full reaction people, filters types and visible replies, and enforces topic privacy", async () => {
    const prisma = getPrisma();
    const topic = await forumService.createPost({ communityId, title: "Reaction people inspection", content: "Public reactions" }, authorId);
    postIds.push(topic.id);
    const visible = await forumService.addComment(topic.id, { content: "Visible response" }, responderId);
    const hidden = await forumService.addComment(topic.id, { content: "Moderated response" }, authorId);
    const users = await Promise.all(Array.from({ length: 7 }, (_, index) => prisma.user.create({ data: { email: `reactor-${index}-${marker}@example.test`, fullName: `Reaction reader ${index}` } })));
    try {
      await prisma.forumReaction.createMany({ data: [...users.map((user) => ({ userId: user.id, targetType: "post", targetId: topic.id, reaction: "LIKE" })), { userId: adminId, targetType: "post", targetId: topic.id, reaction: "AGREE" }, { userId: responderId, targetType: "comment", targetId: visible.id, reaction: "CURIOUS" }, { userId: authorId, targetType: "comment", targetId: hidden.id, reaction: "LOVE" }] });
      await forumService.moderateComment(hidden.id, "RESPONSE_HIDDEN", "Policy review", adminId, "admin");
      const all = await forumService.reactionPeople("topic", topic.publicSlug!, undefined);
      expect(all.meta.total).toBe(9);
      expect(all.counts).toMatchObject({ LIKE: 7, AGREE: 1, CURIOUS: 1, LOVE: 0 });
      expect(all.data.filter((person) => person.reaction === "LIKE")).toHaveLength(7);
      expect(JSON.stringify(all)).not.toMatch(/email|password|viewerKey/);
      const pages = await Promise.all([1, 2, 3].map((page) => forumService.reactionPeople("post", topic.id, "LIKE", page, 3)));
      expect(pages.map((page) => page.data.length)).toEqual([3, 3, 1]);
      expect(new Set(pages.flatMap((page) => page.data.map((row) => row.id))).size).toBe(7);
      expect(pages[0]!.meta).toMatchObject({ total: 7, totalPages: 3 });
      expect((await forumService.reactionPeople("comment", visible.id, undefined)).counts.CURIOUS).toBe(1);
      await expect(forumService.reactionPeople("comment", hidden.id, undefined)).rejects.toMatchObject({ statusCode: 404 });
      await prisma.community.update({ where: { id: communityId }, data: { visibility: "private" } });
      await expect(forumService.reactionPeople("topic", topic.id, undefined)).rejects.toMatchObject({ statusCode: 403 });
      await expect(forumService.recentViews(topic.publicSlug!)).rejects.toMatchObject({ statusCode: 403 });
      expect((await forumService.reactionPeople("topic", topic.id, undefined, 1, 20, authorId, "user")).meta.total).toBe(9);
      await forumService.moderatePost(topic.id, "THREAD_HIDDEN", "Policy review", adminId, "admin");
      await expect(forumService.recentViews(topic.id, adminId, "admin")).rejects.toMatchObject({ statusCode: 404 });
      await expect(forumService.reactionPeople("topic", topic.id, undefined, 1, 20, adminId, "admin")).rejects.toMatchObject({ statusCode: 404 });
    } finally {
      await prisma.community.update({ where: { id: communityId }, data: { visibility: "public" } });
      await prisma.forumReaction.deleteMany({ where: { userId: { in: users.map((user) => user.id) } } });
      await prisma.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
    }
  });

  it("excludes hidden/deleted replies, restores counts, and does not double-decrement a hidden deletion", async () => {
    const prisma = getPrisma();
    const topic = await forumService.createPost({ communityId, type: "QUESTION", title: `Visibility metrics ${marker}`, content: "Root is not a reply." }, authorId);
    postIds.push(topic.id);
    expect(topic.replyCount).toBe(0);
    const visible = await forumService.addComment(topic.id, { content: "Visible methodological response" }, responderId);
    const hidden = await forumService.addComment(topic.id, { content: "Another perspective" }, adminId);
    await forumService.acceptAnswer(topic.id, hidden.id, authorId);
    await forumService.moderateComment(hidden.id, "RESPONSE_HIDDEN", "Policy review", adminId, "admin");
    const beforeEdit = await forumService.getPost(topic.id);
    expect(beforeEdit).toMatchObject({ replyCount: 1, acceptedCommentId: undefined });
    expect(beforeEdit.participants.map((user) => user.id)).not.toContain(adminId);
    await forumService.updateComment(hidden.id, { content: "Edited while hidden" }, adminId);
    expect((await forumService.getPost(topic.id)).lastActivityAt).toEqual(beforeEdit.lastActivityAt);
    await forumService.moderateComment(hidden.id, "RESPONSE_RESTORED", undefined, adminId, "admin");
    expect((await forumService.getPost(topic.id)).replyCount).toBe(2);
    await forumService.moderateComment(hidden.id, "RESPONSE_HIDDEN", "Hide again", adminId, "admin");
    await forumService.deleteComment(hidden.id, adminId, "admin");
    expect((await prisma.forumPost.findUniqueOrThrow({ where: { id: topic.id } })).commentCount).toBe(1);
    await forumService.deleteComment(visible.id, responderId, "user");
    expect((await forumService.getPost(topic.id)).replyCount).toBe(0);
    const unanswered = await forumService.listPosts({ communityId, sort: "unanswered" }, 1, 100);
    expect(unanswered.data.some((post) => post.id === topic.id)).toBe(true);
    expect(unanswered.data.every((post) => post.replyCount === 0)).toBe(true);
  });

  it("sorts old topics by recent visible replies and edits, never by reply Helpful", async () => {
    const prisma = getPrisma();
    const old = await forumService.createPost({ communityId, title: `Activity sorting ${marker} older`, content: "Old root" }, authorId);
    const newer = await forumService.createPost({ communityId, title: `Activity sorting ${marker} newer`, content: "New root" }, authorId);
    postIds.push(old.id, newer.id);
    const past = new Date(Date.now() - 10 * 86400000);
    await prisma.forumPost.update({ where: { id: old.id }, data: { createdAt: past, lastActivityAt: past } });
    const reply = await forumService.addComment(old.id, { content: "New evidence on an older discussion" }, responderId);
    const list = () => forumService.listPosts({ query: `Activity sorting ${marker}` }, 1, 10);
    const before = (await list()).data;
    expect(before[0].id).toBe(old.id);
    await forumService.vote("comment", reply.id, 1, authorId, "user");
    const after = (await list()).data;
    expect(after.map((post) => post.id)).toEqual(before.map((post) => post.id));
    expect(after[0].lastActivityAt).toEqual(before[0].lastActivityAt);
    expect(after[0].helpfulCount).toBe(0);
    await forumService.updatePost(newer.id, { content: "Meaningful root revision" }, authorId);
    expect((await list()).data[0].id).toBe(newer.id);
  });

  it("resolves slug and legacy UUID community filters and composes every type with unanswered", async () => {
    const prisma = getPrisma();
    const community = await prisma.community.findUniqueOrThrow({ where: { id: communityId } });
    const query = `Sidebar types ${marker}`;
    const types = ["QUESTION", "DISCUSSION", "PAPER_DISCUSSION", "RESEARCH_GAP_DISCUSSION"] as const;
    const ids: string[] = [];
    for (const type of types) {
      const topic = await forumService.createPost({ communityId, type, title: `${query} ${type}`, content: "Opening topic, not a reply", linkedPaperId: type === "PAPER_DISCUSSION" ? paperId : undefined, linkedResearchGapId: type === "RESEARCH_GAP_DISCUSSION" ? gapId : undefined }, authorId);
      postIds.push(topic.id); ids.push(topic.id);
    }
    const byId = await forumService.listPosts({ communityId, query, sort: "unanswered" }, 1, 20);
    const bySlug = await forumService.listPosts({ communityId: community.slug, query, sort: "unanswered" }, 1, 20);
    expect(bySlug.data.map((post) => post.id)).toEqual(byId.data.map((post) => post.id));
    expect(bySlug.meta.total).toBe(4);
    for (const [index, type] of types.entries()) {
      const response = await forumService.listPosts({ communityId: community.slug, query, type, sort: "unanswered" }, 1, 10);
      expect(response.data.map((post) => post.id)).toEqual([ids[index]]);
    }
    const reply = await forumService.addComment(ids[1], { content: "Visible reply excludes a discussion too" }, responderId);
    expect((await forumService.listPosts({ communityId: community.slug, query, sort: "unanswered" }, 1, 20)).meta.total).toBe(3);
    await forumService.moderateComment(reply.id, "RESPONSE_HIDDEN", "Review visibility", adminId, "admin");
    expect((await forumService.listPosts({ communityId: community.slug, query, type: "DISCUSSION", sort: "unanswered" }, 1, 20)).data[0]).toMatchObject({ id: ids[1], replyCount: 0 });
    await expect(forumService.listPosts({ communityId: `missing-${marker}` }, 1, 20)).rejects.toMatchObject({ statusCode: 404 });
    await expect(forumService.listPosts({ communityId: "../private" }, 1, 20)).rejects.toMatchObject({ statusCode: 400 });
  });

  it("isolates persisted follows per user, with refresh, unfollow, filters and hidden-topic exclusion", async () => {
    const query = `Sidebar following ${marker}`;
    const first = await forumService.createPost({ communityId, type: "QUESTION", title: `${query} A`, content: "Question" }, authorId);
    const second = await forumService.createPost({ communityId, type: "DISCUSSION", title: `${query} B`, content: "Discussion" }, authorId);
    postIds.push(first.id, second.id);
    await forumService.follow(first.id, authorId, true);
    await forumService.follow(first.id, authorId, true);
    await forumService.follow(second.id, responderId, true);
    const filter = { communityId, query, sort: "following" as const };
    expect((await forumService.listPosts(filter, 1, 20, authorId, "user")).data.map((post) => post.id)).toEqual([first.id]);
    expect((await forumService.listPosts(filter, 1, 20, responderId, "user")).data.map((post) => post.id)).toEqual([second.id]);
    expect((await forumService.listPosts(filter, 1, 20)).data).toEqual([]);
    expect((await forumService.getPost(first.id, authorId, "user")).isFollowing).toBe(true);
    expect((await forumService.listPosts({ ...filter, type: "DISCUSSION" }, 1, 20, authorId, "user")).meta.total).toBe(0);
    await forumService.moderatePost(first.id, "THREAD_HIDDEN", "Visibility test", adminId, "admin");
    expect((await forumService.listPosts(filter, 1, 20, authorId, "user")).meta.total).toBe(0);
    await forumService.moderatePost(first.id, "THREAD_RESTORED", undefined, adminId, "admin");
    await forumService.follow(first.id, authorId, false);
    expect((await forumService.getPost(first.id, authorId, "user")).isFollowing).toBe(false);
    expect((await forumService.listPosts(filter, 1, 20, authorId, "user")).meta.total).toBe(0);
  });

  it("persists all notification levels per viewer and only sends the selected reply notifications", async () => {
    const prisma = getPrisma();
    const topic = await forumService.createPost({ communityId, type: "QUESTION", title: `Notification preferences ${marker}`, content: "A discussion for notification preferences" }, authorId);
    postIds.push(topic.id);
    const notifications = (userId: string) => prisma.notification.count({ where: { targetUuid: topic.id, userId } });
    const reply = await forumService.addComment(topic.id, { content: "A response to the opening post" }, responderId);
    await forumService.setNotificationLevel(topic.id, authorId, "MUTED");
    await forumService.setNotificationLevel(topic.id, responderId, "TRACKING");
    expect(await forumService.getPost(topic.id, authorId)).toMatchObject({ notificationLevel: "MUTED", isFollowing: false });
    expect(await forumService.getPost(topic.id, responderId)).toMatchObject({ notificationLevel: "TRACKING", isFollowing: true });
    const before = { author: await notifications(authorId), responder: await notifications(responderId) };
    await forumService.addComment(topic.id, { content: "An unrelated new response" }, authorId);
    expect(await notifications(responderId)).toBe(before.responder);
    await forumService.addComment(topic.id, { content: "A direct reply to the tracked participant", parentCommentId: reply.id }, authorId);
    expect(await notifications(responderId)).toBe(before.responder + 1);
    await forumService.addComment(topic.id, { content: "A response while the opening author is muted" }, responderId);
    expect(await notifications(authorId)).toBe(before.author);
    await forumService.setNotificationLevel(topic.id, responderId, "WATCHING");
    await forumService.addComment(topic.id, { content: "New activity for the watcher" }, authorId);
    expect(await notifications(responderId)).toBe(before.responder + 2);
    await forumService.setNotificationLevel(topic.id, responderId, "NORMAL");
    expect(await forumService.getPost(topic.id, responderId)).toMatchObject({ notificationLevel: "NORMAL", isFollowing: false });
    expect((await forumService.listPosts({ query: `Notification preferences ${marker}`, sort: "following" }, 1, 20, responderId)).meta.total).toBe(0);
    await forumService.setNotificationLevel(topic.id, responderId, "MUTED");
    const beforeAccepted = await notifications(responderId);
    await forumService.acceptAnswer(topic.id, reply.id, authorId, "user");
    expect(await notifications(responderId)).toBe(beforeAccepted);
    await expect(forumService.setNotificationLevel(topic.id, responderId, "INVALID" as "NORMAL")).rejects.toMatchObject({ statusCode: 400 });
    await forumService.moderatePost(topic.id, "THREAD_HIDDEN", "Testing notification access", adminId, "admin");
    await expect(forumService.setNotificationLevel(topic.id, responderId, "WATCHING")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("computes likes and reading time from all visible replies, including unloaded reply pages", async () => {
    const topic = await forumService.createPost({ communityId, type: "DISCUSSION", title: `Topic reading metrics ${marker}`, content: Array(440).fill("literature").join(" ") }, authorId);
    postIds.push(topic.id);
    const reply = await forumService.addComment(topic.id, { content: Array(220).fill("research").join(" ") }, responderId);
    await forumService.react("comment", reply.id, "LIKE", true, authorId, "user");
    expect(await forumService.getPost(topic.id)).toMatchObject({ readingTimeMinutes: 3, likeCount: 1 });
    await forumService.moderateComment(reply.id, "RESPONSE_HIDDEN", "Visibility for metrics", adminId, "admin");
    expect(await forumService.getPost(topic.id)).toMatchObject({ readingTimeMinutes: 2, likeCount: 0 });
  });

  it("does not leak private or archived communities through discovery, any feed, search or a slug", async () => {
    const prisma = getPrisma();
    const community = await prisma.community.findUniqueOrThrow({ where: { id: communityId } });
    const query = `Sidebar private ${marker}`;
    const topic = await forumService.createPost({ communityId, title: query, content: "Private scope" }, authorId);
    postIds.push(topic.id);
    await forumService.follow(topic.id, outsiderId, true);
    await prisma.community.update({ where: { id: communityId }, data: { visibility: "private" } });
    try {
      for (const sort of ["latest", "popular", "unanswered", "following"] as const) {
        expect((await forumService.listPosts({ query, sort }, 1, 20, outsiderId, "user")).data).toEqual([]);
        expect((await forumService.listPosts({ query, sort }, 1, 20)).data).toEqual([]);
      }
      await expect(forumService.listPosts({ communityId: community.slug }, 1, 20, outsiderId, "user")).rejects.toMatchObject({ statusCode: 403 });
      await expect(forumService.follow(topic.id, outsiderId, true)).rejects.toMatchObject({ statusCode: 403 });
      await expect(forumService.follow(topic.id, outsiderId, true, "admin")).resolves.toEqual({ following: true });
      expect((await listCommunities(undefined, 1, 100)).data.some((row) => row.id === communityId)).toBe(false);
      expect((await listCommunities(outsiderId, 1, 100, "user")).data.some((row) => row.id === communityId)).toBe(false);
      expect((await listCommunities(authorId, 1, 100, "user")).data.some((row) => row.id === communityId)).toBe(true);
      await prisma.community.update({ where: { id: communityId }, data: { status: "ARCHIVED" } });
      expect((await forumService.listPosts({ query }, 1, 20, authorId, "user")).data).toEqual([]);
      await expect(forumService.listPosts({ communityId: community.slug }, 1, 20, adminId, "admin")).rejects.toMatchObject({ statusCode: 404 });
      expect((await listCommunities(adminId, 1, 100, "admin", true)).data.some((row) => row.id === communityId)).toBe(false);
    } finally { await prisma.community.update({ where: { id: communityId }, data: { status: "ACTIVE", visibility: "public" } }); }
  });

  it("ranks Popular by existing engagement deterministically without evidence/confidence inputs", async () => {
    const prisma = getPrisma();
    const query = `Sidebar ranking ${marker}`;
    const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()].sort().reverse();
    const timestamp = new Date("2026-09-21T00:00:00Z");
    await prisma.forumPost.createMany({ data: ids.map((id, index) => ({ id, communityId, authorId, title: `${query} ${index}`, body: "Discovery only", voteScore: index === 2 ? 1 : 0, lastActivityAt: timestamp })) });
    postIds.push(...ids);
    const queries: string[] = [];
    const observed = prisma.$extends({ query: { $allModels: { async $allOperations({ model, args, query }) { queries.push(model); return query(args); } } } });
    const client = vi.spyOn(database, "getPrisma").mockReturnValue(observed as unknown as ReturnType<typeof getPrisma>);
    try {
      const popular = await forumService.listPosts({ query, sort: "popular" }, 1, 20);
      expect(popular.data.map((post) => post.id)).toEqual([ids[2], ids[0], ids[1]]);
      expect(queries).not.toContain("ResearchGap");
      expect(queries).not.toContain("GapEvidenceRecord");
    } finally { client.mockRestore(); }
  });

  it("deduplicates concurrent anonymous/authenticated opens and counts again after cooldown", async () => {
    const prisma = getPrisma();
    const topic = await forumService.createPost({ communityId, title: `View cooldown ${marker}`, content: "Server-controlled views" }, authorId);
    postIds.push(topic.id);
    const anonymousKey = `anon:${crypto.randomUUID()}`;
    await Promise.all(Array.from({ length: 8 }, () => forumService.getPost(topic.id, undefined, undefined, anonymousKey)));
    expect((await forumService.getPost(topic.id)).viewCount).toBe(1);
    await Promise.all(Array.from({ length: 8 }, () => forumService.getPost(topic.id, authorId, "user", "ignored-client-key")));
    expect((await forumService.getPost(topic.id)).viewCount).toBe(2);
    await prisma.forumPostView.update({ where: { postId_viewerKey: { postId: topic.id, viewerKey: anonymousKey } }, data: { viewedAt: new Date(Date.now() - (8 * 60 + 1) * 60000) } });
    await Promise.all(Array.from({ length: 8 }, () => forumService.getPost(topic.id, undefined, undefined, anonymousKey)));
    expect((await forumService.getPost(topic.id)).viewCount).toBe(3);
    expect((await forumService.recentViews(topic.id)).daily.at(-1)?.count).toBe(3);
    expect(await prisma.forumPostView.count({ where: { postId: topic.id } })).toBe(2);
  });

  it("does not expose or count unauthorized private and hidden topic reads", async () => {
    const prisma = getPrisma();
    const topic = await forumService.createPost({ communityId, title: `Private metrics ${marker}`, content: "Private root" }, authorId);
    postIds.push(topic.id);
    const reply = await forumService.addComment(topic.id, { content: "Private response history" }, responderId);
    await forumService.updatePost(topic.id, { content: "Updated private root" }, authorId);
    await forumService.updateComment(reply.id, { content: "Updated private reply" }, responderId);
    await prisma.community.update({ where: { id: communityId }, data: { visibility: "private" } });
    try {
      await expect(forumService.getPost(topic.id, undefined, undefined, "anon:forbidden")).rejects.toMatchObject({ statusCode: 403 });
      await expect(forumService.getPost(topic.id, outsiderId, "user", "user:forbidden")).rejects.toMatchObject({ statusCode: 403 });
      expect((await forumService.listPosts({ query: `Private metrics ${marker}` }, 1, 10)).data).toHaveLength(0);
      expect(await prisma.forumPostView.count({ where: { postId: topic.id } })).toBe(0);
      await expect(forumService.listPostRevisions(topic.id)).rejects.toMatchObject({ statusCode: 403 });
      await expect(forumService.listCommentRevisions(reply.id, outsiderId, "user")).rejects.toMatchObject({ statusCode: 403 });
      expect(await forumService.listCommentRevisions(reply.id, responderId, "user")).toHaveLength(1);
    } finally {
      await prisma.community.update({ where: { id: communityId }, data: { visibility: "public" } });
    }
    await forumService.moderatePost(topic.id, "THREAD_HIDDEN", "Policy review", adminId, "admin");
    await expect(forumService.getPost(topic.id, undefined, undefined, "anon:forbidden")).rejects.toMatchObject({ statusCode: 404 });
    expect((await prisma.forumPost.findUniqueOrThrow({ where: { id: topic.id } })).viewCount).toBe(0);
  });

  it("returns bounded, unique, recent participant previews without user secrets", async () => {
    const prisma = getPrisma();
    const topic = await forumService.createPost({ communityId, title: `Participant preview ${marker}`, content: "A broader discussion" }, authorId);
    postIds.push(topic.id);
    const users = await Promise.all(Array.from({ length: 6 }, (_, index) => prisma.user.create({ data: { email: `forum-participant-${index}-${marker}@example.test`, fullName: `Participant ${index}` } })));
    try {
      await prisma.forumComment.createMany({ data: users.map((user, index) => ({ postId: topic.id, postNumber: index + 2, authorId: user.id, body: "Methodological contribution", createdAt: new Date(Date.now() - (6 - index) * 60000) })) });
      await forumService.addComment(topic.id, { content: "Author clarification" }, authorId);
      const shown = await forumService.getPost(topic.id);
      expect(shown.participants.map((user) => user.id)).toEqual([authorId, ...users.slice(2).reverse().map((user) => user.id)]);
      expect(new Set(shown.participants.map((user) => user.id)).size).toBe(5);
      expect(shown.participantCount).toBe(7);
      for (const user of shown.participants) expect(Object.keys(user)).toEqual(["id", "fullName", "avatarUrl", "academicProfileType"]);
    } finally {
      await prisma.forumComment.deleteMany({ where: { postId: topic.id, authorId: { in: users.map((user) => user.id) } } });
      await prisma.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
    }
  });

  it("paginates tied topics deterministically with bounded HTTP queries and batched metrics", async () => {
    const prisma = getPrisma();
    const ids = Array.from({ length: 21 }, () => crypto.randomUUID());
    const timestamp = new Date("2026-09-01T00:00:00Z");
    const prefix = `Pagination ${marker}`;
    await prisma.forumPost.createMany({ data: ids.map((id, index) => ({ id, communityId, authorId, title: `${prefix} ${index}`, body: "Real paginated research question", type: index < 10 ? "QUESTION" : "DISCUSSION", createdAt: timestamp, lastActivityAt: timestamp })) });
    postIds.push(...ids);
    const sorted = [...ids].sort().reverse();
    // Observe queries through Prisma's supported extension API, not its proxy delegates.
    const queries: Array<{ model: string; operation: string; args: unknown }> = [];
    const observed = prisma.$extends({ query: { $allModels: { async $allOperations({ model, operation, args, query }) {
      queries.push({ model, operation, args }); return query(args);
    } } } });
    const client = vi.spyOn(database, "getPrisma").mockReturnValue(observed as unknown as ReturnType<typeof getPrisma>);
    try {
      const first = await forumService.listPosts({ query: prefix }, 1, 20);
      expect(first.meta).toEqual({ page: 1, pageSize: 20, total: 21, totalPages: 2 });
      expect(first.data.map((post) => post.id)).toEqual(sorted.slice(0, 20));
      expect(queries.filter((query) => query.model === "ForumComment" && query.operation === "groupBy")).toHaveLength(1);
      expect(queries.filter((query) => query.model === "User" && query.operation === "findMany")).toHaveLength(1);
      expect(queries.find((query) => query.model === "ForumPost" && query.operation === "findMany")?.args).toMatchObject({ skip: 0, take: 20, orderBy: expect.arrayContaining([{ id: "desc" }]) });
      const firstQueryCount = queries.length;
      queries.length = 0;
      const second = await forumService.listPosts({ query: prefix }, 2, 20);
      expect(second.data.map((post) => post.id)).toEqual(sorted.slice(20));
      expect(queries.filter((query) => query.model === "ForumComment" && query.operation === "groupBy")).toHaveLength(1);
      expect(queries.filter((query) => query.model === "User" && query.operation === "findMany")).toHaveLength(1);
      expect(queries.length).toBe(firstQueryCount);
      expect(queries.find((query) => query.model === "ForumPost" && query.operation === "findMany")?.args).toMatchObject({ skip: 20, take: 20 });
      expect((await forumService.listPosts({ query: prefix, sort: "popular" }, 1, 20)).data.map((post) => post.id)).toEqual(sorted.slice(0, 20));
      const filtered = await forumService.listPosts({ query: prefix, type: "QUESTION", communityId, sort: "unanswered" }, 1, 10);
      expect(filtered.meta.total).toBe(10);
      expect(filtered.data.every((post) => post.type === "QUESTION" && post.replyCount === 0)).toBe(true);
      const app = express(); app.use("/forum", forumRouter);
      app.use((error: { name?: string; statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => res.status(error.name === "ZodError" ? 400 : error.statusCode ?? 500).json({ success: false }));
      const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
      const address = server.address(); if (!address || typeof address === "string") throw new Error("Test server did not bind");
      const base = `http://127.0.0.1:${address.port}/forum/posts?query=${encodeURIComponent(prefix)}`;
      try {
        expect((await (await fetch(base)).json()).data).toHaveLength(20);
        for (const pageSize of [10, 20, 30]) expect((await (await fetch(`${base}&pageSize=${pageSize}`)).json()).meta.pageSize).toBe(pageSize);
        const response = await (await fetch(`${base}&page=2`)).json();
        expect(response.data.map((post: { id: string }) => post.id)).toEqual(sorted.slice(20));
        const community = await prisma.community.findUniqueOrThrow({ where: { id: communityId } });
        const composed = await (await fetch(`${base}&communityId=${community.slug}&type=QUESTION&feed=unanswered&pageSize=10`)).json();
        expect(composed.meta.total).toBe(10);
        expect(composed.data.every((post: { type: string; replyCount: number }) => post.type === "QUESTION" && post.replyCount === 0)).toBe(true);
        expect((await (await fetch(`${base}&feed=unanswered&type=DISCUSSION`)).json()).meta.total).toBe(11);
        expect((await fetch(`${base}&feed=invalid`)).status).toBe(400);
        expect((await fetch(`${base}&communityId=../../private`)).status).toBe(400);
        for (const invalid of ["pageSize=0", "pageSize=31", "pageSize=1000000", "page=0", "page=1.5", "page=Infinity", "page=1000001"]) expect((await fetch(`${base}&${invalid}`)).status).toBe(400);
        expect((await (await fetch(`${base}&page=999`)).json()).data).toEqual([]);
      } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
    } finally { client.mockRestore(); }
  });

  it("loads reply chunks in stable chronological order without separate reply documents", async () => {
    const prisma = getPrisma();
    const topic = await forumService.createPost({ communityId, title: `Continuous reading ${marker}`, content: "A longer discussion" }, authorId);
    postIds.push(topic.id);
    const ids = Array.from({ length: 26 }, () => crypto.randomUUID());
    const createdAt = new Date("2026-09-02T00:00:00Z");
    await prisma.forumComment.createMany({ data: [...ids].sort().map((id, index) => ({ id, postId: topic.id, postNumber: index + 2, authorId: responderId, body: "A chronological response", createdAt })) });
    const first = await forumService.listComments(topic.id, 1, 25);
    const next = await forumService.listComments(topic.id, 2, 25);
    expect(first.meta).toMatchObject({ pageSize: 25, total: 26, totalPages: 2 });
    expect([...first.data, ...next.data].map((comment) => comment.id)).toEqual([...ids].sort());
    expect(new Set([...first.data, ...next.data].map((comment) => comment.id)).size).toBe(26);
  });

  it("exposes real list metrics over HTTP and persists an anonymous HttpOnly view cookie", async () => {
    const topic = await forumService.createPost({ communityId, title: `HTTP metrics ${marker}`, content: "Real API contract" }, authorId);
    postIds.push(topic.id);
    const app = express();
    app.use("/forum", forumRouter);
    app.use((error: { name?: string; statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => res.status(error.name === "ZodError" ? 400 : error.statusCode ?? 500).json({ success: false }));
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind");
    const base = `http://127.0.0.1:${address.port}/forum/posts`;
    try {
      const listed = await (await fetch(`${base}?query=${encodeURIComponent(`HTTP metrics ${marker}`)}`)).json();
      expect(listed.data[0]).toMatchObject({ id: topic.id, replyCount: 0, helpfulCount: 0, viewCount: 0 });
      expect((await fetch(`${base}/${topic.id}/reactions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reaction: "LOVE", active: true }) })).status).toBe(401);
      expect(listed.data[0].lastActivityAt).toEqual(expect.any(String));
      expect(listed.data[0].participants[0]).toMatchObject({ id: authorId });
      const opened = await fetch(`${base}/${topic.id}`, { headers: { Origin: "not-a-valid-origin" } });
      expect(opened.status).toBe(200);
      const cookie = opened.headers.get("set-cookie")!;
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Lax");
      expect((await opened.json()).data.viewCount).toBe(1);
      const refreshed = await fetch(`${base}/${topic.id}`, { headers: { Cookie: cookie.split(";")[0] } });
      expect((await refreshed.json()).data.viewCount).toBe(1);
      const slugged = await fetch(`${base}/${topic.publicSlug}`, { headers: { Cookie: cookie.split(";")[0] } });
      expect(slugged.status).toBe(200);
      expect((await slugged.json()).data).toMatchObject({ id: topic.id, viewCount: 1 });
      const response = await forumService.addComment(topic.id, { content: "A reply reached through a readable URL" }, responderId);
      const replies = await fetch(`${base}/${topic.publicSlug}/comments`);
      expect(replies.status).toBe(200);
      expect((await replies.json()).data[0]).toMatchObject({ id: response.id, postId: topic.id });
      const discovery = await fetch(`${base}/${topic.publicSlug}/discovery`);
      expect(discovery.status).toBe(200);
      expect((await discovery.json()).data).toMatchObject({ related: expect.any(Array), suggested: expect.any(Array) });
      const views = await fetch(`${base}/${topic.publicSlug}/views`);
      expect(views.status).toBe(200);
      expect((await views.json()).data).toMatchObject({ cooldownHours: 8, daily: [expect.objectContaining({ count: 1 })] });
      expect((await (await fetch(`${base}/${topic.id}/reactions?scope=topic`)).json()).meta.total).toBe(0);
      for (const invalid of ["page=0", "pageSize=31", "scope=private", "reaction=UNKNOWN"]) expect((await fetch(`${base}/${topic.id}/reactions?${invalid}`)).status).toBe(400);
      expect((await forumService.getPost(topic.id)).viewCount).toBe(1);
      for (const invalid of ["bad_slug", "bad.slug", "a".repeat(281)]) {
        expect((await fetch(`${base}/${invalid}`)).status).toBe(400);
        expect((await fetch(`${base}/${invalid}/comments`)).status).toBe(400);
        expect((await fetch(`${base}/${invalid}/discovery`)).status).toBe(400);
      }
      // Slugs use exactly the same visibility boundary as UUIDs.
      await getPrisma().community.update({ where: { id: communityId }, data: { visibility: "private" } });
      try {
        for (const locator of [topic.id, topic.publicSlug]) {
          expect((await fetch(`${base}/${locator}`)).status).toBe(403);
          expect((await fetch(`${base}/${locator}/views`)).status).toBe(403);
          expect((await fetch(`${base}/${locator}/reactions?scope=topic`)).status).toBe(403);
          expect((await fetch(`${base}/${locator}/comments`)).status).toBe(403);
          expect((await fetch(`${base}/${locator}/discovery`)).status).toBe(403);
        }
      } finally { await getPrisma().community.update({ where: { id: communityId }, data: { visibility: "public" } }); }
      await forumService.moderatePost(topic.id, "THREAD_HIDDEN", "Policy review", adminId, "admin");
      expect((await fetch(`${base}/${topic.id}`, { headers: { Cookie: cookie.split(";")[0] } })).status).toBe(404);
      expect((await fetch(`${base}/${topic.publicSlug}`)).status).toBe(404);
      expect((await fetch(`${base}/${topic.publicSlug}/comments`)).status).toBe(404);
      expect((await fetch(`${base}/${topic.publicSlug}/discovery`)).status).toBe(404);
      expect((await getPrisma().forumPost.findUniqueOrThrow({ where: { id: topic.id } })).viewCount).toBe(1);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
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
    expect(await forumService.listPostRevisions(discussion.id)).toMatchObject([{ revision: 1, title: "Editable discussion", content: "Original body", tags: ["original"] }]);
    expect(await forumService.listCommentRevisions(response.id, outsiderId, "user")).toMatchObject([{ revision: 1, content: "Original response" }]);
    await forumService.updateComment(response.id, { content: "Second edit" }, responderId);
    expect(await forumService.listCommentRevisions(response.id)).toMatchObject([{ revision: 2, content: "Edited response" }, { revision: 1, content: "Original response" }]);

    await expect(forumService.deleteComment(response.id, outsiderId, "user")).rejects.toMatchObject({ statusCode: 403 });
    await forumService.deleteComment(response.id, responderId, "user");
    const removedResponse = (await forumService.listComments(discussion.id, 1, 20, authorId, "user")).data.find((comment) => comment.id === response.id);
    expect(removedResponse).toMatchObject({ status: "deleted", content: "This response was removed by its author." });
    await expect(forumService.listCommentRevisions(response.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(forumService.listCommentRevisions(response.id, authorId, "user")).rejects.toMatchObject({ statusCode: 404 });
    expect(await forumService.listCommentRevisions(response.id, responderId, "user")).toHaveLength(2);
    expect(await forumService.listCommentRevisions(response.id, adminId, "admin")).toHaveLength(2);

    await forumService.deletePost(discussion.id, authorId, "user");
    const removedDiscussion = await forumService.getPost(discussion.id, authorId, "user");
    expect(removedDiscussion).toMatchObject({ status: "deleted", title: "This discussion was removed by its author.", content: "" });
    await expect(forumService.listPostRevisions(discussion.id, outsiderId, "user")).rejects.toMatchObject({ statusCode: 404 });
    expect(await forumService.listPostRevisions(discussion.id, authorId, "user")).toHaveLength(1);
    const visible = await getPrisma().forumComment.update({ where: { id: response.id }, data: { status: "active" } });
    expect(await forumService.listCommentRevisions(visible.id)).toHaveLength(2);
  });

  it("keeps post numbers stable across moderation and allocates concurrent replies without reuse", async () => {
    const topic = await forumService.createPost({ communityId, title: `Stable numbers ${marker}`, content: "Opening post" }, authorId);
    postIds.push(topic.id);
    const first = await forumService.addComment(topic.id, { content: "Original hidden reply", references: [{ paperId }] }, responderId);
    const second = await forumService.addComment(topic.id, { content: "Later reply https://example.test/method" }, authorId);
    expect([first.postNumber, second.postNumber]).toEqual([2, 3]);
    await forumService.react("comment", first.id, "LOVE", true, authorId, "user");
    await forumService.react("comment", second.id, "INSIGHTFUL", true, responderId, "user");
    expect(await forumService.getPost(topic.id)).toMatchObject({ reactionCount: 2, linkCount: 2, participantCount: 2 });
    await forumService.updateComment(first.id, { content: "Edited hidden reply" }, responderId);
    await forumService.moderateComment(first.id, "RESPONSE_HIDDEN", undefined, adminId, "admin");
    expect((await forumService.listComments(topic.id, 1, 25)).data.map((row) => row.postNumber)).toEqual([3]);
    expect(await forumService.getPost(topic.id)).toMatchObject({ reactionCount: 1, linkCount: 1, participantCount: 1 });
    await expect(forumService.listCommentRevisions(first.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(forumService.listCommentRevisions(first.id, authorId, "user")).rejects.toMatchObject({ statusCode: 404 });
    expect(await forumService.listCommentRevisions(first.id, responderId, "user")).toMatchObject([{ content: "Original hidden reply" }]);
    expect(await forumService.listCommentRevisions(first.id, adminId, "admin")).toHaveLength(1);
    await forumService.deleteComment(second.id, authorId, "user");
    const concurrent = await Promise.all([
      forumService.addComment(topic.id, { content: "Concurrent A" }, responderId),
      forumService.addComment(topic.id, { content: "Concurrent B" }, authorId),
    ]);
    expect(concurrent.map((row) => row.postNumber).sort()).toEqual([4, 5]);
    await forumService.moderateComment(first.id, "RESPONSE_RESTORED", undefined, adminId, "admin");
    expect((await forumService.listComments(topic.id, 1, 25)).data.map((row) => row.postNumber)).toEqual([2, 3, 4, 5]);
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
