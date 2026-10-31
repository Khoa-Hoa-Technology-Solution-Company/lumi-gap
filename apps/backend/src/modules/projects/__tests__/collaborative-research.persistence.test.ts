import { screeningService as currentScreening } from "../screening.service.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import { once } from "node:events";
import { createServer } from "node:http";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { projectService } from "../project.service.js";
import { projectSourcesService as sources } from "../project-sources.service.js";
import { projectScreeningService as screening } from "../project-screening.service.js";
import { projectEvidenceService as evidence } from "../project-evidence.service.js";
import { projectGapResearchService as gaps } from "../project-gap-research.service.js";
import { projectPlanService as plans } from "../project-plan.service.js";
import { projectPlanDraftService } from "../project-plan-draft.service.js";
import { gapValidationService } from "../../gaps/gap-validation.service.js";
import { projectDiscussionsService as discussions } from "../project-discussions.service.js";
import { projectTasksService as tasks } from "../project-tasks.service.js";
import { projectOverviewService as overview } from "../project-overview.service.js";
import { canDeliverWorkspaceNotification } from "../workspace-notification-access.js";
import { projectRouter } from "../project.routes.js";
import { errorHandler } from "../../../common/middleware/error-handler.js";
import { hashOpaqueToken, tokenService } from "../../auth/token.service.js";
import { createEvidenceSchema, importPaperSchema } from "../dto/project-research.schema.js";

