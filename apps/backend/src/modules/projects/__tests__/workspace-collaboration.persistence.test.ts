import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SaveResearchPlan, SaveWorkspaceTask } from "@trend/shared-types";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { projectService } from "../project.service.js";
import { projectPlanService as plans } from "../project-plan.service.js";
import { projectPlanDraftService } from "../project-plan-draft.service.js";
import { projectTasksService as tasks } from "../project-tasks.service.js";
import { projectDiscussionsService as threads } from "../project-discussions.service.js";
import { projectOverviewService as overview } from "../project-overview.service.js";
import { projectTeamChatService } from "../project-team-chat.service.js";
import { projectChatService } from "../project-chat.service.js";
import { projectTeamChatEventHub } from "../project-team-chat.events.js";
import { projectChatEventHub } from "../project-chat.events.js";
import { getLlmProvider } from "../../llm/llm.factory.js";
import { creditService } from "../../credits/credit.service.js";
import { workspaceService } from "../../workspaces/workspace.service.js";
import * as membershipAccess from "../../authorization/project-membership.js";
import { canDeliverWorkspaceNotification } from "../workspace-notification-access.js";
import { literatureService } from "../../literature/literature.service.js";
import { gapValidationService } from "../../gaps/gap-validation.service.js";
import express from "express";
import { once } from "node:events";
import { createServer } from "node:http";
import { projectRouter } from "../project.routes.js";
import { errorHandler } from "../../../common/middleware/error-handler.js";
import { hashOpaqueToken, tokenService } from "../../auth/token.service.js";

