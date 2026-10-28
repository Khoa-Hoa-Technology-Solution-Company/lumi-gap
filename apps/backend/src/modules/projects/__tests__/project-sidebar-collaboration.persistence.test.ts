import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { projectTeamChatService as chat } from "../project-team-chat.service.js";
import { projectService } from "../project.service.js";
import { projectTasksService as tasks } from "../project-tasks.service.js";

const isolated = process.env.PROJECT_SLICE_TEST === "1" && process.env.DATABASE_URL?.includes("127.0.0.1:15439/lumigap_project_slice_test") && process.env.REDIS_URL === "redis://127.0.0.1:16389";
describe.skipIf(!isolated).sequential("project sidebar team chat (disposable PostgreSQL)", () => {
  const db = getPrisma(), users: string[] = [], projects: string[] = [];
  let owner: string, outsider: string;
  const page = { limit: 2 };
  beforeAll(async () => {
    for (const name of ["owner", "outsider"]) {
      const user = await db.user.create({ data: { email: `sidebar-chat-${name}-${crypto.randomUUID()}@example.org`, fullName: name, emailVerifiedAt: new Date(), onboardingCompletedAt: new Date() } });
      users.push(user.id);
      await db.academicProfile.create({ data: { userId: user.id, primaryPosition: "RESEARCH_STAFF", academicRole: "RESEARCHER" } });
    }
    [owner, outsider] = users as [string, string];
  });
  afterAll(async () => {
    await db.notification.deleteMany({ where: { userId: { in: users } } });
    await db.project.deleteMany({ where: { id: { in: projects } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
  });
  async function project() { const row = await projectService.createProject({ title: "Disposable sidebar chat", idempotencyKey: crypto.randomUUID() }, owner); projects.push(row._id); return row._id; }
  it("deduplicates concurrent team sends, rejects edited receipts and keeps notification activity singular", async () => {
    const id = await project(), key = crypto.randomUUID();
    const [first, retry] = await Promise.all([chat.sendMessage(id, owner, "A retained team update", key), chat.sendMessage(id, owner, "A retained team update", key)]);
    expect(first.id).toBe(retry.id);
    expect(await db.projectTeamMessage.count({ where: { projectId: id } })).toBe(1);
    await expect(chat.sendMessage(id, owner, "Different receipt content", key)).rejects.toMatchObject({ statusCode: 409 });
    await expect(chat.sendMessage(id, outsider, "Unauthorized", crypto.randomUUID())).rejects.toMatchObject({ statusCode: 403 });
  });
  it("pages every tied-timestamp message exactly once and rejects a cross-project cursor", async () => {
    const id = await project(), another = await project(), createdAt = new Date("2026-10-23T12:00:00Z");
    const ids: string[] = [];
    for (let index = 0; index < 5; index++) ids.push((await db.projectTeamMessage.create({ data: { projectId: id, senderId: owner, content: `Message ${index}`, createdAt } })).id);
    const first = await chat.listMessages(id, owner, page);
    const second = await chat.listMessages(id, owner, { ...page, beforeId: first[0]!.id });
    const third = await chat.listMessages(id, owner, { ...page, beforeId: second[0]!.id });
    expect([...third, ...second, ...first].map(message => message.id)).toEqual(ids.sort());
    await expect(chat.listMessages(another, owner, { ...page, beforeId: first[0]!.id })).rejects.toMatchObject({ statusCode: 404 });
  });
  it("deduplicates milestone creation receipts even after the target is edited", async () => {
    const id = await project(), input = { title: "Finish the first experiment", description: "Retain the target", dueAt: null, status: "PLANNED" as const, clientKey: crypto.randomUUID() };
    const [first, retry] = await Promise.all([tasks.saveMilestone(id, owner, input), tasks.saveMilestone(id, owner, input)]);
    expect(first.id).toBe(retry.id);
    await tasks.saveMilestone(id, owner, { ...input, title: "Updated experiment target", expectedVersion: 1 }, first.id);
    expect((await tasks.saveMilestone(id, owner, input)).id).toBe(first.id);
    await expect(tasks.saveMilestone(id, owner, { ...input, title: "Changed retry payload" })).rejects.toMatchObject({ statusCode: 409 });
    expect(await db.projectMilestone.count({ where: { projectId: id } })).toBe(1);
  });
  it("retains original deletion provenance on retries and rejects archived deletion", async () => {
    const id = await project(), message = await chat.sendMessage(id, owner, "Original update");
    const deleted = await chat.deleteMessage(id, message.id, owner, "Original reason");
    const retried = await chat.deleteMessage(id, message.id, owner, "Replacement reason");
    expect(retried.deletedAt).toBe(deleted.deletedAt); expect(retried.deleteReason).toBe("Original reason");
    const retained = await chat.sendMessage(id, owner, "Retained update");
    await projectService.archiveProject(id, owner);
    await expect(chat.deleteMessage(id, retained.id, owner)).rejects.toMatchObject({ statusCode: 409 });
    expect((await db.projectTeamMessage.findUniqueOrThrow({ where: { id: retained.id } })).isDeleted).toBe(false);
  });
  it("rechecks membership inside the delete transaction after a stale access preflight", async () => {
    const id = await project();
    const invite = await projectService.inviteMember(id, { userId: outsider }, owner);
    await projectService.respondToInvitation(id, invite.id, outsider, "ACCEPTED");
    const message = await chat.sendMessage(id, outsider, "Retain after removal");
    const internal = chat as unknown as { assertCanAccess: (projectId: string, userId: string, options?: object) => Promise<unknown> };
    const original = internal.assertCanAccess.bind(chat);
    const access = vi.spyOn(internal, "assertCanAccess").mockImplementationOnce(async (...args) => {
      const allowed = await original(...args);
      await projectService.removeMemberFromProject(id, outsider, owner);
      return allowed;
    });
    try {
      await expect(chat.deleteMessage(id, message.id, outsider)).rejects.toMatchObject({ statusCode: 403 });
      expect((await db.projectTeamMessage.findUniqueOrThrow({ where: { id: message.id } })).isDeleted).toBe(false);
    } finally { access.mockRestore(); }
  });
});
