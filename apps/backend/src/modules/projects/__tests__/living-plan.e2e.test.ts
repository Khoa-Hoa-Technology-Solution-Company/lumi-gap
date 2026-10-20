import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { mkdir } from "node:fs/promises";
import { chromium, expect as uiExpect, type Browser, type Page } from "@playwright/test";
import type { PlanDraftUpdate, ResearchPlanContent, ResearchPlanView } from "@trend/shared-types";
import { createApp } from "../../../app.js";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { tokenService, hashOpaqueToken } from "../../auth/token.service.js";

const isolated = process.env.LIVING_PLAN_INTEGRATION === "1" && process.env.DATABASE_URL?.includes("127.0.0.1:15439/lumigap_project_slice_test") && process.env.REDIS_URL === "redis://127.0.0.1:16389";
describe.skipIf(!isolated).sequential("Living plan with HTTP, PostgreSQL and Chromium", () => {
  const db = getPrisma(); let server: Server, browser: Browser;
  let owner: Awaited<ReturnType<typeof actor>>, member: typeof owner, outsider: typeof owner, mentor: typeof owner, lecturer: typeof owner, admin: typeof owner;
  const base = "http://127.0.0.1:14040/api/v1", origin = "http://127.0.0.1:13001";
  async function actor(name: string, role: "USER" | "ADMIN" = "USER", verified = false) {
    const user = await db.user.create({ data: { fullName: name, email: `plan-${crypto.randomUUID()}@example.org`, emailVerifiedAt: new Date(), onboardingCompletedAt: new Date(), systemRole: role, admissionBasis: "INVITATION" } });
    await db.userEmail.create({ data: { userId: user.id, normalizedEmail: user.email, isPrimary: true, verifiedAt: new Date(), purpose: "ACCOUNT" } });
    await db.academicProfile.create({ data: { userId: user.id, primaryPosition: verified ? "LECTURER" : "RESEARCH_STAFF", academicRole: verified ? "LECTURER" : "RESEARCHER", roleVerificationStatus: verified ? "VERIFIED" : "SELF_DECLARED", positionStatus: verified ? "VERIFIED" : "NOT_SUBMITTED", supportAvailability: { enabled: true } } });
    const sessionId = crypto.randomUUID(); await db.refreshToken.create({ data: { userId: user.id, familyId: sessionId, tokenHash: hashOpaqueToken(crypto.randomUUID()), expiresAt: new Date(Date.now() + 3600000) } });
    return { userId: user.id, sessionId, token: tokenService.signAccessToken({ sub: user.id, systemRole: role, sessionId }).token };
  }
  async function request(path: string, who: typeof owner | undefined = owner, method = "GET", body?: unknown) {
    const response = await fetch(`${base}${path}`, { method, headers: { ...(who ? { Authorization: `Bearer ${who.token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, json: await response.json() };
  }
  const call = (id: string, path = "/plan", who = owner, method = "GET", body?: unknown) => request(`/projects/${id}${path}`, who, method, body);
  const read = async (id: string, who = owner): Promise<ResearchPlanView> => (await call(id, "/plan", who)).json.data;
  async function project() {
    const created = await request("/projects", owner, "POST", { title: "Living research plan", description: "Short project summary, distinct from the research problem", idempotencyKey: crypto.randomUUID() });
    expect(created.status).toBe(201); const id = created.json.data._id as string;
    const invitation = await call(id, "/invitations", owner, "POST", { userId: member.userId });
    expect((await call(id, `/invitations/${invitation.json.data.id}/accept`, member, "POST")).status).toBe(200);
    return id;
  }
  function patch(view: ResearchPlanView, changes: Partial<ResearchPlanContent>): PlanDraftUpdate {
    return { expectedVersion: view.version, clientKey: crypto.randomUUID(), base: Object.fromEntries(Object.keys(changes).map(key => [key, view.content[key as keyof ResearchPlanContent]])), changes };
  }
  const save = (id: string, input: PlanDraftUpdate, who = owner) => call(id, "/plan/draft", who, "PATCH", input);
  const snapshot = async (id: string, note = "Direction checkpoint") => { const current = await read(id); const result = await call(id, "/plan/revisions", owner, "POST", { expectedVersion: current.version, clientKey: crypto.randomUUID(), changeSummary: note }); expect(result.status).toBe(201); return result.json.data as { revisionId: string; version: number }; };
  beforeAll(async () => {
    server = createServer(createApp()); server.listen(14040, "127.0.0.1"); await once(server, "listening");
    owner = await actor("Research owner"); member = await actor("Research member"); outsider = await actor("Nonmember"); mentor = await actor("Active mentor", "USER", true); lecturer = await actor("Unassigned verified lecturer", "USER", true); admin = await actor("Admin", "ADMIN");
  }, 30000);
  afterAll(async () => { if (browser) await browser.close(); if (server?.listening) { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); } });

  it("persists an incomplete draft, keeps description distinct, and creates no snapshot on autosave", async () => {
    const id = await project(), first = await read(id); expect(first.content.problem).toBe(""); expect(first.currentRevisionId).toBeNull();
    const input = patch(first, { problem: "Initial partial idea" });
    expect((await save(id, input, member)).status).toBe(200); expect((await read(id)).content.problem).toBe("Initial partial idea");
    expect((await call(id, "/plan/revisions")).json.data.total).toBe(0);
    expect((await call(id, "")).json.data.description).toBe("Short project summary, distinct from the research problem");
    const version = (await read(id)).version;
    expect((await save(id, input, member)).json.data.version).toBe(version);
    expect((await save(id, { ...input, changes: { problem: "Changed retry" } }, member)).status).toBe(409);
    expect(await db.projectActivity.count({ where: { projectId: id, type: "PLAN_DRAFT_SAVED" } })).toBe(1);
  });
  it("merges independent stale sections and rejects overlapping concurrent updates", async () => {
    const id = await project(), first = await read(id);
    const results = await Promise.all([save(id, patch(first, { problem: "A focused problem" })), save(id, patch(first, { methodology: "Interviews" }), member)]);
    expect(results.map(result => result.status)).toEqual([200, 200]); expect((await read(id)).content).toMatchObject({ problem: "A focused problem", methodology: "Interviews" });
    const common = await read(id); const overlap = await Promise.all([save(id, patch(common, { problem: "Owner edit" })), save(id, patch(common, { problem: "Member edit" }), member)]);
    expect(overlap.map(result => result.status).sort()).toEqual([200, 409]);
    expect(overlap.find(result => result.status === 409)?.json.error.details.fields).toEqual(["problem"]);
  });
  it("validates lists, forged fields, question links and canonical criteria/approach", async () => {
    const id = await project(), first = await read(id);
    for (const changes of [{ objectives: Array(21).fill("Goal") }, { objectives: ["x".repeat(501)] }, { questions: [{ id: crypto.randomUUID(), text: "RQ", sourceGapId: crypto.randomUUID() }] }]) expect((await save(id, patch(first, changes))).status).toBe(400);
    expect((await save(id, { ...patch(first, { problem: "Real" }), creatorId: outsider.userId } as PlanDraftUpdate)).status).toBe(400);
    expect((await save(id, { ...patch(first, { problem: "Real" }), base: {} })).status).toBe(400);
    const question = { id: crypto.randomUUID(), text: "How do researchers use evidence?" };
    expect((await save(id, patch(first, { objectives: ["Explore use", "Compare approaches"], questions: [question], methodology: "Retained methods", searchStrategy: "Shared sources", inclusionCriteria: ["Peer-reviewed studies"], approach: "EMPIRICAL" }), member)).status).toBe(200);
    expect((await call(id, "/workspace/artifacts?kind=QUESTION&q=researchers")).json.data).toContainEqual({ kind: "QUESTION", id: question.id, label: question.text });
    const settings = await call(id, ""); expect(settings.json.data.researchApproach).toBe("EMPIRICAL"); expect(settings.json.data.screeningCriteria.inclusion).toEqual(["Peer-reviewed studies"]);
    expect((await call(id, "", owner, "PUT", { researchApproach: "LITERATURE_REVIEW", expectedVersion: settings.json.data.version })).status).toBe(200);
    expect((await read(id)).content).toMatchObject({ approach: "LITERATURE_REVIEW", methodology: "Retained methods", searchStrategy: "Shared sources", questions: [question] });
    expect((await call(id, "/plan/revisions")).json.data.total).toBe(0);
  });
  it("captures immutable questions and restores into a new draft without changing versions", async () => {
    const id = await project(), qid = crypto.randomUUID();
    await save(id, patch(await read(id), { problem: "Original problem", objectives: ["Goal"], questions: [{ id: qid, text: "Original RQ" }], methodology: "Original methodology" }));
    const one = await snapshot(id, "First deliberate version"), original = (await call(id, `/plan?revisionId=${one.revisionId}`)).json.data;
    await save(id, patch(await read(id), { problem: "Revised problem", questions: [{ id: qid, text: "Revised RQ" }] })); const two = await snapshot(id);
    expect((await call(id, `/plan?revisionId=${one.revisionId}`)).json.data.content).toEqual(original.content);
    const current = await read(id), input = { expectedVersion: current.version, clientKey: crypto.randomUUID() };
    const restored = await call(id, `/plan/revisions/${one.revisionId}/restore`, member, "POST", input); expect(restored.status).toBe(200); expect(restored.json.data.version).toBeGreaterThan(current.version);
    expect((await read(id)).content.questions[0]?.text).toBe("Original RQ");
    expect((await call(id, `/plan/revisions/${one.revisionId}/restore`, member, "POST", input)).json.data.version).toBe(restored.json.data.version);
    expect((await call(id, `/plan?revisionId=${two.revisionId}`)).json.data.content.problem).toBe("Revised problem");
    await expect(db.planRevision.update({ where: { id: one.revisionId }, data: { changeSummary: "Forged" } })).rejects.toThrow();
    expect((await call(id, `/plan/revisions/${one.revisionId}`, owner, "PUT", { snapshot: {} })).status).toBe(404);
  });
  it("keeps exact-version section feedback with replies, resolution, history and live share revocation", async () => {
    const id = await project(), current = await read(id);
    await save(id, patch(current, { methodology: "A versioned method" })); const one = await snapshot(id);
    const invitation = await call(id, "/mentorships", owner, "POST", { mentorUserId: mentor.userId, message: "Please advise our research", idempotencyKey: crypto.randomUUID() });
    expect(invitation.status).toBe(201); expect((await call(id, `/mentorships/${invitation.json.data.id}/accept`, mentor, "POST", {})).status).toBe(200);
    const relationship = await db.mentorRelationship.findFirstOrThrow({ where: { projectId: id, mentorUserId: mentor.userId, status: "ACTIVE" } });
    expect((await call(id, `/plan?revisionId=${one.revisionId}`, mentor)).status).toBe(404);
    const share = await call(id, "/plan/shares", owner, "POST", { revisionId: one.revisionId, relationshipId: relationship.id }); expect(share.status).toBe(201);
    expect((await call(id, `/plan?revisionId=${one.revisionId}`, mentor)).json.data.canEdit).toBe(false);
    const commentInput = { section: "methodology", revisionId: one.revisionId, body: "Please explain the sample selection", clientKey: crypto.randomUUID(), mentions: [] };
    const created = await call(id, "/plan/threads", mentor, "POST", commentInput); expect(created.status).toBe(201); const tid = created.json.data.id;
    expect((await call(id, "/plan/threads", mentor, "POST", commentInput)).json.data.id).toBe(tid);
    expect((await call(id, "/workspace")).json.data.attention.mentorFeedback).toBe(1);
    const notice = await db.notification.findFirstOrThrow({ where: { userId: owner.userId, eventKey: { startsWith: `WORKSPACE:MENTOR_FEEDBACK:${tid}:` } } });
    expect(notice.message).not.toContain(commentInput.body);
    expect((await call(id, `/discussions/${tid}`, member)).json.data.canEdit).toBe(false);
    expect((await call(id, `/discussions/${tid}/messages`, member, "POST", { body: "We will clarify this", clientKey: crypto.randomUUID(), mentions: [], replyToId: null })).status).toBe(201);
    expect((await call(id, "/workspace")).json.data.attention.mentorFeedback).toBe(0);
    expect((await call(id, `/discussions/${tid}/resolve`, member, "POST", { expectedVersion: 1, status: "RESOLVED", conclusion: "Sample rationale added" })).status).toBe(200);
    expect((await call(id, `/discussions/${tid}/resolve`, member, "POST", { expectedVersion: 2, status: "OPEN", conclusion: "Revisit after new evidence" })).status).toBe(200);
    expect((await call(id, `/discussions/${tid}/history`, mentor)).json.data.total).toBe(3);
    expect([403, 404]).toContain((await save(id, patch(await read(id), { methodology: "Mentor overwrite" }), mentor)).status);
    await save(id, patch(await read(id), { methodology: "Improved method" })); const two = await snapshot(id);
    expect((await call(id, `/plan/threads?section=methodology&revisionId=${one.revisionId}`, mentor)).json.data.total).toBe(1);
    expect((await call(id, `/plan/threads?section=methodology&revisionId=${two.revisionId}`)).json.data.total).toBe(0);
    expect((await call(id, "/plan/threads", mentor, "POST", { ...commentInput, revisionId: undefined, clientKey: crypto.randomUUID() })).status).toBe(404);
    expect(await db.reviewerAssignment.count({ where: { reviewerId: mentor.userId } })).toBe(0);
    expect([403, 404]).toContain((await request(`/reviews/${crypto.randomUUID()}/submit`, mentor, "POST", { responses: [], overallComment: "Not assigned" })).status);
    expect((await call(id, `/plan/shares/${share.json.data.id}`, owner, "DELETE")).status).toBe(200);
    expect((await call(id, `/discussions/${tid}`, mentor)).status).toBe(404);
    expect((await call(id, `/plan/threads?section=methodology&revisionId=${one.revisionId}`, mentor)).status).toBe(404);
    expect((await call(id, `/discussions/${tid}`, member)).status).toBe(200);
  });
  it("rejects cross-project and nonmember operations, forged snapshots, archived edits and revoked sessions", async () => {
    const id = await project(), other = await project(), first = await read(id), version = await snapshot(id);
    for (const who of [outsider, lecturer, admin]) {
      expect([403, 404]).toContain((await call(id, "/plan", who)).status);
      expect([403, 404]).toContain((await save(id, patch(first, { problem: "Unauthorized" }), who)).status);
      expect([403, 404]).toContain((await call(id, "/plan/revisions", who, "POST", { expectedVersion: first.version, clientKey: crypto.randomUUID(), changeSummary: "Forged" })).status);
    }
    expect((await call(other, `/plan?revisionId=${version.revisionId}`)).status).toBe(404);
    expect((await call(other, `/plan/revisions/${version.revisionId}/restore`, owner, "POST", { expectedVersion: 1, clientKey: crypto.randomUUID() })).status).toBe(404);
    expect((await call(id, "/plan/revisions", owner, "POST", { expectedVersion: first.version, clientKey: crypto.randomUUID(), changeSummary: "Forged", creatorId: outsider.userId, snapshot: {} })).status).toBe(400);
    expect((await call(id, "/archive", owner, "POST")).status).toBe(200);
    expect((await save(id, patch(first, { problem: "Archived" }))).status).toBe(409);
    expect((await call(id, "/plan/threads", member, "POST", { section: "problem", body: "Archived write", mentions: [], clientKey: crypto.randomUUID() })).status).toBe(409);
    expect((await call(id, "/restore", owner, "POST")).status).toBe(200);
    const own = await read(id), pending = patch(own, { problem: "Before revocation" }); expect((await save(id, pending, member)).status).toBe(200);
    expect((await call(id, `/members/${member.userId}`, owner, "DELETE")).status).toBe(200);
    expect([403, 404]).toContain((await save(id, pending, member)).status);
    const expired = await actor("Expired session");
    await db.refreshToken.updateMany({ where: { familyId: expired.sessionId }, data: { revokedAt: new Date() } });
    expect((await call(id, "/plan", expired)).status).toBe(401);
    expect((await save(id, pending, expired)).status).toBe(401);
  });

  async function authenticatedPage(who = owner): Promise<Page> {
    if (!browser) browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(({ userId, token }) => { localStorage.setItem("trend-auth", JSON.stringify({ state: { user: { id: userId, systemRole: "USER" }, tokens: { accessToken: token, refreshToken: "synthetic-test-session" } }, version: 1 })); localStorage.setItem("lumigap.uiLanguage", "vi"); }, who);
    return context.newPage();
  }
  it("autosaves actual browser edits, survives network failure and preserves collapsed fields on reload", async () => {
    const id = await project(), page = await authenticatedPage(); await page.goto(`${origin}/projects/${id}?tab=plan`);
    const problem = page.getByRole("textbox", { name: "Vấn đề nghiên cứu", exact: true }); await uiExpect(problem).toBeVisible({ timeout: 30000 });
    await uiExpect(page.locator(".living-plan-details")).not.toHaveAttribute("open", "");
    await problem.fill("Vấn đề nghiên cứu ban đầu của nhóm");
    await uiExpect(page.locator(".living-plan-status")).toContainText("Đã lưu bản nháp", { timeout: 15000 });
    expect((await read(id)).content.problem).toBe("Vấn đề nghiên cứu ban đầu của nhóm");
    await page.reload(); await uiExpect(problem).toHaveValue("Vấn đề nghiên cứu ban đầu của nhóm", { timeout: 30000 });
    await page.route("**/plan/draft", route => route.abort("failed"));
    await problem.fill("Bản nháp được giữ khi mất mạng"); await uiExpect(page.locator(".living-plan-status")).toContainText("Chưa thể lưu thay đổi", { timeout: 15000 });
    await uiExpect(problem).toHaveValue("Bản nháp được giữ khi mất mạng"); expect((await read(id)).content.problem).not.toBe("Bản nháp được giữ khi mất mạng");
    await page.unroute("**/plan/draft"); await page.getByRole("button", { name: "Thử lưu lại", exact: true }).click();
    await uiExpect(page.locator(".living-plan-status")).toContainText("Đã lưu bản nháp");
    await page.getByRole("button", { name: "Thêm mục tiêu", exact: true }).click(); await page.getByRole("textbox", { name: "Mục tiêu nghiên cứu 1", exact: true }).fill("Khảo sát cách sử dụng bằng chứng");
    await page.getByRole("button", { name: "Thêm câu hỏi nghiên cứu", exact: true }).click(); await page.getByRole("textbox", { name: "Câu hỏi 1", exact: true }).fill("Bằng chứng ảnh hưởng đến quyết định như thế nào?");
    await page.locator(".living-plan-details > summary").click(); await page.getByRole("textbox", { name: "Phương pháp nghiên cứu", exact: true }).fill("Phỏng vấn kết hợp phân tích tài liệu");
    await page.getByRole("combobox", { name: "Hướng tiếp cận nghiên cứu", exact: true }).selectOption("EMPIRICAL");
    await uiExpect(page.locator(".living-plan-status")).toContainText("Đã lưu bản nháp");
    await page.reload(); await uiExpect(page.getByRole("textbox", { name: "Mục tiêu nghiên cứu 1", exact: true })).toHaveValue("Khảo sát cách sử dụng bằng chứng");
    await page.locator(".living-plan-details > summary").click(); await uiExpect(page.getByRole("textbox", { name: "Phương pháp nghiên cứu", exact: true })).toHaveValue("Phỏng vấn kết hợp phân tích tài liệu");
    await page.locator(".living-plan-details > summary").click();
    expect((await call(id, "/plan/revisions")).json.data.total).toBe(0);
    await mkdir("../../docs/living-plan-screenshots", { recursive: true });
    for (const width of [1440, 768, 390]) { await page.setViewportSize({ width, height: 1000 }); await page.evaluate(() => scrollTo(0, 0)); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: `../../docs/living-plan-screenshots/plan-${width}.png`, fullPage: true }); }
    await page.getByRole("button", { name: "Tạo phiên bản", exact: true }).click(); await page.getByRole("textbox", { name: "Ghi chú thay đổi, không bắt buộc", exact: true }).fill("Thu hẹp hướng nghiên cứu sau thảo luận");
    await page.getByRole("dialog").getByRole("button", { name: "Tạo phiên bản", exact: true }).click();
    await uiExpect(page.locator(".living-plan-status")).toContainText("Phiên bản cố định");
    await page.locator(".living-plan-details > summary").click(); await page.getByRole("button", { name: "Góp ý về Phương pháp nghiên cứu", exact: true }).click();
    await page.getByRole("textbox", { name: "Thêm góp ý cho phần này", exact: true }).fill("Cần làm rõ cách chọn mẫu."); await page.getByRole("button", { name: "Đăng góp ý", exact: true }).click();
    await uiExpect(page.getByRole("textbox", { name: "Thêm góp ý cho phần này", exact: true })).toHaveValue("");
    await uiExpect(page.getByRole("dialog")).toContainText("Cần làm rõ cách chọn mẫu."); await page.getByRole("button", { name: "Đóng", exact: true }).click();
    await save(id, patch(await read(id), { problem: "Later research direction" })); await snapshot(id, "Second checkpoint");
    await page.getByRole("button", { name: "Lịch sử phiên bản", exact: true }).click(); await uiExpect(page.getByRole("dialog")).toContainText("Thu hẹp hướng nghiên cứu sau thảo luận");
    const checks = page.locator('.living-plan-history input[type="checkbox"]'); await checks.nth(0).check(); await checks.nth(1).check();
    await uiExpect(page.locator(".living-plan-comparison")).toContainText("Later research direction");
    await page.locator(".living-plan-history > ul > li").filter({ hasText: "Thu hẹp hướng nghiên cứu sau thảo luận" }).getByRole("button", { name: "Khôi phục vào bản nháp", exact: true }).click();
    await page.getByRole("button", { name: "Xác nhận khôi phục", exact: true }).click();
    await uiExpect(page.getByRole("dialog")).toContainText("Đã khôi phục phiên bản vào bản nháp");
    expect((await read(id)).content.problem).toBe("Bản nháp được giữ khi mất mạng");
    expect((await call(id, "/plan/revisions")).json.data.total).toBe(2);
    await page.context().close();
  }, 120000);
  it("resolves a real conflict between two authenticated browser sessions", async () => {
    const id = await project(), a = await authenticatedPage(), b = await authenticatedPage(member);
    await Promise.all([a.goto(`${origin}/projects/${id}?tab=plan`), b.goto(`${origin}/projects/${id}?tab=plan`)]);
    const textbox = (page: Page) => page.getByRole("textbox", { name: "Vấn đề nghiên cứu", exact: true });
    await Promise.all([uiExpect(textbox(a)).toBeVisible({ timeout: 30000 }), uiExpect(textbox(b)).toBeVisible({ timeout: 30000 })]);
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
    await b.route("**/plan/draft", async route => { await gate; await route.continue(); });
    await textbox(b).fill("Member interpretation"); await textbox(a).fill("Owner interpretation");
    try { await uiExpect(a.locator(".living-plan-status")).toContainText("Đã lưu bản nháp", { timeout: 15000 }); } finally { release(); }
    await uiExpect(b.locator(".living-plan-conflict")).toContainText("Owner interpretation", { timeout: 15000 });
    await uiExpect(textbox(b)).toHaveValue("Member interpretation");
    await b.locator('.living-plan-conflict input[type="radio"]').first().check();
    await b.getByRole("button", { name: "Gộp và tiếp tục", exact: true }).click();
    await uiExpect(b.locator(".living-plan-status")).toContainText("Đã lưu bản nháp", { timeout: 15000 });
    expect((await read(id)).content.problem).toBe("Member interpretation");
    await Promise.all([a.context().close(), b.context().close()]);
  }, 60000);
});
