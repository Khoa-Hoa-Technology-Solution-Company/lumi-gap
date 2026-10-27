import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { projectChatService as chat } from "../project-chat.service.js";
import { projectService } from "../project.service.js";

const isolated = process.env.PROJECT_SLICE_TEST === "1" && process.env.DATABASE_URL?.includes("127.0.0.1:15439/lumigap_project_slice_test") && process.env.REDIS_URL === "redis://127.0.0.1:16389";

describe.skipIf(!isolated).sequential("project AI history pagination (disposable PostgreSQL)", () => {
  const db = getPrisma(), users: string[] = [], projects: string[] = [];
  let owner: string, member: string, outsider: string;
  beforeAll(async () => {
    for (const name of ["owner", "member", "outsider"]) {
      const user = await db.user.create({ data: { email: `ai-history-${name}-${crypto.randomUUID()}@example.org`, fullName: name, emailVerifiedAt: new Date(), onboardingCompletedAt: new Date() } });
      users.push(user.id);
      await db.academicProfile.create({ data: { userId: user.id, primaryPosition: "RESEARCH_STAFF", academicRole: "RESEARCHER" } });
    }
    [owner, member, outsider] = users as [string, string, string];
  });
  afterAll(async () => {
    await db.project.deleteMany({ where: { id: { in: projects } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
  });
  async function project() {
    const row = await projectService.createProject({ title: "Disposable AI history", idempotencyKey: crypto.randomUUID() }, owner);
    projects.push(row._id);
    await db.projectMember.create({ data: { projectId: row._id, userId: member } });
    return row._id;
  }
  function messageId(role: "user" | "assistant") {
    // Lexical UUID ordering would put the answer before its prompt.
    return `${role === "user" ? "f" : "0"}${crypto.randomUUID().slice(1)}`;
  }
  it.each(["private", "team"] as const)("retrieves every %s message beyond 50 exactly once with tied prompt/answer timestamps", async (scope) => {
    const id = await project(), createdAt = new Date("2026-10-24T12:00:00Z");
    const messages = Array.from({ length: 62 }, (_, index) => (["user", "assistant"] as const).map(role => ({
      id: messageId(role), projectId: id, userId: scope === "team" && index % 2 ? member : owner,
      scope, role, content: `${role} ${index}`, createdAt,
    }))).flat();
    await db.projectChatMessage.createMany({ data: messages });
    await db.projectChatMessage.createMany({ data: [
      { projectId: id, userId: member, scope: "private", role: "user", content: "Another member's private prompt", createdAt },
      { projectId: id, userId: owner, scope: scope === "private" ? "team" : "private", role: "assistant", content: "Another channel", createdAt },
    ] });
    const expected = [...messages].sort((a, b) => b.role.localeCompare(a.role) || a.id.localeCompare(b.id)).map(row => row.id);
    let page = await chat.listHistory(id, owner, 50, scope);
    expect(page).toHaveLength(50);
    let retrieved = page;
    let requests = 1;
    while (page.length && requests < 5) {
      page = await chat.listHistory(id, owner, 50, scope, page[0]!.id);
      retrieved = [...page, ...retrieved];
      requests++;
    }
    expect(page).toEqual([]);
    expect(retrieved.map(message => message.id)).toEqual(expected);
    expect(new Set(retrieved.map(message => message.id)).size).toBe(messages.length);
    expect(retrieved.slice(0, 62).every(message => message.role === "user")).toBe(true);
  });
  it("accepts a visible legacy cursor and rejects another project, channel, or member's private cursor", async () => {
    const id = await project(), another = await project();
    const old = await db.projectChatMessage.create({ data: { projectId: id, userId: owner, scope: "private", role: "user", content: "Earlier", createdAt: new Date("2026-10-24T10:00:00Z") } });
    const own = await db.projectChatMessage.create({ data: { projectId: id, userId: owner, scope: "private", role: "assistant", content: "Own answer", legacyMongoId: crypto.randomUUID().replaceAll("-", "").slice(0, 24), createdAt: new Date("2026-10-24T11:00:00Z") } });
    const privateMember = await db.projectChatMessage.create({ data: { projectId: id, userId: member, scope: "private", role: "user", content: "Private member prompt" } });
    const team = await db.projectChatMessage.create({ data: { projectId: id, userId: member, scope: "team", role: "assistant", content: "Shared team answer" } });
    expect((await chat.listHistory(id, owner, 50, "private", own.legacyMongoId!)).map(message => message.id)).toEqual([old.id]);
    for (const [projectId, scope, cursor] of [[another, "private", own.id], [id, "private", privateMember.id], [id, "private", team.id], [id, "team", own.id], [id, "private", crypto.randomUUID()]] as const) {
      await expect(chat.listHistory(projectId, owner, 50, scope, cursor)).rejects.toMatchObject({ statusCode: 404 });
    }
    expect(await chat.listHistory(id, owner, 50, "team", team.id)).toEqual([]);
    await expect(chat.listHistory(id, outsider, 50, "team", team.id)).rejects.toMatchObject({ statusCode: 403 });
  });
  it("retains PostgreSQL timestamp precision when stepping backward", async () => {
    const id = await project(), expected: string[] = [];
    for (const fraction of ["000100", "000200", "000300"]) {
      for (const role of ["user", "assistant"] as const) {
        const message = await db.projectChatMessage.create({ data: { id: messageId(role), projectId: id, userId: owner, scope: "private", role, content: `${fraction} ${role}` } });
        const timestamp = `2026-10-24T12:00:00.${fraction}Z`;
        await db.$executeRaw`UPDATE project_chat_messages SET created_at = ${timestamp}::timestamptz WHERE id = ${message.id}::uuid`;
        expected.push(message.id);
      }
    }
    let page = await chat.listHistory(id, owner, 1, "private"), retrieved = page;
    for (let index = 0; index < expected.length && page.length; index++) {
      page = await chat.listHistory(id, owner, 1, "private", page[0]!.id);
      retrieved = [...page, ...retrieved];
    }
    expect(page).toEqual([]);
    expect(retrieved.map(message => message.id)).toEqual(expected);
  });
});