const isolated = process.env.PROJECT_SLICE_TEST === "1" && process.env.DATABASE_URL?.includes("127.0.0.1:15439/lumigap_project_slice_test") && process.env.REDIS_URL === "redis://127.0.0.1:16389";
describe.skipIf(!isolated).sequential("workspace collaboration (disposable PostgreSQL)", () => {
  const db = getPrisma(), marker = crypto.randomUUID(), users: string[] = [], projects: string[] = [];
  const page = { page: 1, pageSize: 20 };
  let owner: string, member: string, outsider: string, mentor: string;
  async function person(name: string, lecturer = false) {
    const user = await db.user.create({ data: { email: `workspace-${name}-${marker}@example.org`, fullName: name, emailVerifiedAt: new Date(), onboardingCompletedAt: new Date() } }); users.push(user.id);
    await db.academicProfile.create({ data: { userId: user.id, primaryPosition: lecturer ? "LECTURER" : "RESEARCH_STAFF", academicRole: lecturer ? "LECTURER" : "RESEARCHER", roleVerificationStatus: lecturer ? "VERIFIED" : "SELF_DECLARED", positionStatus: lecturer ? "VERIFIED" : "NOT_SUBMITTED", supportAvailability: { enabled: true } } }); return user.id;
  }
  async function project(join = true) {
    const row = await projectService.createProject({ title: `Workspace ${marker}`, description: "Private research problem", idempotencyKey: crypto.randomUUID() }, owner); projects.push(row._id);
    if (join) { const invite = await projectService.inviteMember(row._id, { userId: member }, owner); await projectService.respondToInvitation(row._id, invite.id, member, "ACCEPTED"); }
    return row._id;
  }
  async function relation(projectId: string) {
    const request = await db.mentorshipRequest.create({ data: { projectId, mentorUserId: mentor, requestedBy: owner, direction: "PROJECT_TO_LECTURER", status: "ACCEPTED", expiresAt: new Date(Date.now() + 86400000) } });
    return db.mentorRelationship.create({ data: { projectId, mentorUserId: mentor, sourceRequestId: request.id } });
  }
  const taskInput = (change: Partial<SaveWorkspaceTask> = {}) => ({ title: "Read the first paper", description: "Compare the method and population", status: "TODO" as const, assigneeId: member, dueAt: null, milestoneId: null, blockedReason: "", link: null, ...change, clientKey: crypto.randomUUID() });
  async function planInput(id: string): Promise<SaveResearchPlan> { const view = await plans.get(id, owner); return { ...view.content, expectedVersion: view.version, changeSummary: "Refine the research direction" }; }
  async function explicitPlan(id: string) { const view = await plans.get(id, owner); await projectPlanDraftService.snapshot(id, owner, { expectedVersion: view.version, clientKey: crypto.randomUUID(), changeSummary: "Explicit sharing checkpoint" }); return plans.get(id, owner); }
  beforeAll(async () => { owner = await person("owner"); member = await person("member"); outsider = await person("outsider"); mentor = await person("mentor", true); });
  afterAll(async () => {
    await db.notification.deleteMany({ where: { userId: { in: users } } });
    await db.gapEvidenceRecord.deleteMany({ where: { addedById: { in: users } } });
    await db.researchGap.deleteMany({ where: { userId: { in: users } } });
    await db.literatureCorpus.deleteMany({ where: { ownerId: { in: users } } });
    await db.project.deleteMany({ where: { id: { in: projects } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
  });
  it("opens a factual overview and empty working plan with independent stage", async () => {
    const id = await project(), data = await overview.get(id, member);
    expect(data.project.researchStage).toBe("DISCOVERY"); expect(data.progress).toEqual({ papers: 0, pendingScreening: 0, included: 0, evidence: 0, gaps: 0, questions: 0 });
    expect(data.attention).toEqual({ overdueTasks: 0, blockedTasks: 0, mentorQuestions: 0, mentorFeedback: 0, reviewResponses: 0 }); expect(data.myTasks).toEqual([]); expect(data.plan.problem).toBe("");
    expect((await plans.revisions(id, owner, page)).items).toHaveLength(0);
    await expect(overview.stage(id, member, { stage: "WRITING", expectedVersion: data.project.version })).rejects.toMatchObject({ statusCode: 403 });
    await overview.stage(id, owner, { stage: "WRITING", expectedVersion: data.project.version });
    expect((await db.project.findUniqueOrThrow({ where: { id } })).status).toBe("PLANNING");
  });
  it("denies outsiders all private coordination resources", async () => {
    const id = await project();
    for (const call of [() => overview.get(id, outsider), () => plans.get(id, outsider), () => tasks.list(id, outsider, page), () => threads.list(id, outsider, page), () => threads.decisions(id, outsider, page)]) await expect(call()).rejects.toMatchObject({ statusCode: 404 });
  });
  it("enforces signed sessions, DTO validation, membership removal and version conflicts through actual HTTP routes", async () => {
    const id = await project(), app = express(); app.use(express.json()); app.use("/api/v1/projects", projectRouter); app.use(errorHandler);
    const server = createServer(app); server.listen(0, "127.0.0.1"); await once(server, "listening");
    const address = server.address(); if (!address || typeof address === "string") throw new Error("HTTP test server failed");
    const origin = `http://127.0.0.1:${address.port}/api/v1/projects/${id}`;
    async function session(userId: string) {
      const sessionId = crypto.randomUUID();
      await db.refreshToken.create({ data: { userId, familyId: sessionId, tokenHash: hashOpaqueToken(crypto.randomUUID()), expiresAt: new Date(Date.now() + 60000) } });
      return { sessionId, token: tokenService.signAccessToken({ sub: userId, systemRole: "USER", sessionId }).token };
    }
    async function request(path: string, token?: string, body?: unknown) { return fetch(origin + path, { method: body ? "PUT" : "GET", headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
    try {
      const ownerSession = await session(owner), memberSession = await session(member), outsiderSession = await session(outsider);
      expect((await request("/workspace")).status).toBe(401);
      expect((await request("/workspace", "forged-token")).status).toBe(401);
      expect((await request("/plan", outsiderSession.token)).status).toBe(404);
      const response = await request("/plan", memberSession.token); expect(response.status).toBe(200);
      const view = await response.json() as { success: boolean; data: { version: number; content: SaveResearchPlan } }; expect(view.success).toBe(true);
      expect((await request("/plan", ownerSession.token, { expectedVersion: view.data.version, problem: "Invalid incomplete DTO" })).status).toBe(400);
      const input = { ...view.data.content, expectedVersion: view.data.version, problem: "Saved through authenticated HTTP", changeSummary: "HTTP integration" };
      expect((await request("/plan", memberSession.token, input)).status).toBe(200);
      expect((await request("/plan", ownerSession.token, { ...input, problem: "Stale owner draft" })).status).toBe(409);
      await projectService.removeMemberFromProject(id, member, owner);
      expect((await request("/plan", memberSession.token)).status).toBe(404);
      await db.refreshToken.updateMany({ where: { familyId: ownerSession.sessionId }, data: { revokedAt: new Date() } });
      expect((await request("/workspace", ownerSession.token)).status).toBe(401);
    } finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  });
  it("keeps partial drafts, questions and hidden approach fields across reloads", async () => {
    const id = await project(), input = await planInput(id); input.methodology = "Exploratory interviews"; input.searchStrategy = "Database terms"; input.questions = [{ id: crypto.randomUUID(), text: "Which methods transfer?" }];
    await plans.save(id, member, input); const current = await plans.get(id, owner);
    await plans.save(id, member, { ...current.content, expectedVersion: current.version, approach: "EMPIRICAL", changeSummary: "Choose empirical methods" });
    const reloaded = await plans.get(id, member); expect(reloaded.content).toMatchObject({ methodology: input.methodology, searchStrategy: input.searchStrategy, questions: input.questions, approach: "EMPIRICAL" });
    expect((await plans.revisions(id, member, page)).total).toBe(3);
    await plans.save(id, member, { ...reloaded.content, expectedVersion: reloaded.version, changeSummary: "No actual change" }); expect((await plans.revisions(id, owner, page)).total).toBe(3);
  });
  it("serializes conflicting plan edits and records only one winner", async () => {
    const id = await project(), input = await planInput(id);
    const result = await Promise.allSettled([plans.save(id, owner, { ...input, problem: "A" }), plans.save(id, member, { ...input, problem: "B" })]);
    expect(result.filter(row => row.status === "fulfilled")).toHaveLength(1); expect((await plans.revisions(id, member, page)).total).toBe(2);
    await expect(db.planRevision.updateMany({ where: { projectId: id }, data: { changeSummary: "rewrite" } })).rejects.toThrow();
  });
  it("updates canonical criteria and approach without an automatic snapshot", async () => {
    const id = await project(); await projectService.updateProject(id, { inclusionCriteria: ["Adults"], researchApproach: "LITERATURE_REVIEW" }, owner);
    const current = await plans.get(id, member); expect(current.content.inclusionCriteria).toEqual(["Adults"]); expect(current.content.approach).toBe("LITERATURE_REVIEW"); expect((await plans.revisions(id, owner, page)).total).toBe(0);
  });
  it("creates one task under concurrent retries, assigns current team, persists completion and reopening", async () => {
    const id = await project(), input = taskInput(); const rows = await Promise.all([tasks.save(id, owner, input), tasks.save(id, owner, input)]);
    expect(rows[0]!.id).toBe(rows[1]!.id); const task = (await tasks.detail(id, member, rows[0]!.id, page)).task;
    expect(task.assignee?.id).toBe(member); expect((await tasks.list(id, member, { ...page, mine: "1" })).total).toBe(1); expect((await tasks.list(id, owner, { ...page, mine: "1" })).total).toBe(0);
    const { clientKey: _key, ...fields } = input; await tasks.save(id, member, { ...fields, status: "DONE", expectedVersion: 1 }, task.id);
    const done = await tasks.detail(id, owner, task.id, page); expect(done.task.completedAt).toBeTruthy();
    await tasks.save(id, member, { ...fields, status: "IN_PROGRESS", expectedVersion: 2 }, task.id);
    const reopened = await tasks.detail(id, member, task.id, page); expect(reopened.task.completedAt).toBeNull(); expect(reopened.history.items.some(row => row.snapshot.status === "DONE" && row.snapshot.completedAt)).toBe(true);
    expect(await db.notification.count({ where: { userId: member, eventKey: { startsWith: `WORKSPACE:ASSIGNMENT:${task.id}:` } } })).toBe(1);
  });
  it("rejects outsider or mentor assignment and requires blocked reason", async () => {
    const id = await project(); await relation(id);
    for (const assigneeId of [outsider, mentor]) await expect(tasks.save(id, owner, taskInput({ assigneeId }))).rejects.toMatchObject({ statusCode: 400 });
    await expect(tasks.save(id, owner, taskInput({ status: "BLOCKED" }))).rejects.toMatchObject({ statusCode: 400 });
    expect(await db.projectTask.count({ where: { projectId: id } })).toBe(0);
  });
  it("rejects changed task/discussion retry payloads and recognizes the original request after edits", async () => {
    const id = await project(), input = taskInput(), task = await tasks.save(id, owner, input);
    await expect(tasks.save(id, owner, { ...input, title: "A different task" })).rejects.toMatchObject({ statusCode: 409 });
    await tasks.save(id, member, { ...input, title: "Collaborator's change", expectedVersion: 1 }, task.id);
    expect((await tasks.save(id, owner, input)).id).toBe(task.id);
    const question = { title: "Methods", body: "Compare the methods", category: "GENERAL" as const, mentorRelationshipId: null, link: null, clientKey: crypto.randomUUID(), mentions: [member] };
    const thread = await threads.save(id, owner, question);
    await expect(threads.save(id, owner, { ...question, body: "Different question" })).rejects.toMatchObject({ statusCode: 409 });
    await expect(threads.save(id, owner, { ...question, mentions: [] })).rejects.toMatchObject({ statusCode: 409 });
    expect((await threads.save(id, owner, question)).id).toBe(thread.id);
  });
  it("rejects stale screening and notes and preserves decision rationales in activity history", async () => {
    const id = await project(), paper = await db.paper.create({ data: { title: `Screening ${marker}`, publicationYear: 2026, primaryProvider: "user", dataStatus: "active" } });
    await projectService.addPaperToProject(id, paper.id, member);
    const before = await db.projectPaper.findUniqueOrThrow({ where: { projectId_paperId: { projectId: id, paperId: paper.id } } });
    const results = await Promise.allSettled([
      projectService.updateProjectPaper(id, paper.id, { screeningStatus: "INCLUDED", inclusionReason: "Relevant population", expectedUpdatedAt: before.updatedAt.toISOString() }, owner),
      projectService.updateProjectPaper(id, paper.id, { screeningStatus: "EXCLUDED", exclusionReason: "WRONG_RESEARCH_TOPIC", expectedUpdatedAt: before.updatedAt.toISOString() }, member),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    await expect(projectService.updateProjectPaper(id, paper.id, { notes: "Stale notes", expectedUpdatedAt: before.updatedAt.toISOString() }, member)).rejects.toMatchObject({ statusCode: 409 });
    const live = await db.projectPaper.findUniqueOrThrow({ where: { id: before.id } });
    await projectService.updateProjectPaper(id, paper.id, { screeningStatus: "EXCLUDED", exclusionReason: "OTHER", exclusionNote: "Outside our scope", expectedUpdatedAt: live.updatedAt.toISOString() }, member);
    const changed = await db.projectPaper.findUniqueOrThrow({ where: { id: before.id } });
    await projectService.updateProjectPaper(id, paper.id, { exclusionNote: "Updated rationale", expectedUpdatedAt: changed.updatedAt.toISOString() }, owner);
    const events = await db.projectActivity.findMany({ where: { projectId: id, type: "PAPER_SCREENED" }, orderBy: { createdAt: "asc" } });
    expect(events).toHaveLength(3); expect(events[2]!.metadata).toMatchObject({ before: { exclusionNote: "Outside our scope" }, after: { exclusionNote: "Updated rationale" } });
  });
  it("keeps project corpus, evidence links and revoked creator access consistent", async () => {
    const id = await project(), paper = await db.paper.create({ data: { title: `Source ${marker}`, publicationYear: 2026, primaryProvider: "user", dataStatus: "active" } });
    const corpus = await literatureService.create(member, { projectId: id, name: "Study collection", topic: "Evidence" });
    await literatureService.addPaper(corpus.id, member, { paperId: paper.id, included: true, evidence: { findings: "Reported finding" } });
    await projectService.addPaperToProject(id, paper.id, member); await projectService.updateProjectPaper(id, paper.id, { screeningStatus: "INCLUDED" }, member);
    const candidate = await gapValidationService.createCandidate(member, { corpusId: corpus.id, topic: "Evidence", title: "Unanswered question", gapType: "EMPIRICAL", establishedKnowledge: "Known", observedLimitation: "Small study", missingEvidence: "Replication", significanceExplanation: "Needs more study", gapConfidence: "LOW", researchPriority: "MODERATE" });
    expect(candidate.projectId).toBe(id);
    await expect(gapValidationService.requestValidation(candidate.id, member)).rejects.toMatchObject({ statusCode: 403 });
    await gapValidationService.addEvidence(candidate.id, owner, { paperId: paper.id, evidenceKind: "SUPPORTING", evidenceType: "FINDING", excerpt: "Reported finding", explanation: "The finding motivates a candidate, not a conclusion" });
    const evidence = await db.gapEvidenceRecord.findFirstOrThrow({ where: { gapId: candidate.id } });
    const input = await planInput(id), question = { id: crypto.randomUUID(), text: "Can the finding be replicated?", sourceGapId: candidate.id, evidenceIds: [evidence.id] };
    await expect(plans.save(await project(), owner, { ...input, questions: [question] })).rejects.toMatchObject({ statusCode: 400 });
    await expect(plans.save(id, member, { ...input, questions: [{ ...question, evidenceIds: [crypto.randomUUID()] }] })).rejects.toMatchObject({ statusCode: 400 });
    await expect(plans.save(id, member, { ...input, questions: [{ id: question.id, text: question.text, evidenceIds: [evidence.id] }] })).rejects.toMatchObject({ statusCode: 400 });
    await plans.save(id, member, { ...input, questions: [question] });
    expect((await plans.get(id, owner)).content.questions).toEqual([question]);
    expect((await plans.revisions(id, owner, page)).items[0]!.content.questions).toEqual([question]);
    await expect(projectService.removePaperFromProject(id, paper.id, member)).rejects.toMatchObject({ statusCode: 409 });
    await expect(literatureService.removePaper(corpus.id, paper.id, member)).rejects.toMatchObject({ statusCode: 409 });
    await projectService.removeMemberFromProject(id, member, owner);
    await expect(gapValidationService.getEvidence(candidate.id, member)).rejects.toMatchObject({ statusCode: 404 });
    await expect(gapValidationService.addEvidence(candidate.id, member, { paperId: paper.id, evidenceKind: "COUNTER", evidenceType: "FINDING", excerpt: "Reported finding", explanation: "Unauthorized" })).rejects.toMatchObject({ statusCode: 404 });
    await expect(gapValidationService.createCandidate(member, { corpusId: corpus.id, topic: "No", title: "No", gapType: "OTHER", establishedKnowledge: "No", observedLimitation: "No", missingEvidence: "No", significanceExplanation: "No", gapConfidence: "LOW", researchPriority: "LOW" })).rejects.toMatchObject({ statusCode: 403 });
    await projectService.archiveProject(id, owner);
    await expect(literatureService.addPaper(corpus.id, owner, { paperId: paper.id, included: true })).rejects.toMatchObject({ statusCode: 409 });
    await expect(literatureService.removePaper(corpus.id, paper.id, owner)).rejects.toMatchObject({ statusCode: 409 });
    await expect(gapValidationService.requestValidation(candidate.id, owner)).rejects.toMatchObject({ statusCode: 409 });
  });
  it("rejects cross-project artifact, milestone, task and discussion references", async () => {
    const a = await project(), b = await project(), otherPlan = await explicitPlan(b), milestone = await tasks.saveMilestone(b, owner, { title: "Other project", description: "", dueAt: null, status: "PLANNED" });
    const otherTask = await tasks.save(b, owner, taskInput()); const otherThread = await threads.save(b, owner, { title: "Other thread", body: "Private", category: "GENERAL", link: null, mentorRelationshipId: null, clientKey: crypto.randomUUID(), mentions: [] });
    for (const kind of ["PAPER", "SCREENING", "EVIDENCE", "GAP", "QUESTION", "MANUSCRIPT", "REVIEW_REQUEST", "REPORT"] as const) await expect(tasks.save(a, owner, taskInput({ link: { kind, id: crypto.randomUUID() } }))).rejects.toMatchObject({ statusCode: 400 });
    await expect(tasks.save(a, owner, taskInput({ link: { kind: "PLAN_REVISION", id: otherPlan.currentRevisionId! } }))).rejects.toMatchObject({ statusCode: 400 });
    await expect(tasks.save(a, owner, taskInput({ milestoneId: milestone.id }))).rejects.toMatchObject({ statusCode: 400 });
    await expect(tasks.detail(a, member, otherTask.id, page)).rejects.toMatchObject({ statusCode: 404 });
    await expect(threads.detail(a, member, otherThread.id, page)).rejects.toMatchObject({ statusCode: 404 });
    await expect(threads.saveDecision(a, member, { decision: "Bad link", context: "", alternatives: "", rationale: "Reason", link: null, threadId: otherThread.id })).rejects.toMatchObject({ statusCode: 404 });
    await expect(db.projectTask.create({ data: { projectId: a, title: "DB scope", createdById: owner, clientKey: crypto.randomUUID(), milestoneId: milestone.id } })).rejects.toThrow();
  });
  it("links actual current questions, plans and associated milestones", async () => {
    const id = await project(), input = await planInput(id), question = { id: crypto.randomUUID(), text: "Which data is needed?" }; await plans.save(id, owner, { ...input, questions: [question] });
    const milestone = await tasks.saveMilestone(id, member, { title: "Finish initial screening", description: "Review the first corpus", dueAt: new Date(Date.now() + 86400000).toISOString(), status: "PLANNED" });
    const task = await tasks.save(id, owner, taskInput({ milestoneId: milestone.id, link: { kind: "QUESTION", id: question.id } }));
    const linkedPlan = await plans.get(id, owner);
    await expect(plans.save(id, member, { ...linkedPlan.content, questions: [], expectedVersion: linkedPlan.version, changeSummary: "Remove linked question" })).rejects.toMatchObject({ statusCode: 409 });
    expect((await plans.get(id, owner)).content.questions).toEqual([question]);
    expect((await tasks.detail(id, member, task.id, page)).task.milestoneId).toBe(milestone.id); expect((await overview.get(id, member)).nextMilestone?.id).toBe(milestone.id);
    await tasks.saveMilestone(id, owner, { title: milestone.title, description: milestone.description, dueAt: new Date(Date.now() + 172800000).toISOString(), status: "COMPLETE", expectedVersion: 1 }, milestone.id);
    const data = await overview.get(id, member); expect(data.project.researchStage).toBe("DISCOVERY"); expect(data.nextMilestone).toBeNull();
    expect(await db.notification.count({ where: { userId: member, eventKey: { startsWith: `WORKSPACE:MILESTONE:${milestone.id}:` } } })).toBe(1);
  });
  it("keeps task deletion restricted and retains its immutable history", async () => {
    const id = await project(), task = await tasks.save(id, owner, taskInput());
    await expect(tasks.remove(id, member, task.id, 1)).rejects.toMatchObject({ statusCode: 403 }); await tasks.remove(id, owner, task.id, 1);
    expect((await tasks.list(id, owner, page)).total).toBe(0); expect(await db.projectWorkspaceRevision.count({ where: { entityKind: "TASK", entityId: task.id } })).toBe(2);
    await expect(tasks.detail(id, member, task.id, page)).rejects.toMatchObject({ statusCode: 404 }); await expect(projectService.deleteProject(id, owner)).rejects.toMatchObject({ statusCode: 409 });
  });
  it("stores discussion replies in existing messages and preserves general chat IDs and reads", async () => {
    const id = await project(), general = await db.projectTeamMessage.create({ data: { projectId: id, senderId: owner, content: "Existing general chat" } });
    const input = { title: "Compare study methods", body: "Which method fits?", category: "RESEARCH_QUESTION" as const, link: null, mentorRelationshipId: null, clientKey: crypto.randomUUID(), mentions: [] };
    const results = await Promise.all([threads.save(id, member, input), threads.save(id, member, input)]); expect(results[0]!.id).toBe(results[1]!.id); const thread = results[0]!;
    const message = { body: "<script>alert(1)</script> is literal research text", clientKey: crypto.randomUUID(), mentions: [owner], replyToId: null };
    const replies = await Promise.all([threads.reply(id, member, thread.id, message), threads.reply(id, member, thread.id, message)]); expect(replies[0]!.id).toBe(replies[1]!.id);
    const loaded = await threads.detail(id, owner, thread.id, page); expect(loaded.messages.total).toBe(1); expect(loaded.messages.items[0]!.body).toBe(message.body); expect(await db.projectTeamMessageRead.count({ where: { messageId: replies[0]!.id } })).toBe(2);
    const legacy = await projectTeamChatService.listMessages(id, owner, { limit: 50 }); expect(legacy.map(row => row.id)).toEqual([general.id]);
    await expect(projectTeamChatService.markRead(id, replies[0]!.id, owner)).rejects.toMatchObject({ statusCode: 404 }); await expect(projectTeamChatService.deleteMessage(id, replies[0]!.id, owner)).rejects.toMatchObject({ statusCode: 404 });
    await expect(threads.resolve(id, owner, thread.id, { status: "RESOLVED", conclusion: "", expectedVersion: 1 })).rejects.toMatchObject({ statusCode: 400 });
    await threads.resolve(id, owner, thread.id, { status: "RESOLVED", conclusion: "Use a comparative study", expectedVersion: 1 });
    await expect(threads.reply(id, member, thread.id, { ...message, clientKey: crypto.randomUUID() })).rejects.toMatchObject({ statusCode: 409 });
    await threads.resolve(id, member, thread.id, { status: "OPEN", conclusion: "Use a comparative study", expectedVersion: 2 }); expect((await threads.history(id, owner, "DISCUSSION", thread.id, page)).total).toBe(3);
  });
  it("records decision provenance and revisions without converting discussion activity into a decision", async () => {
    const id = await project(), thread = await threads.save(id, owner, { title: "Decision needed", body: "Which population?", category: "DECISION_NEEDED", link: null, mentorRelationshipId: null, clientKey: crypto.randomUUID(), mentions: [] });
    expect((await threads.decisions(id, owner, page)).total).toBe(0);
    const input = { decision: "Include adult participants", context: "Question scope", alternatives: "All ages", rationale: "Comparable cohorts", link: null, threadId: thread.id };
    const decision = await threads.saveDecision(id, member, input); await threads.saveDecision(id, owner, { ...input, rationale: "Comparable cohorts and available evidence", expectedVersion: 1 }, decision.id);
    const current = (await threads.decisions(id, member, page)).items[0]!; expect(current.recordedBy.id).toBe(member); expect(current.version).toBe(2); expect(current.threadId).toBe(thread.id);
    const history = await threads.history(id, owner, "DECISION", decision.id, page); expect(history.items[0]!.actor.id).toBe(owner); expect(history.items[1]!.snapshot.rationale).toBe("Comparable cohorts");
    await expect(db.projectWorkspaceRevision.updateMany({ where: { entityId: decision.id }, data: { version: 10 } })).rejects.toThrow();
  });
  it("pins mentor access to shared revisions and exact approved discussions", async () => {
    const id = await project(), rel = await relation(id), plan = await explicitPlan(id);
    await expect(plans.get(id, mentor)).rejects.toMatchObject({ statusCode: 404 });
    await expect(plans.share(id, member, { revisionId: plan.currentRevisionId!, relationshipId: rel.id })).rejects.toMatchObject({ statusCode: 403 });
    const share = await plans.share(id, owner, { revisionId: plan.currentRevisionId!, relationshipId: rel.id }); const mentorView = await plans.get(id, mentor); expect(mentorView).toMatchObject({ access: "MENTOR", canEdit: false, canShare: false });
    await plans.save(id, member, { ...await planInput(id), problem: "New private revision" }); expect((await plans.get(id, mentor)).content.problem).toBe("");
    await expect(plans.save(id, mentor, await planInput(id))).rejects.toMatchObject({ statusCode: 404 }); await expect(tasks.list(id, mentor, page)).rejects.toMatchObject({ statusCode: 404 }); await expect(threads.decisions(id, mentor, page)).rejects.toMatchObject({ statusCode: 404 });
    const shared = await threads.save(id, owner, { title: "Mentor question", body: "Please review this approved plan", category: "MENTOR_QUESTION", link: { kind: "PLAN_REVISION", id: plan.currentRevisionId! }, mentorRelationshipId: rel.id, clientKey: crypto.randomUUID(), mentions: [] });
    const notice = await db.notification.findFirstOrThrow({ where: { type: "PROJECT_WORKSPACE_MENTOR_QUESTION", targetUuid: id } });
    expect(await canDeliverWorkspaceNotification(notice)).toBe(true);
    expect(notice.message).not.toContain("Please review this approved plan");
    await threads.save(id, member, { title: "Team-only conversation", body: "Private", category: "GENERAL", link: null, mentorRelationshipId: null, clientKey: crypto.randomUUID(), mentions: [] });
    expect((await threads.list(id, mentor, page)).items.map(row => row.id)).toEqual([shared.id]);
    await threads.reply(id, mentor, shared.id, { body: "Clarify the scope", replyToId: null, clientKey: crypto.randomUUID(), mentions: [] });
    const comment = { targetKind: "PLAN_REVISION" as const, targetId: plan.currentRevisionId!, body: "Please define the study population", clientKey: crypto.randomUUID(), mentions: [] };
    await tasks.addComment(id, mentor, comment); expect((await overview.get(id, owner)).attention.mentorFeedback).toBe(2);
    await expect(threads.resolve(id, mentor, shared.id, { status: "RESOLVED", conclusion: "Approved", expectedVersion: 1 })).rejects.toMatchObject({ statusCode: 404 });
    await expect(tasks.addComment(id, mentor, { ...comment, clientKey: crypto.randomUUID(), mentions: [member] })).rejects.toMatchObject({ statusCode: 403 });
    await tasks.addComment(id, member, { ...comment, body: "We updated the scope", clientKey: crypto.randomUUID() }); expect((await overview.get(id, member)).attention.mentorFeedback).toBe(1);
    expect(await canDeliverWorkspaceNotification({ type: "PROJECT_WORKSPACE_PLAN_SHARED", userId: mentor, targetUuid: id })).toBe(true);
    await plans.revokeShare(id, owner, share.id); await expect(plans.get(id, mentor, plan.currentRevisionId!)).rejects.toMatchObject({ statusCode: 404 }); await expect(threads.detail(id, mentor, shared.id, page)).rejects.toMatchObject({ statusCode: 404 });
    expect(await canDeliverWorkspaceNotification({ type: "PROJECT_WORKSPACE_PLAN_SHARED", userId: mentor, targetUuid: id })).toBe(false);
    expect(await canDeliverWorkspaceNotification(notice)).toBe(false);
  });
  it("denies ended or unverified mentors even when a live grant remains", async () => {
    const id = await project(), rel = await relation(id), plan = await explicitPlan(id); await plans.share(id, owner, { revisionId: plan.currentRevisionId!, relationshipId: rel.id });
    expect((await overview.get(id, owner)).mentors).toHaveLength(1);
    await db.academicProfile.update({ where: { userId: mentor }, data: { roleVerificationStatus: "SELF_DECLARED" } }); await expect(plans.get(id, mentor)).rejects.toMatchObject({ statusCode: 404 });
    expect((await overview.get(id, member)).mentors).toEqual([]);
    await db.academicProfile.update({ where: { userId: mentor }, data: { roleVerificationStatus: "VERIFIED" } }); await db.mentorRelationship.update({ where: { id: rel.id }, data: { status: "ENDED", endedAt: new Date() } }); await expect(plans.get(id, mentor)).rejects.toMatchObject({ statusCode: 404 });
  });
  it("keeps old active shares discoverable and revocable beyond one hundred revoked grants", async () => {
    const id = await project(), rel = await relation(id), plan = await explicitPlan(id);
    const share = await plans.share(id, owner, { revisionId: plan.currentRevisionId!, relationshipId: rel.id });
    await db.planShare.createMany({ data: Array.from({ length: 105 }, () => ({ projectId: id, revisionId: plan.currentRevisionId!, relationshipId: rel.id, sharedById: owner, revokedAt: new Date(), createdAt: new Date(Date.now() + 1000) })) });
    expect((await plans.shares(id, owner)).map(row => row.id)).toContain(share.id);
    await plans.revokeShare(id, owner, share.id);
    expect(await plans.shares(id, owner)).toEqual([]);
    await expect(plans.get(id, mentor)).rejects.toMatchObject({ statusCode: 404 });
  });
  it("keeps notifications minimal, suppresses removed members and computes actual attention", async () => {
    const id = await project(), task = await tasks.save(id, owner, taskInput({ dueAt: new Date(Date.now() - 60000).toISOString(), status: "BLOCKED", blockedReason: "Waiting for a dataset" }));
    const data = await overview.get(id, member); expect(data.attention).toMatchObject({ overdueTasks: 1, blockedTasks: 1 }); expect(data.myTasks[0]!.id).toBe(task.id);
    const notice = await db.notification.findFirstOrThrow({ where: { eventKey: { startsWith: `WORKSPACE:ASSIGNMENT:${task.id}:` } } }); expect(JSON.stringify(notice)).not.toContain("Private research problem"); expect(JSON.stringify(notice)).not.toContain("Waiting for a dataset"); expect(notice.emailStatus).toBe("SKIPPED");
    expect(await canDeliverWorkspaceNotification(notice)).toBe(true); await projectService.removeMemberFromProject(id, member, owner); expect(await canDeliverWorkspaceNotification(notice)).toBe(false);
    await expect(tasks.detail(id, member, task.id, page)).rejects.toMatchObject({ statusCode: 404 });
  });
  it("serializes versioned task updates against each other and archive", async () => {
    const id = await project(), input = taskInput(), task = await tasks.save(id, owner, input); const { clientKey: _key, ...fields } = input;
    const result = await Promise.allSettled([tasks.save(id, owner, { ...fields, title: "A", expectedVersion: 1 }, task.id), tasks.save(id, member, { ...fields, title: "B", expectedVersion: 1 }, task.id)]); expect(result.filter(row => row.status === "fulfilled")).toHaveLength(1);
    await Promise.allSettled([projectService.archiveProject(id, owner), tasks.save(id, member, { ...fields, title: "Race with archive", expectedVersion: 2 }, task.id)]);
    const plan = await plans.get(id, owner); expect(plan.archived).toBe(true); expect(plan.canEdit).toBe(false);
    for (const action of [() => tasks.save(id, owner, taskInput()), () => plans.save(id, member, { ...plan.content, expectedVersion: plan.version, changeSummary: "Bad" }), () => overview.stage(id, owner, { stage: "WRITING", expectedVersion: 1 }), () => tasks.saveMilestone(id, member, { title: "Bad", description: "", dueAt: null, status: "PLANNED" }), () => threads.saveDecision(id, owner, { decision: "Bad", context: "", alternatives: "", rationale: "Bad", link: null, threadId: null })]) await expect(action()).rejects.toMatchObject({ statusCode: 409 });
    expect((await tasks.detail(id, owner, task.id, page)).history.total).toBeGreaterThanOrEqual(2);
  });
  it.each(["team-chat", "chat"] as const)("closes an open %s stream after session revocation, membership removal or account deactivation", async route => {
    const app = express(); app.use(express.json()); app.use("/api/v1/projects", projectRouter); app.use(errorHandler);
    const server = createServer(app); server.listen(0, "127.0.0.1"); await once(server, "listening");
    const address = server.address(); if (!address || typeof address === "string") throw new Error("No test server");
    try {
      for (const change of ["session", "membership", "account"] as const) {
        const id = await project(), familyId = crypto.randomUUID();
        await db.refreshToken.create({ data: { userId: member, familyId, tokenHash: hashOpaqueToken(crypto.randomUUID()), expiresAt: new Date(Date.now() + 60000) } });
        const token = tokenService.signAccessToken({ sub: member, systemRole: "USER", sessionId: familyId }).token;
        const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/projects/${id}/${route}/events?scope=team`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(6000) });
        expect(response.status).toBe(200); const reader = response.body!.getReader(), decoder = new TextDecoder();
        expect(decoder.decode((await reader.read()).value)).toContain("event: ready");
        const publish = (occurredAt: string) => route === "team-chat" ? projectTeamChatEventHub.publish({ type: "ready", projectId: id, occurredAt }) : projectChatEventHub.publish({ type: "ready", projectId: id, scope: "team", occurredAt });
        publish("authorized-event"); expect(decoder.decode((await reader.read()).value)).toContain("authorized-event");
        if (change === "session") await db.refreshToken.updateMany({ where: { familyId }, data: { revokedAt: new Date() } });
        if (change === "membership") await projectService.removeMemberFromProject(id, member, owner);
        if (change === "account") await db.user.update({ where: { id: member }, data: { isActive: false } });
        publish("private-event-after-revocation");
        try { expect(await reader.read()).toMatchObject({ done: true }); }
        finally { await reader.cancel(); await db.user.update({ where: { id: member }, data: { isActive: true } }); }
      }
    } finally { await db.user.update({ where: { id: member }, data: { isActive: true } }); server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  });
  it("rechecks chat write authorization after generation and refunds a rejected turn", async () => {
    const id = await project();
    const paper = await db.paper.create({ data: { title: `Chat race ${marker}`, abstractText: "A source excerpt", primaryProvider: "user", publicationYear: 2025 } });
    await db.projectPaper.create({ data: { projectId: id, paperId: paper.id, addedById: owner } });
    const chargeId = crypto.randomUUID();
    const charge = vi.spyOn(creditService, "chargeCreditsChecked").mockResolvedValue({ id: chargeId } as Awaited<ReturnType<typeof creditService.chargeCreditsChecked>>);
    const refund = vi.spyOn(creditService, "refundCreditsOnce").mockResolvedValue(undefined as never);
    const generation = vi.spyOn(getLlmProvider(), "generate").mockImplementation(async () => { await projectService.removeMemberFromProject(id, member, owner); return "A bounded interpretation."; });
    try {
      await expect(projectChatService.sendMessage(id, member, `Question ${crypto.randomUUID()}`, "team")).rejects.toMatchObject({ statusCode: 403 });
      expect(generation).toHaveBeenCalledOnce(); expect(refund).toHaveBeenCalledWith({ transactionId: chargeId, reason: "Project chat message could not be saved" });
      expect(await db.projectChatMessage.count({ where: { projectId: id } })).toBe(0);
      await projectService.archiveProject(id, owner);
      await expect(projectTeamChatService.sendMessage(id, owner, "Archived message")).rejects.toMatchObject({ statusCode: 409 });
    } finally { generation.mockRestore(); charge.mockRestore(); refund.mockRestore(); await db.projectPaper.deleteMany({ where: { paperId: paper.id } }); await db.paper.delete({ where: { id: paper.id } }); }
  });
  it.each(["membership", "archive"] as const)("rejects legacy section writes when %s changes after the initial access check", async change => {
    for (const operation of ["createSection", "updateSection", "addComment", "updateComment"] as const) {
      const id = await project(), draft = await workspaceService.create({ projectId: id, name: "Versioned writing" }, member, "researcher");
      const section = await workspaceService.createSection(draft.id, { title: "Methods", content: "Original content" }, member, "researcher");
      const comment = await workspaceService.addComment(draft.id, section.id, "Original comment", member, "researcher");
      const originalCheck = membershipAccess.requireCurrentProjectMembership; let changed = false;
      const check = vi.spyOn(membershipAccess, "requireCurrentProjectMembership").mockImplementation(async (...args) => {
        const result = await originalCheck(...args);
        if (args[2] && !changed) { changed = true; if (change === "membership") await projectService.removeMemberFromProject(id, member, owner); else await projectService.archiveProject(id, owner); }
        return result;
      });
      try {
        const write = () => operation === "createSection" ? workspaceService.createSection(draft.id, { title: "Unauthorized section" }, member, "researcher") : operation === "updateSection" ? workspaceService.updateSection(draft.id, section.id, { content: "Unauthorized replacement", expectedVersion: 1 }, member, "researcher") : operation === "addComment" ? workspaceService.addComment(draft.id, section.id, "Unauthorized comment", member, "researcher") : workspaceService.updateComment(draft.id, comment.id, "resolved", member, "researcher");
        await expect(write()).rejects.toMatchObject({ statusCode: change === "membership" ? 403 : 409 });
        expect(changed).toBe(true);
        expect(await db.workspaceSection.count({ where: { workspaceId: draft.id } })).toBe(1);
        expect(await db.workspaceSection.findUnique({ where: { id: section.id } })).toMatchObject({ version: 1, content: "Original content" });
        expect(await db.workspaceComment.count({ where: { workspaceId: draft.id } })).toBe(1);
        expect(await db.workspaceComment.findUnique({ where: { id: comment.id } })).toMatchObject({ status: "open" });
      } finally { check.mockRestore(); }
    }
  });
});