const isolated = (process.env.SCREENING_INTEGRATION === "1" && new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) || (process.env.MENTOR_ACCESS_INTEGRATION === "1" && /^postgres(?:ql)?:\/\/[^/]+@(127\.0\.0\.1|localhost):[0-9]+\/lumigap_mentor_access_v1_test(?:\?|$)/.test(process.env.DATABASE_URL ?? "")) || process.env.PROJECT_SLICE_TEST === "1" && process.env.DATABASE_URL?.includes("127.0.0.1:15439/lumigap_project_slice_test") && process.env.REDIS_URL === "redis://127.0.0.1:16389";
describe.skipIf(!isolated).sequential("collaborative research workflow, disposable PostgreSQL", () => {
  const db = getPrisma(), marker = crypto.randomUUID(), users: string[] = [], projects: string[] = [], papers: string[] = [];
  let owner: string, member: string, outsider: string, mentor: string, expert: string;
  const page = { page: 1, pageSize: 20, q: "" };
  const extraction = () => ({ claim: "Interviews found different transfer outcomes", quotation: "Different transfer outcomes were reported.", locator: "Abstract", context: "University students", methodology: "Interviews", population: "24 students", results: "Mixed outcomes", limitations: "Single institution", themes: ["transfer"], origin: "HUMAN" as const, clientKey: crypto.randomUUID() });
  async function person(name: string) {
    const user = await db.user.create({ data: { email: `research-${name}-${marker}@example.org`, fullName: name, emailVerifiedAt: new Date(), onboardingCompletedAt: new Date() } }); users.push(user.id);
    await db.academicProfile.create({ data: { userId: user.id, primaryPosition: "RESEARCH_STAFF", academicRole: "RESEARCHER", roleVerificationStatus: "SELF_DECLARED", positionStatus: "NOT_SUBMITTED" } }); return user.id;
  }
  async function project() {
    const p = await projectService.createProject({ title: `Research ${marker}`, description: "A research workflow", idempotencyKey: crypto.randomUUID() }, owner); projects.push(p._id);
    const invitation = await projectService.inviteMember(p._id, { userId: member }, owner); await projectService.respondToInvitation(p._id, invitation.id, member, "ACCEPTED"); return p._id;
  }
  async function source(id: string, include = true) {
    const result = await sources.import(id, owner, { title: `Study ${crypto.randomUUID()}`, authors: ["Research Author"], reference: "Team reference", abstractText: "Different transfer outcomes were reported.", clientKey: crypto.randomUUID() }); papers.push(result.paperId);
    if (include) { const link = await db.projectPaper.findUniqueOrThrow({ where: { projectId_paperId: { projectId: id, paperId: result.paperId } } }); await db.projectPaper.update({ where: { id: link.id }, data: { screeningStatus: "INCLUDED", inclusionReason: "Legacy relevant study" } }); }
    return result.paperId;
  }
  async function candidate(projectId: string) {
    return gapValidationService.createCandidate(owner, { projectId, topic: "Transfer outcomes", title: "Transfer across contexts", gapType: "CONTEXT_GAP", establishedKnowledge: "Transfer varies across contexts", observedLimitation: "Most studies use a single institution", missingEvidence: "Cross-institution replication is missing", significanceExplanation: "Scope may explain contradictory results", gapConfidence: "LOW", researchPriority: "MODERATE" });
  }
  async function accepted(projectId: string, paperId: string) { const row = await evidence.create(projectId, member, { ...extraction(), paperId }); return evidence.review(projectId, owner, row.id, { expectedVersion: row.version, state: "ACCEPTED", rationale: "Compared interpretation with the source" }); }
  async function explicitPlan(id: string) { const view = await plans.get(id, owner); await projectPlanDraftService.snapshot(id, owner, { expectedVersion: view.version, clientKey: crypto.randomUUID(), changeSummary: "Explicit sharing checkpoint" }); return plans.get(id, owner); }
  beforeAll(async () => { owner = await person("owner"); member = await person("member"); outsider = await person("outsider"); mentor = await person("mentor"); expert = await person("expert"); await db.userCapability.create({ data: { userId: expert, capability: "GAP_VALIDATION", status: "ACTIVE", source: "TEST" } }); });
  afterAll(async () => {
    if (process.env.SCREENING_INTEGRATION === "1") return;
    await db.gapValidation.deleteMany({ where: { reviewerId: { in: users } } });
    await db.gapEvidenceRecord.deleteMany({ where: { addedById: { in: users } } });
    await db.projectPaperFile.deleteMany({ where: { projectId: { in: projects } } });
    await db.projectScreeningDecision.deleteMany({ where: { projectId: { in: projects } } });
    await db.projectEvidenceItem.deleteMany({ where: { projectId: { in: projects } } });
    await db.researchGap.deleteMany({ where: { projectId: { in: projects } } });
    await db.literatureCorpus.deleteMany({ where: { projectId: { in: projects } } });
    await db.project.deleteMany({ where: { id: { in: projects } } });
    const authorIds = (await db.paperAuthor.findMany({ where: { paperId: { in: papers } }, select: { authorId: true } })).map(row => row.authorId);
    await db.paperAuthor.deleteMany({ where: { paperId: { in: papers } } });
    await db.paper.deleteMany({ where: { id: { in: papers } } });
    await db.author.deleteMany({ where: { id: { in: authorIds } } });
    await db.notification.deleteMany({ where: { userId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
  });
  it("imports DOI references once, preserves absent metadata, retries safely and never merges title-only identities", async () => {
    const id = await project(), input = { title: "Reference without invented dates", doi: `10.1234/${marker}`, authors: ["Research Author"], reference: "Batch one", clientKey: crypto.randomUUID() };
    const rows = await Promise.all([sources.import(id, owner, input), sources.import(id, owner, input)]); papers.push(rows[0]!.paperId);
    expect(rows[0]!.paperId).toBe(rows[1]!.paperId); expect((await sources.import(id, member, { ...input, clientKey: crypto.randomUUID() })).paperId).toBe(rows[0]!.paperId);
    expect((await screening.library(id, member, page)).items[0]?.publicationYear).toBeNull();
    await expect(sources.import(id, owner, { ...input, title: "Another title" })).rejects.toMatchObject({ statusCode: 409 });
    const noDoi = { ...input, doi: undefined, clientKey: crypto.randomUUID() }; const first = await sources.import(id, owner, noDoi), second = await sources.import(id, owner, { ...noDoi, clientKey: crypto.randomUUID() }); papers.push(first.paperId, second.paperId); expect(first.paperId).not.toBe(second.paperId);
    expect(importPaperSchema.safeParse({ ...input, publicationYear: 0 }).success).toBe(false);
    expect(importPaperSchema.safeParse({ ...input, paperLink: "javascript:alert(1)" }).success).toBe(false);
    expect((await screening.library(id, owner, page)).items.every(item => item.authors.includes("Research Author"))).toBe(true);
  });
  it("scopes private PDF bytes, deduplicates uploads and blocks invalid files and referenced removal", async () => {
    const id = await project(), paperId = await source(id), pdf = Buffer.from("%PDF-1.4\nprivate research file\n%%EOF");
    const uploaded = await sources.upload(id, member, paperId, pdf); expect((await sources.upload(id, owner, paperId, pdf)).id).toBe(uploaded.id);
    expect(Buffer.from((await sources.file(id, owner, uploaded.id)).content)).toEqual(pdf);
    await expect(sources.file(id, outsider, uploaded.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(sources.file(await project(), owner, uploaded.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(sources.upload(id, owner, paperId, Buffer.from("not a PDF"))).rejects.toThrow();
    expect((await db.paper.findUniqueOrThrow({ where: { id: paperId } })).pdfPath).toBeNull();
    await expect(projectService.removePaperFromProject(id, paperId, owner)).rejects.toMatchObject({ statusCode: 409 });
  });
  it("blocks direct legacy decisions while keeping notes and version protection", async () => {
    const id = await project(), paperId = await source(id, false), link = await db.projectPaper.findUniqueOrThrow({ where: { projectId_paperId: { projectId: id, paperId } } });
    await expect(projectService.updateProjectPaper(id, paperId, { screeningStatus: "MAYBE", expectedUpdatedAt: link.updatedAt.toISOString() }, owner)).rejects.toMatchObject({ statusCode: 409 });
    await projectService.updateProjectPaper(id, paperId, { notes: "Still assessing eligibility", expectedUpdatedAt: link.updatedAt.toISOString() }, owner);
    await expect(projectService.updateProjectPaper(id, paperId, { notes: "Stale note", expectedUpdatedAt: link.updatedAt.toISOString() }, owner)).rejects.toMatchObject({ statusCode: 409 });
    expect((await screening.library(id, owner, page)).items[0]?.screeningStatus).toBe("UNDECIDED");
    await expect(evidence.create(id, owner, { ...extraction(), paperId })).rejects.toMatchObject({ statusCode: 400 });
  });
  it("keeps blinded votes separate, identifies conflicts, resolves explicitly and rejects policy bypass", async () => {
    const id = await project(), paperId = await source(id, false), p = await db.project.findUniqueOrThrow({ where: { id } });
    await screening.policy(id, owner, { mode: "INDEPENDENT", blinded: true, expectedVersion: p.version });
    let item = (await screening.library(id, owner, page)).items[0]!;
    await screening.assign(id, owner, paperId, { reviewerIds: [owner, member], phase: "TITLE_ABSTRACT", expectedUpdatedAt: new Date(item.updatedAt).toISOString() });
    await screening.vote(id, owner, paperId, { phase: "TITLE_ABSTRACT", decision: "INCLUDED", reason: "Relevant setting", expectedVersion: 1 });
    item = (await screening.library(id, member, page)).items[0]!; expect(item.hiddenVotes).toBe(true); expect(item.votes.every(vote => vote.reviewerId === member)).toBe(true);
    expect((await screening.history(id, member, paperId)).every(row => (row.snapshot as { reviewerId?: string }).reviewerId === member)).toBe(true);
    await expect(projectService.updateProjectPaper(id, paperId, { screeningStatus: "INCLUDED", expectedUpdatedAt: new Date(item.updatedAt).toISOString() }, owner)).rejects.toMatchObject({ statusCode: 409 });
    await screening.vote(id, member, paperId, { phase: "TITLE_ABSTRACT", decision: "EXCLUDED", reason: "Population differs", expectedVersion: 1 });
    item = (await screening.library(id, owner, page)).items[0]!; expect(item.conflict).toBe(true); expect(item.screeningStatus).toBe("UNDECIDED");
    await expect(screening.resolve(id, member, paperId, { phase: "TITLE_ABSTRACT", decision: "INCLUDED", reason: "Team discussed it", expectedUpdatedAt: new Date(item.updatedAt).toISOString() })).rejects.toMatchObject({ statusCode: 403 });
    await expect(screening.resolve(id, owner, paperId, { phase: "TITLE_ABSTRACT", decision: "INCLUDED", reason: "We retain it for context comparison", expectedUpdatedAt: new Date(item.updatedAt).toISOString() })).rejects.toMatchObject({ statusCode: 409 });
    expect((await screening.library(id, owner, page)).items[0]?.screeningStatus).toBe("UNDECIDED");
    await screening.vote(id, member, paperId, { phase: "TITLE_ABSTRACT", decision: "MAYBE", reason: "Need full text", expectedVersion: 2 });
    expect((await screening.library(id, owner, page)).items[0]?.screeningStatus).toBe("UNDECIDED");
    expect((await screening.history(id, member, paperId)).length).toBeGreaterThanOrEqual(3);
  });
  it("revokes independent assignments on member removal and never restores old votes on rejoining", async () => {
    const id = await project(), paperId = await source(id, false), projectRow = await db.project.findUniqueOrThrow({ where: { id } });
    await screening.policy(id, owner, { mode: "INDEPENDENT", blinded: true, expectedVersion: projectRow.version });
    const currentSource = async () => (await screening.library(id, owner, page)).items[0]!;
    await screening.assign(id, owner, paperId, { reviewerIds: [owner, member], phase: "TITLE_ABSTRACT", expectedUpdatedAt: new Date((await currentSource()).updatedAt).toISOString() });
    await screening.vote(id, member, paperId, { phase: "TITLE_ABSTRACT", decision: "INCLUDED", reason: "Matches the research scope", expectedVersion: 1 });
    await projectService.removeMemberFromProject(id, member, owner);
    const revoked = await db.projectScreeningDecision.findUniqueOrThrow({ where: { projectId_paperId_reviewerId_phase: { projectId: id, paperId, reviewerId: member, phase: "TITLE_ABSTRACT" } } });
    expect(revoked).toMatchObject({ assigned: false, version: 3 });
    const invitation = await projectService.inviteMember(id, { userId: member }, owner); await projectService.respondToInvitation(id, invitation.id, member, "ACCEPTED");
    expect((await screening.library(id, member, page)).items[0]?.votes).toEqual([]);
    await expect(screening.vote(id, member, paperId, { phase: "TITLE_ABSTRACT", decision: "INCLUDED", reason: "An old vote must not return", expectedVersion: 2 })).rejects.toMatchObject({ statusCode: 403 });
    await screening.assign(id, owner, paperId, { reviewerIds: [owner, member], phase: "TITLE_ABSTRACT", expectedUpdatedAt: new Date((await currentSource()).updatedAt).toISOString() });
    const rejoined = (await screening.library(id, member, page)).items[0]!.votes.find(vote => vote.reviewerId === member)!;
    expect(rejoined).toMatchObject({ decision: "UNDECIDED", version: 4 });
    expect((await screening.history(id, member, paperId)).some(row => (row.snapshot as { assigned?: boolean }).assigned === false)).toBe(true);
    await expect(screening.vote(id, member, paperId, { phase: "TITLE_ABSTRACT", decision: "INCLUDED", reason: "Stale editor", expectedVersion: 2 })).rejects.toMatchObject({ statusCode: 409 });
  });
  it("preserves origin, pending review and immutable source snapshots, with concurrent edit protection", async () => {
    const id = await project(), paperId = await source(id), input = { ...extraction(), paperId };
    const row = await evidence.create(id, member, input); expect(row.reviewState).toBe("PENDING"); expect(row.sourceSnapshot).toMatchObject({ quoteCheckedAgainstIndexedSource: true });
    expect((await evidence.create(id, member, input)).id).toBe(row.id);
    await expect(evidence.create(id, member, { ...input, claim: "Changed retry" })).rejects.toMatchObject({ statusCode: 409 });
    const acceptedRow = await evidence.review(id, owner, row.id, { state: "ACCEPTED", rationale: "Read the source", expectedVersion: 1 });
    const { origin: _o, clientKey: _k, paperId: _p, ...content } = input;
    const results = await Promise.allSettled([evidence.update(id, owner, row.id, { ...content, claim: "First interpretation", expectedVersion: acceptedRow.version }), evidence.update(id, member, row.id, { ...content, claim: "Second interpretation", expectedVersion: acceptedRow.version })]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const next = (await evidence.list(id, owner, page)).items[0]!; expect(next.reviewState).toBe("PENDING"); expect(next.origin).toBe("HUMAN");
    expect((await evidence.history(id, owner, row.id)).length).toBe(3);
    await expect(db.projectWorkspaceRevision.updateMany({ where: { entityId: row.id }, data: { actorId: outsider } })).rejects.toThrow();
    expect(createEvidenceSchema.safeParse({ ...input, reviewState: "ACCEPTED" }).success).toBe(false);
  });
  it("adopts corpus suggestions without trusting them, retains the original proposal and rejects cross-project provenance", async () => {
    const id = await project(), paperId = await source(id), corpus = await db.literatureCorpus.create({ data: { ownerId: owner, projectId: id, name: "Existing extraction", topic: "Transfer" } });
    const cp = await db.corpusPaper.create({ data: { corpusId: corpus.id, paperId, addedById: owner, included: true, evidence: { findings: "An unverified model interpretation", methodology: "Interviews" } } });
    const suggestion = (await evidence.suggestions(id, member, paperId))[0]!;
    const row = await evidence.create(id, member, { ...extraction(), ...suggestion.content, paperId, origin: "AI_SUGGESTED", corpusPaperId: cp.id });
    expect(row.reviewState).toBe("PENDING"); expect(row.sourceSnapshot).toMatchObject({ originalSuggestion: { findings: "An unverified model interpretation" } });
    await expect(evidence.create(id, owner, { ...extraction(), paperId, origin: "AI_SUGGESTED" })).rejects.toMatchObject({ statusCode: 400 });
    const other = await project(); await db.projectPaper.create({ data: { projectId: other, paperId, addedById: owner } }); const link = await db.projectPaper.findUniqueOrThrow({ where: { projectId_paperId: { projectId: other, paperId } } }); await db.projectPaper.update({ where: { id: link.id }, data: { screeningStatus: "INCLUDED" } });
    await expect(evidence.create(other, owner, { ...extraction(), paperId, origin: "AI_SUGGESTED", corpusPaperId: cp.id })).rejects.toMatchObject({ statusCode: 400 });
  });
  it("connects structured and legacy evidence to tasks, discussions and focused views without crossing project boundaries", async () => {
    const id = await project(), other = await project(), paperId = await source(id), item = await accepted(id, paperId), gap = await candidate(id);
    const alias = await gaps.link(id, owner, gap.id, { evidenceItemId: item.id, expectedEvidenceVersion: item.version, expectedVersion: gap.version, kind: "SUPPORTING", explanation: "Relevant finding" });
    const legacy = await db.gapEvidenceRecord.create({ data: { gapId: gap.id, paperId, addedById: owner, evidenceKind: "COUNTER", explanation: "Original contrary result", evidenceType: "LEGACY" } });
    const choices = await overview.artifacts(id, member, "EVIDENCE", "");
    expect(choices.map(row => row.id)).toEqual(expect.arrayContaining([item.id, legacy.id])); expect(choices.map(row => row.id)).not.toContain(alias.id);
    expect(await overview.artifacts(other, owner, "EVIDENCE", "")).toEqual([]);
    expect((await evidence.list(id, member, { ...page, itemId: item.id })).items[0]).toMatchObject({ id: item.id, relatedGaps: [{ id: gap.id, title: gap.title }] });
    expect((await evidence.list(id, member, { ...page, itemId: alias.id })).items[0]?.id).toBe(item.id);
    expect(await evidence.list(id, member, { ...page, itemId: legacy.id })).toMatchObject({ items: [], legacyGapId: gap.id });
    const task = { title: "Check the extraction", description: "Read the original source", status: "TODO" as const, assigneeId: member, dueAt: null, milestoneId: null, blockedReason: "", link: { kind: "EVIDENCE" as const, id: item.id }, clientKey: crypto.randomUUID() };
    const saved = await tasks.save(id, owner, task); expect((await tasks.detail(id, member, saved.id, page)).task.link).toEqual(task.link);
    const thread = { title: "Compare the extraction", body: "How does its context affect transfer?", category: "EVIDENCE" as const, mentorRelationshipId: null, link: task.link, clientKey: crypto.randomUUID(), mentions: [] };
    const discussion = await discussions.save(id, member, thread); expect((await discussions.detail(id, owner, discussion.id, page)).thread.link).toEqual(task.link);
    for (const foreignId of [item.id, alias.id, legacy.id, crypto.randomUUID()]) await expect(evidence.list(other, owner, { ...page, itemId: foreignId })).rejects.toMatchObject({ statusCode: 404 });
    await expect(tasks.save(other, owner, { ...task, assigneeId: null, clientKey: crypto.randomUUID() })).rejects.toMatchObject({ statusCode: 400 });
    await expect(discussions.save(other, owner, { ...thread, clientKey: crypto.randomUUID() })).rejects.toMatchObject({ statusCode: 400 });
  });
  it("links supporting and contrary accepted revisions and pins derived questions without rewriting evidence", async () => {
    const id = await project(), paperId = await source(id), support = await accepted(id, paperId), counter = await accepted(id, paperId), gap = await candidate(id);
    await expect(gaps.assess(id, owner, gap.id, { status: "TEAM_SUPPORTED", rationale: "We agree", expectedVersion: 1 })).rejects.toMatchObject({ statusCode: 400 });
    await gaps.link(id, member, gap.id, { evidenceItemId: support.id, expectedEvidenceVersion: support.version, expectedVersion: 1, kind: "SUPPORTING", explanation: "Single-context finding motivates replication" });
    await gaps.link(id, owner, gap.id, { evidenceItemId: counter.id, expectedEvidenceVersion: counter.version, expectedVersion: 2, kind: "COUNTER", explanation: "This result limits the scope of the claim" });
    await gaps.assess(id, member, gap.id, { status: "TEAM_SUPPORTED", rationale: "A bounded replication question is justified", expectedVersion: 3 });
    const plan = await plans.get(id, owner), input = { text: "Do the reported outcomes transfer across institutions?", expectedVersion: 4, expectedPlanVersion: plan.version, clientKey: crypto.randomUUID() };
    const question = await gaps.derive(id, member, gap.id, input); expect((await gaps.derive(id, member, gap.id, input)).questionId).toBe(question.questionId);
    const current = await plans.get(id, owner); expect(current.content.questions[0]).toMatchObject({ sourceGapId: gap.id, sourceGapVersion: 4 }); expect(current.content.questions[0]?.sourceEvidenceRevisionIds).toHaveLength(2);
    expect((await gaps.detail(id, owner, gap.id)).evidence.every(item => item.reviewed && !item.sourceChanged)).toBe(true);
    const { origin: _origin, clientKey: _key, ...updatedContent } = extraction();
    await evidence.update(id, owner, support.id, { ...updatedContent, expectedVersion: support.version });
    const changed = await gaps.detail(id, member, gap.id); expect(changed.gap.assessmentStatus).toBe("NEEDS_MORE_EVIDENCE"); expect(changed.evidence.some(item => item.sourceChanged)).toBe(true);
    expect((await plans.get(id, owner)).content.questions[0]?.sourceGapVersion).toBe(4);
    await expect(gaps.derive(id, owner, gap.id, { ...input, expectedVersion: changed.gap.version, expectedPlanVersion: current.version, clientKey: crypto.randomUUID() })).rejects.toThrow();
  });
  it("invalidates expert packets on source changes and counts only current-revision expert decisions", async () => {
    const id = await project(), paperId = await source(id), item = await accepted(id, paperId), gap = await candidate(id);
    await gaps.link(id, owner, gap.id, { evidenceItemId: item.id, expectedEvidenceVersion: item.version, expectedVersion: 1, kind: "SUPPORTING", explanation: "Relevant limitation" });
    await gapValidationService.requestValidation(gap.id, owner);
    await gapValidationService.addValidation(gap.id, expert, { action: "VALIDATE", comment: "Scope and sources were reviewed", expectedVersion: 2 });
    await gaps.revise(id, member, gap.id, { title: "A narrower claim", description: "A revised research limitation", rationale: "Restrict to institutions studied", scope: "Universities", assumptions: "Comparable measures", expectedVersion: 2 });
    await gapValidationService.requestValidation(gap.id, owner);
    const queue = await gapValidationService.listValidationQueue(expert, { page: 1, pageSize: 50 }); const queued = queue.items.find(item => item.id === gap.id)!; expect(queued.validationCount).toBe(0); expect(queued.reviewedByMe).toBe(false);
    await expect(gapValidationService.addValidation(gap.id, expert, { action: "VALIDATE", comment: "Stale packet evaluation", expectedVersion: 2 })).rejects.toMatchObject({ statusCode: 409 });
    const old = (await gapValidationService.getValidations(gap.id, owner))[0]!; expect(old.gapVersion).toBe(2);
    const started = await currentScreening.start(id, owner, { paperIds: [paperId], phase: "TITLE_ABSTRACT", confirmRescreen: true, clientKey: crypto.randomUUID() });
    const roundId = started.roundIds![0]!;
    await currentScreening.assign(id, owner, { roundIds: [roundId], mode: "MANUAL", reviewerIds: [member], dueAt: null, clientKey: crypto.randomUUID() });
    const assigned = await currentScreening.detail(id, member, roundId);
    await currentScreening.submit(id, member, roundId, { assignmentId: assigned.myAssignmentId!, expectedRevision: 1, decision: "EXCLUDE", exclusionReason: "Scope changed", comment: "New evidence excludes this study", confirmed: true, clientKey: crypto.randomUUID() });
    const ready = await currentScreening.detail(id, owner, roundId);
    await currentScreening.resolve(id, owner, roundId, { expectedVersion: ready.version, decision: "EXCLUDED", reason: "Scope changed after reassessing the source", confirmed: true, clientKey: crypto.randomUUID() });
    expect((await gaps.detail(id, owner, gap.id)).gap.validationStatus).toBe("CANDIDATE");
  });
  it("enforces signed HTTP sessions, project boundaries and private PDF responses", async () => {
    const id = await project(), paperId = await source(id), file = await sources.upload(id, owner, paperId, Buffer.from("%PDF-1.4\nprivate\n%%EOF"));
    const app = express(); app.use(express.json()); app.use("/api/v1/projects", projectRouter); app.use(errorHandler); const server = createServer(app); server.listen(0, "127.0.0.1"); await once(server, "listening");
    const address = server.address(); if (!address || typeof address === "string") throw new Error("No server");
    const familyId = crypto.randomUUID(); await db.refreshToken.create({ data: { userId: member, familyId, tokenHash: hashOpaqueToken(crypto.randomUUID()), expiresAt: new Date(Date.now() + 60000) } });
    const token = tokenService.signAccessToken({ sub: member, systemRole: "USER", sessionId: familyId }).token, origin = `http://127.0.0.1:${address.port}/api/v1/projects/${id}/research`;
    try { expect((await fetch(`${origin}/papers`)).status).toBe(401); const response = await fetch(`${origin}/files/${file.id}`, { headers: { authorization: `Bearer ${token}` } }); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store"); expect(response.headers.get("content-disposition")).toContain("attachment"); expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      const invalid = await fetch(`${origin}/evidence`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ ...extraction(), paperId, reviewState: "ACCEPTED" }) }); expect(invalid.status).toBe(400);
      await projectService.removeMemberFromProject(id, member, owner); expect((await fetch(`${origin}/papers`, { headers: { authorization: `Bearer ${token}` } })).status).toBe(404);
    } finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  });
  it("denies legacy mentor research access while preserving team research and archived reads", async () => {
    const id = await project(), paperId = await source(id), gap = await candidate(id);
    await db.academicProfile.update({ where: { userId: mentor }, data: { primaryPosition: "LECTURER", academicRole: "LECTURER", roleVerificationStatus: "VERIFIED", positionStatus: "VERIFIED", supportAvailability: { enabled: true } } });
    const request = await db.mentorshipRequest.create({ data: { projectId: id, mentorUserId: mentor, requestedBy: owner, direction: "PROJECT_TO_LECTURER", status: "ACCEPTED", expiresAt: new Date(Date.now() + 86400000) } });
    const relation = await db.mentorRelationship.create({ data: { projectId: id, mentorUserId: mentor, sourceRequestId: request.id } });
    const plan = await explicitPlan(id);
    await db.planShare.create({ data: { projectId: id, revisionId: plan.currentRevisionId!, relationshipId: relation.id, sharedById: owner } });
    await expect(plans.get(id, mentor)).rejects.toMatchObject({ statusCode: 404 });
    await expect(gaps.detail(id, mentor, gap.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(gaps.guidance(id, mentor, gap.id, { note: "Legacy guidance", expectedVersion: gap.version, clientKey: crypto.randomUUID() })).rejects.toMatchObject({ statusCode: 404 });
    expect(await canDeliverWorkspaceNotification({ type: "PROJECT_WORKSPACE_GAP_GUIDANCE", targetUuid: id, userId: mentor })).toBe(false);
    expect((await gaps.detail(id, owner, gap.id)).canRequestExpertReview).toBe(true);
    for (const actor of [mentor, outsider]) await expect(evidence.create(id, actor, { ...extraction(), paperId })).rejects.toMatchObject({ statusCode: 404 });
    await expect(gaps.detail(await project(), owner, gap.id)).rejects.toMatchObject({ statusCode: 404 });
    await projectService.archiveProject(id, owner);
    await expect(sources.import(id, owner, { title: "Archived import", authors: [], reference: "", clientKey: crypto.randomUUID() })).rejects.toMatchObject({ statusCode: 409 });
    await expect(evidence.create(id, owner, { ...extraction(), paperId })).rejects.toMatchObject({ statusCode: 409 });
    expect((await screening.library(id, owner, page)).items).toHaveLength(1);
  });
});
