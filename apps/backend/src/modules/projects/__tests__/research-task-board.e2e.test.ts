import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { mkdir } from "node:fs/promises";
import { chromium, expect as uiExpect, type Browser, type Page } from "@playwright/test";
import type { SaveWorkspaceTask, WorkspaceTask, WorkspaceTaskBoard, WorkspaceTaskStatus } from "@trend/shared-types";
import { createApp } from "../../../app.js";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { hashOpaqueToken, tokenService } from "../../auth/token.service.js";

const isolated = process.env.RESEARCH_TASK_INTEGRATION === "1" && process.env.DATABASE_URL?.includes("127.0.0.1:15439/lumigap_project_slice_test") && process.env.REDIS_URL === "redis://127.0.0.1:16389";
describe.skipIf(!isolated).sequential("Research tasks with PostgreSQL, HTTP and Chromium", () => {
  const db = getPrisma(); let server: Server, browser: Browser;
  let owner: Awaited<ReturnType<typeof actor>>, member: typeof owner, outsider: typeof owner, mentor: typeof owner, admin: typeof owner;
  const base = "http://127.0.0.1:14040/api/v1", origin = "http://127.0.0.1:13001";
  async function actor(name: string, role: "USER" | "ADMIN" = "USER", verified = false) {
    const user = await db.user.create({ data: { fullName: name, email: `task-${crypto.randomUUID()}@example.org`, emailVerifiedAt: new Date(), onboardingCompletedAt: new Date(), systemRole: role, admissionBasis: "INVITATION" } });
    await db.userEmail.create({ data: { userId: user.id, normalizedEmail: user.email, isPrimary: true, verifiedAt: new Date(), purpose: "ACCOUNT" } });
    await db.academicProfile.create({ data: { userId: user.id, primaryPosition: verified ? "LECTURER" : "RESEARCH_STAFF", academicRole: verified ? "LECTURER" : "RESEARCHER", roleVerificationStatus: verified ? "VERIFIED" : "SELF_DECLARED", positionStatus: verified ? "VERIFIED" : "NOT_SUBMITTED", supportAvailability: { enabled: true } } });
    const sessionId = crypto.randomUUID(); await db.refreshToken.create({ data: { userId: user.id, familyId: sessionId, tokenHash: hashOpaqueToken(crypto.randomUUID()), expiresAt: new Date(Date.now() + 3600000) } });
    return { userId: user.id, sessionId, token: tokenService.signAccessToken({ sub: user.id, systemRole: role, sessionId }).token };
  }
  async function request(path: string, who: typeof owner | null = owner, method = "GET", body?: unknown) {
    const response = await fetch(`${base}${path}`, { method, headers: { ...(who ? { Authorization: `Bearer ${who.token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, json: await response.json() };
  }
  const call = (id: string, path = "/tasks", who = owner, method = "GET", body?: unknown) => request(`/projects/${id}${path}`, who, method, body);
  const input = (changes: Partial<SaveWorkspaceTask> = {}) => ({ title: "Read a research paper", description: "", status: "TODO" as const, blockedReason: "", assigneeId: null, milestoneId: null, dueAt: null, link: null, ...changes, clientKey: crypto.randomUUID() });
  async function project(title = "Nghiên cứu cộng tác với AI") {
    const created = await request("/projects", owner, "POST", { title, description: "Tổng hợp bằng chứng về công cụ AI trong nghiên cứu.", visibility: "PUBLIC", idempotencyKey: crypto.randomUUID() }); expect(created.status).toBe(201);
    const id = created.json.data._id as string;
    const invite = await call(id, "/invitations", owner, "POST", { userId: member.userId });
    expect((await call(id, `/invitations/${invite.json.data.id}/accept`, member, "POST")).status).toBe(200); return id;
  }
  async function create(id: string, changes: Partial<SaveWorkspaceTask> = {}, who = owner) { const result = await call(id, "/tasks", who, "POST", input(changes)); expect(result.status).toBe(201); return result.json.data.id as string; }
  const read = async (id: string, task: string): Promise<WorkspaceTask> => (await call(id, `/tasks/${task}`)).json.data.task;
  const board = async (id: string): Promise<WorkspaceTaskBoard> => (await call(id, "/tasks/board")).json.data;
  const form = (task: WorkspaceTask) => ({ title: task.title, description: task.description, status: task.status, blockedReason: task.blockedReason, assigneeId: task.assignee?.id ?? null, milestoneId: task.milestoneId, dueAt: task.dueAt, link: task.link, priority: task.priority, parentTaskId: task.parentTaskId, checklist: task.checklist, expectedVersion: task.version });
  const update = (id: string, task: WorkspaceTask, changes: Partial<SaveWorkspaceTask>, who = owner) => call(id, `/tasks/${task.id}`, who, "PATCH", { ...form(task), ...changes });
  async function move(id: string, task: WorkspaceTask, status: WorkspaceTaskStatus, beforeId: string | null = null, version?: number, reason = "") {
    return call(id, `/tasks/${task.id}/move`, owner, "POST", { expectedVersion: task.version, expectedBoardVersion: version ?? (await board(id)).boardVersion, status, beforeId, blockedReason: reason, clientKey: crypto.randomUUID() });
  }
  beforeAll(async () => {
    server = createServer(createApp()); server.listen(14040, "127.0.0.1"); await once(server, "listening");
    owner = await actor("Nguyễn Minh Anh"); member = await actor("Trần Hoàng Nam"); outsider = await actor("Nonmember"); mentor = await actor("Verified mentor", "USER", true); admin = await actor("Admin", "ADMIN");
  }, 30000);
  afterAll(async () => { if (browser) await browser.close(); if (server?.listening) { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); } });

  it("creates one canonical task on retries, assigns a real member and sends one durable in-app notification", async () => {
    const id = await project(), data = input({ priority: "HIGH", assigneeId: member.userId, dueAt: "2026-11-20T12:00:00.000Z" });
    const first = await call(id, "/tasks", owner, "POST", data), retry = await call(id, "/tasks", owner, "POST", data); expect(first.status).toBe(201); expect(retry.json.data).toEqual(first.json.data);
    const task = await read(id, first.json.data.id); expect(task.priority).toBe("HIGH"); expect(task.assignee?.id).toBe(member.userId); expect(task.dueAt).toBe("2026-11-20T00:00:00.000Z");
    expect((await call(id, "/tasks?mine=1", member)).json.data.items.map((item: WorkspaceTask) => item.id)).toEqual([task.id]);
    const notifications = await db.notification.findMany({ where: { userId: member.userId, eventKey: { startsWith: `WORKSPACE:ASSIGNMENT:${task.id}:` } } }); expect(notifications).toHaveLength(1); expect(notifications[0]?.emailStatus).toBe("SKIPPED");
    expect((await call(id, "/tasks", owner, "POST", { ...data, title: "Different retry" })).status).toBe(409);
  });
  it("persists all status transitions, completion actor, blockers and real history without contribution percentages", async () => {
    const id = await project(), tid = await create(id, { assigneeId: member.userId });
    expect((await update(id, await read(id, tid), { status: "IN_PROGRESS" }, member)).status).toBe(200);
    expect((await update(id, await read(id, tid), { status: "BLOCKED", blockedReason: "Dataset is unavailable" }, member)).status).toBe(200);
    expect((await update(id, await read(id, tid), { status: "IN_PROGRESS" })).status).toBe(200);
    expect((await read(id, tid)).blockedReason).toBe("");
    expect((await update(id, await read(id, tid), { status: "DONE" }, member)).status).toBe(200);
    const done = await read(id, tid); expect(done.completedBy?.id).toBe(member.userId); expect(done.completedAt).not.toBeNull();
    const versions = (await call(id, `/tasks/${tid}`)).json.data.history.items; expect(versions.some((item: { snapshot: { blockedReason: string } }) => item.snapshot.blockedReason === "Dataset is unavailable")).toBe(true);
    expect(await db.projectActivity.count({ where: { projectId: id, type: "TASK_COMPLETED", actorId: member.userId } })).toBe(1);
    expect(await db.researchContribution.count({ where: { projectId: id } })).toBe(0);
    const comment = { targetKind: "TASK", targetId: tid, body: "The evidence summary is ready", mentions: [owner.userId], clientKey: crypto.randomUUID() };
    expect((await call(id, "/workspace/comments", member, "POST", comment)).status).toBe(201); expect((await call(id, "/workspace/comments", member, "POST", comment)).status).toBe(201);
    expect((await call(id, `/workspace/comments?targetKind=TASK&targetId=${tid}`)).json.data.total).toBe(1);
    for (const kind of ["TASK_BLOCKED", "TASK_UNBLOCKED"]) expect(await db.notification.count({ where: { targetUuid: id, type: `PROJECT_WORKSPACE_${kind}` } })).toBeGreaterThan(0);
  });
  it("enforces one-level same-project subtasks, explicit parent completion and safe reopening/deletion", async () => {
    const id = await project(), other = await project(), parent = await create(id), child = await create(id, { parentTaskId: parent, assigneeId: member.userId });
    expect((await update(id, await read(id, parent), { status: "DONE" })).json.error.code).toBe("TASK_SUBTASKS_OPEN");
    expect((await call(other, "/tasks", owner, "POST", input({ parentTaskId: parent }))).status).toBe(404);
    expect((await call(id, "/tasks", owner, "POST", input({ parentTaskId: child }))).status).toBe(400);
    expect((await update(id, await read(id, parent), { parentTaskId: child })).status).toBe(400);
    expect((await call(id, `/tasks/${parent}`, owner, "DELETE", { expectedVersion: 1 })).json.error.code).toBe("TASK_HAS_SUBTASKS");
    await update(id, await read(id, child), { status: "DONE" }, member);
    const progress = await read(id, parent); expect(progress.subtaskCount).toBe(1); expect(progress.completedSubtaskCount).toBe(1); expect(progress.status).toBe("TODO");
    expect((await update(id, progress, { status: "DONE" })).status).toBe(200);
    expect((await update(id, await read(id, child), { status: "IN_PROGRESS" })).json.error.code).toBe("TASK_PARENT_DONE");
    expect((await update(id, await read(id, parent), { status: "IN_PROGRESS" })).status).toBe(200);
    expect((await update(id, await read(id, child), { status: "TODO" })).status).toBe(200);
  });
  it("stores stable checklist IDs and rejects forged actors, invalid priorities, duplicate IDs and invalid statuses", async () => {
    const id = await project(), cid = crypto.randomUUID(), tid = await create(id, { checklist: [{ id: cid, text: "Verify DOI", done: false }] });
    expect((await update(id, await read(id, tid), { checklist: [{ id: cid, text: "Verify DOI", done: true }] })).status).toBe(200);
    expect((await read(id, tid)).checklist).toEqual([{ id: cid, text: "Verify DOI", done: true }]);
    for (const changes of [{ priority: "CRITICAL" }, { completedById: outsider.userId }, { sortOrder: 999 }, { status: "INVALID" }, { checklist: [{ id: cid, text: "A", done: true }, { id: cid, text: "B", done: true }] }, { status: "BLOCKED", blockedReason: " " }]) expect((await call(id, "/tasks", owner, "POST", { ...input(), ...changes })).status).toBe(400);
  });
  it("persists reorder and status moves, deduplicates move retries and rejects stale board versions", async () => {
    const id = await project(), a = await create(id, { title: "A" }), b = await create(id, { title: "B" }), c = await create(id, { title: "C" });
    expect((await move(id, await read(id, c), "TODO", a)).status).toBe(200);
    expect((await board(id)).columns.TODO.items.map(item => item.id)).toEqual([c, a, b]);
    const before = await board(id), item = await read(id, a), requestBody = { expectedVersion: item.version, expectedBoardVersion: before.boardVersion, status: "IN_PROGRESS", beforeId: null, blockedReason: "", clientKey: crypto.randomUUID() };
    const moved = await call(id, `/tasks/${a}/move`, owner, "POST", requestBody); expect(moved.status).toBe(200);
    expect((await call(id, `/tasks/${a}/move`, owner, "POST", requestBody)).status).toBe(200);
    expect((await board(id)).columns.IN_PROGRESS.items[0]?.id).toBe(a);
    expect((await move(id, await read(id, b), "DONE", null, before.boardVersion)).json.error.code).toBe("TASK_BOARD_CHANGED");
    expect(await db.projectActivity.count({ where: { projectId: id, type: "TASK_REORDERED", entityId: a } })).toBe(1);
    expect((await move(id, await read(id, b), "TODO", a)).status).toBe(400);
  });
  it("serializes competing moves and rejects stale edits while preserving independent fields", async () => {
    const id = await project(), a = await create(id), b = await create(id), first = await read(id, a);
    expect((await update(id, first, { priority: "URGENT" })).status).toBe(200);
    expect((await update(id, first, { description: "Stale description" }, member)).status).toBe(409);
    expect((await read(id, a)).priority).toBe("URGENT");
    const common = (await board(id)).boardVersion;
    const results = await Promise.all([move(id, await read(id, a), "IN_PROGRESS", null, common), move(id, await read(id, b), "DONE", null, common)]);
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
  });
  it("paginates every status independently and filters/sorts real tasks with date-only overdue semantics", async () => {
    const id = await project(), today = new Date().toISOString().slice(0, 10);
    await create(id, { title: "Today", dueAt: `${today}T00:00:00.000Z`, assigneeId: member.userId, priority: "URGENT" });
    await create(id, { title: "Overdue", dueAt: "2020-01-01T00:00:00.000Z" }); await create(id, { title: "Completed", status: "DONE", dueAt: "2020-01-01T00:00:00.000Z" });
    for (let i = 0; i < 22; i++) await create(id, { title: `Literature ${i}` });
    const page = (await call(id, "/tasks/board?pageSize=10&todoPage=2")).json.data as WorkspaceTaskBoard;
    expect(page.columns.TODO.total).toBe(24); expect(page.columns.TODO.items).toHaveLength(10); expect(page.columns.TODO.page).toBe(2); expect(page.columns.DONE.total).toBe(1);
    expect((await call(id, "/tasks?overdue=1")).json.data.items.map((item: WorkspaceTask) => item.title)).toEqual(["Overdue"]);
    expect((await call(id, "/tasks?sort=priority")).json.data.items[0].title).toBe("Today");
    expect((await call(id, "/tasks?q=literature&unassigned=1")).json.data.total).toBe(22);
    expect((await call(id, "/workspace")).json.data.attention.overdueTasks).toBe(1);
  });
  it("validates scoped research artifacts, canonical plan and milestone references", async () => {
    const id = await project(), other = await project(), plan = await db.researchPlan.findUniqueOrThrow({ where: { projectId: id } });
    const tid = await create(id, { link: { kind: "PLAN", id: plan.id } });
    expect((await read(id, tid)).link).toEqual({ kind: "PLAN", id: plan.id });
    expect((await call(other, "/tasks", owner, "POST", input({ link: { kind: "PLAN", id: plan.id } }))).status).toBe(400);
    for (const kind of ["PAPER", "MANUSCRIPT_SNAPSHOT", "MENTOR_FEEDBACK", "QUESTION"]) expect((await call(id, "/tasks", owner, "POST", input({ link: { kind: kind as "PAPER", id: crypto.randomUUID() } }))).status).toBe(400);
    const milestone = (await call(id, "/milestones", member, "POST", { title: "Proposal ready", description: "", dueAt: null, status: "PLANNED" })).json.data;
    expect((await update(id, await read(id, tid), { milestoneId: milestone.id })).status).toBe(200);
    expect((await call(other, "/tasks", owner, "POST", input({ milestoneId: milestone.id }))).status).toBe(400);
  });
  it("enforces live resource authorization for public projects, mentor-only accounts, revocation and archive", async () => {
    const id = await project(), other = await project(), tid = await create(id);
    const invitation = await call(id, "/mentorships", owner, "POST", { mentorUserId: mentor.userId, message: "Advise the team", idempotencyKey: crypto.randomUUID() }); expect(invitation.status).toBe(201);
    expect((await call(id, `/mentorships/${invitation.json.data.id}/accept`, mentor, "POST", {})).status).toBe(200);
    for (const who of [outsider, mentor, admin]) { expect([403, 404]).toContain((await call(id, "/tasks/board", who)).status); expect([403, 404]).toContain((await call(id, `/tasks/${tid}`, who)).status); expect([403, 404]).toContain((await call(id, "/tasks", who, "POST", input())).status); }
    expect((await request(`/projects/${id}/tasks`, null)).status).toBe(401);
    expect((await call(other, `/tasks/${tid}`)).status).toBe(404);
    expect((await call(id, "/tasks", owner, "POST", input({ assigneeId: outsider.userId }))).status).toBe(400);
    expect((await call(id, "/tasks", owner, "POST", input({ assigneeId: mentor.userId }))).status).toBe(400);
    await call(id, `/members/${member.userId}`, owner, "DELETE");
    expect([403, 404]).toContain((await call(id, "/tasks", member)).status);
    expect((await call(id, "/tasks", owner, "POST", input({ assigneeId: member.userId }))).status).toBe(400);
    await call(id, "/archive", owner, "POST");
    expect((await call(id, "/tasks", owner, "POST", input())).status).toBe(409); expect((await move(id, await read(id, tid), "DONE")).status).toBe(409);
    expect((await call(id, `/tasks/${tid}`, owner, "DELETE", { expectedVersion: 1 })).status).toBe(409);
    expect((await call(id, "/tasks/board")).status).toBe(200);
  });
  it("links real manuscript snapshots and mentor feedback without granting access to other projects", async () => {
    const id = await project(), other = await project();
    const manuscript = await call(id, "/manuscripts", owner, "POST", { title: "Evidence synthesis", documentType: "RESEARCH_PAPER", template: "ARTICLE", clientKey: crypto.randomUUID() }); expect(manuscript.status).toBe(201);
    const mid = manuscript.json.data.id;
    const snapshot = await call(id, `/manuscripts/${mid}/snapshots`, owner, "POST", { label: "Mentor review v1", clientKey: crypto.randomUUID(), minimumSequences: {} }); expect(snapshot.status).toBe(201);
    const sid = snapshot.json.data.id;
    const invitation = await call(id, "/mentorships", owner, "POST", { mentorUserId: mentor.userId, message: "Review this version", idempotencyKey: crypto.randomUUID() });
    expect((await call(id, `/mentorships/${invitation.json.data.id}/accept`, mentor, "POST", {})).status).toBe(200);
    const relation = await db.mentorRelationship.findFirstOrThrow({ where: { projectId: id, mentorUserId: mentor.userId, status: "ACTIVE" } });
    expect((await call(id, `/manuscripts/${mid}/comments`, owner, "POST", { body: "Please review our evidence synthesis", snapshotId: sid, mentorRelationshipId: relation.id, clientKey: crypto.randomUUID() })).status).toBe(400);
    // Retained pre-migration reference remains useful to the team, without granting mentor access.
    const feedback = await db.projectDiscussion.create({ data: { projectId: id, authorId: owner.userId, clientKey: crypto.randomUUID(), title: "Legacy feedback", body: "Please review our evidence synthesis", category: "MENTOR_QUESTION", targetKind: "MANUSCRIPT_SNAPSHOT", targetId: sid, mentorRelationshipId: relation.id } });
    for (const link of [{ kind: "MANUSCRIPT_SNAPSHOT" as const, id: sid }, { kind: "MENTOR_FEEDBACK" as const, id: feedback.id }]) {
      const tid = await create(id, { link }); expect((await read(id, tid)).link).toEqual(link);
      expect((await call(id, `/workspace/artifacts/${link.id}?kind=${link.kind}`)).json.data.href).toBe(`/projects/${id}/manuscripts/${mid}?snapshot=${sid}`);
      expect((await call(other, "/tasks", owner, "POST", input({ link }))).status).toBe(400);
      expect((await call(other, `/workspace/artifacts/${link.id}?kind=${link.kind}`)).status).toBe(400);
    }
    expect([403, 404]).toContain((await call(id, "/tasks/board", mentor)).status);
  });
  it("retains deleted-task deep links and immutable evidence, while rejecting edits and comments", async () => {
    const id = await project(), tid = await create(id);
    expect((await call(id, `/tasks/${tid}`, owner, "DELETE", { expectedVersion: 1 })).status).toBe(200);
    const detail = await call(id, `/tasks/${tid}`, member); expect(detail.status).toBe(200); expect(detail.json.data.task.deletedAt).not.toBeNull(); expect(detail.json.data.canDelete).toBe(false); expect(detail.json.data.history.total).toBe(2);
    expect((await call(id, "/tasks")).json.data.total).toBe(0);
    expect((await update(id, detail.json.data.task, { title: "Revive" })).status).toBe(404);
    expect((await call(id, "/workspace/comments", member, "POST", { targetKind: "TASK", targetId: tid, body: "Late write", mentions: [], clientKey: crypto.randomUUID() })).status).toBe(404);
  });
  async function page(who = owner): Promise<Page> {
    if (!browser) browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1512, height: 1050 } });
    await context.addInitScript(({ userId, token }) => { localStorage.setItem("trend-auth", JSON.stringify({ state: { user: { id: userId, systemRole: "USER" }, tokens: { accessToken: token, refreshToken: "synthetic-test-session" } }, version: 1 })); localStorage.setItem("lumigap.uiLanguage", "vi"); }, who);
    return context.newPage();
  }
  it("creates, assigns, edits checklist and comments in the drawer, preserving deep links and actual records", async () => {
    const id = await project(), p = await page(); await p.goto(`${origin}/projects/${id}?tab=tasks`);
    await uiExpect(p.getByRole("heading", { name: "Công việc nhóm", exact: true })).toBeVisible({ timeout: 30000 });
    await p.getByRole("button", { name: "Tạo công việc", exact: true }).click(); const dialog = p.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Tên công việc", exact: true }).fill("Kiểm chứng phương pháp nghiên cứu");
    await dialog.getByRole("button", { name: "Thêm mô tả, người phụ trách và chi tiết" }).click();
    await dialog.getByRole("combobox", { name: /Ưu tiên/ }).selectOption("HIGH"); await dialog.getByLabel("Người phụ trách", { exact: true }).selectOption(member.userId);
    await dialog.getByRole("button", { name: "Thêm bước", exact: true }).click(); await dialog.getByRole("textbox", { name: "Bước 1", exact: true }).fill("Đối chiếu dữ liệu gốc");
    await dialog.getByRole("button", { name: "Lưu công việc", exact: true }).click();
    await uiExpect(dialog.getByRole("button", { name: "Thêm việc con", exact: true })).toBeVisible();
    const tid = new URL(p.url()).searchParams.get("task")!; const task = await read(id, tid); expect(task.assignee?.id).toBe(member.userId); expect(task.checklist[0]?.text).toBe("Đối chiếu dữ liệu gốc");
    await dialog.getByRole("textbox", { name: "Viết bình luận", exact: true }).fill("Đã kiểm tra kết quả lần đầu."); await dialog.getByRole("button", { name: "Gửi bình luận", exact: true }).click();
    await uiExpect(dialog.getByText("Đã kiểm tra kết quả lần đầu.", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Đóng chi tiết công việc", exact: true }).click();
    await uiExpect(p.locator(`[data-task-id="${tid}"]`)).toContainText("Kiểm chứng phương pháp nghiên cứu");
    await p.goto(`${origin}/projects/${id}?tab=tasks&task=${tid}`); await uiExpect(p.getByRole("dialog").getByRole("textbox", { name: "Tên công việc", exact: true })).toHaveValue(task.title);
    await p.context().close();
  }, 60000);
  it("drags and reorders through the real API, survives reload, and rolls back rejected moves", async () => {
    const id = await project(), a = await create(id, { title: "First research task" }), b = await create(id, { title: "Second research task" }), c = await create(id, { title: "Third research task" }); const p = await page(); await p.goto(`${origin}/projects/${id}?tab=tasks`);
    const card = p.locator(`[data-task-id="${a}"]`), column = p.locator('.task-column[data-status="IN_PROGRESS"]');
    await uiExpect(card).toBeVisible({ timeout: 30000 }); const handle = await card.locator(".task-drag-handle").boundingBox(), destination = await column.boundingBox(); expect(handle).not.toBeNull(); expect(destination).not.toBeNull();
    await p.mouse.move(handle!.x + 10, handle!.y + 10); await p.mouse.down(); await p.mouse.move(handle!.x + 22, handle!.y + 18, { steps: 4 }); await p.waitForTimeout(250); await p.mouse.move(destination!.x + destination!.width - 25, destination!.y + 135, { steps: 20 }); await p.waitForTimeout(400); await p.mouse.up();
    await uiExpect.poll(async () => (await read(id, a)).status).toBe("IN_PROGRESS");
    await uiExpect(column.locator(`[data-task-id="${a}"]:not([data-dnd-placeholder])`)).toBeVisible({ timeout: 10000 }); await p.reload(); await uiExpect(column.locator(`[data-task-id="${a}"]`)).toBeVisible({ timeout: 30000 });
    const keyboardHandle = p.locator(`[data-task-id="${c}"] .task-drag-handle`);
    await keyboardHandle.focus(); await keyboardHandle.press("Space"); await p.waitForTimeout(100); await p.keyboard.press("ArrowUp"); await p.waitForTimeout(200); await p.keyboard.press("Space");
    await uiExpect.poll(async () => (await board(id)).columns.TODO.items.map(item => item.id)).toEqual([c, b]);
    await p.reload(); await uiExpect(p.locator('.task-column[data-status="TODO"] .task-card').first()).toHaveAttribute("data-task-id", c);
    await p.route("**/move", route => route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ success: false, error: { code: "TASK_BOARD_CHANGED", message: "Concurrent reorder" } }) }));
    await p.locator(`[data-task-id="${b}"] .task-card-status`).selectOption("DONE");
    await uiExpect(p.getByRole("alert")).toContainText("Bảng vừa thay đổi"); await uiExpect(p.locator(`.task-column[data-status="TODO"] [data-task-id="${b}"]`)).toBeVisible(); expect((await read(id, b)).status).toBe("TODO");
    await p.unroute("**/move"); await p.locator(`[data-task-id="${b}"] .task-card-status`).selectOption("BLOCKED"); await p.getByRole("textbox", { name: "Điều gì đang gây vướng mắc?" }).fill("Chờ quyền truy cập dữ liệu"); await p.getByRole("button", { name: "Đánh dấu bị chặn" }).click();
    await uiExpect(p.locator(`.task-column[data-status="BLOCKED"] [data-task-id="${b}"]`)).toBeVisible(); expect((await read(id, b)).blockedReason).toBe("Chờ quyền truy cập dữ liệu");
    await p.context().close();
  }, 60000);
  it("renders real populated/empty boards, list, dark theme and mobile drawer without page overflow", async () => {
    const id = await project();
    const p = await page(), out = "../../artifacts/research-task-board"; await mkdir(out, { recursive: true });
    await p.goto(`${origin}/projects/${id}?tab=tasks`); await uiExpect(p.locator(".task-column-empty")).toHaveCount(4, { timeout: 30000 }); await p.screenshot({ path: `${out}/board-empty.png`, fullPage: true });
    for (const [title, status, priority, assigned] of [
      ["Tổng hợp tài liệu về LLM trong nghiên cứu", "TODO", "HIGH", true], ["Xây dựng bộ tiêu chí sàng lọc", "TODO", "MEDIUM", false], ["So sánh ba phương pháp đánh giá", "TODO", "LOW", true],
      ["Trích xuất bằng chứng từ 12 bài báo", "IN_PROGRESS", "HIGH", true], ["Viết phần phương pháp nghiên cứu", "IN_PROGRESS", "MEDIUM", false],
      ["Kiểm chứng khoảng trống nghiên cứu", "BLOCKED", "URGENT", true], ["Thống nhất câu hỏi nghiên cứu", "DONE", "MEDIUM", true], ["Hoàn thiện chiến lược tìm kiếm", "DONE", "LOW", true],
    ] as const) await create(id, { title, status, priority, assigneeId: assigned ? member.userId : null, blockedReason: status === "BLOCKED" ? "Chờ nhóm tác giả chia sẻ bộ dữ liệu gốc." : "", dueAt: "2026-11-20T00:00:00.000Z" });
    await p.reload(); await uiExpect(p.locator(".task-card")).toHaveCount(8, { timeout: 30000 });
    await p.screenshot({ path: `${out}/board-desktop.png`, fullPage: true });
    const statusControl = p.locator(".task-card-status").first();
    expect(await statusControl.evaluate(element => { const style = getComputedStyle(element); return element.clientHeight >= parseFloat(style.fontSize) * 1.5 + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom); })).toBe(true);
    await p.locator(".task-card-title").first().click(); await uiExpect(p.getByRole("dialog").getByRole("textbox", { name: "Tên công việc", exact: true })).toBeVisible(); await p.screenshot({ path: `${out}/drawer-desktop.png`, fullPage: false }); await p.getByRole("button", { name: "Đóng chi tiết công việc", exact: true }).click();
    await p.getByRole("button", { name: "Danh sách", exact: true }).click(); await uiExpect(p.locator(".task-list tbody tr")).toHaveCount(8); await p.screenshot({ path: `${out}/list-desktop.png`, fullPage: true });
    await p.getByRole("button", { name: "Bảng", exact: true }).click(); await p.evaluate(() => document.documentElement.classList.add("dark")); await p.screenshot({ path: `${out}/board-dark.png`, fullPage: true }); await p.evaluate(() => document.documentElement.classList.remove("dark"));
    await p.setViewportSize({ width: 820, height: 1180 }); await p.screenshot({ path: `${out}/board-tablet.png`, fullPage: true }); expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await p.setViewportSize({ width: 390, height: 844 }); await p.screenshot({ path: `${out}/board-mobile.png`, fullPage: true }); expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await p.locator(".task-card-title").first().click(); await uiExpect(p.getByRole("dialog").getByRole("textbox", { name: "Tên công việc", exact: true })).toBeVisible(); await p.screenshot({ path: `${out}/drawer-mobile.png`, fullPage: false }); expect(await p.getByRole("dialog").evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await p.context().close();
  }, 60000);
  it("keeps a stale browser draft on conflict and exposes the latest version for deliberate recovery", async () => {
    const id = await project(), tid = await create(id), a = await page(), b = await page(member);
    await Promise.all([a.goto(`${origin}/projects/${id}?tab=tasks&task=${tid}`), b.goto(`${origin}/projects/${id}?tab=tasks&task=${tid}`)]);
    const description = (p: Page) => p.getByRole("dialog").getByRole("textbox", { name: "Mô tả", exact: true });
    await Promise.all([uiExpect(description(a)).toBeVisible({ timeout: 30000 }), uiExpect(description(b)).toBeVisible({ timeout: 30000 })]);
    await description(b).fill("Member draft kept after conflict");
    await a.getByRole("dialog").getByRole("combobox", { name: /Ưu tiên/ }).selectOption("URGENT"); await a.getByRole("button", { name: "Lưu công việc", exact: true }).click();
    await uiExpect.poll(async () => (await read(id, tid)).priority).toBe("URGENT");
    await b.getByRole("button", { name: "Lưu công việc", exact: true }).click(); await uiExpect(b.getByRole("dialog").getByRole("alert")).toBeVisible(); await uiExpect(description(b)).toHaveValue("Member draft kept after conflict");
    await uiExpect(b.getByRole("button", { name: "Tải phiên bản mới nhất", exact: true })).toBeVisible();
    expect((await read(id, tid)).description).toBe(""); expect((await read(id, tid)).priority).toBe("URGENT");
    await b.getByRole("button", { name: "Tải phiên bản mới nhất", exact: true }).click();
    await b.getByRole("alertdialog").getByRole("button", { name: "Rời đi, không lưu", exact: true }).click(); await uiExpect(description(b)).toHaveValue("");
    await Promise.all([a.context().close(), b.context().close()]);
  }, 60000);
});
