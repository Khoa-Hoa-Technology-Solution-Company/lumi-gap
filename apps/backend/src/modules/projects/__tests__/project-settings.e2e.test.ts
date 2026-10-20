import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { mkdir } from "node:fs/promises";
import { chromium, expect as uiExpect, type Browser } from "@playwright/test";
import { createApp } from "../../../app.js";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { tokenService, hashOpaqueToken } from "../../auth/token.service.js";
import { manuscriptService } from "../../workspaces/manuscript.service.js";
import { attachManuscriptCollaboration } from "../../workspaces/manuscript-collaboration.js";
import { WebSocket } from "ws";
import { runRagPipeline } from "../../reports/rag.service.js";

const isolated = process.env.PROJECT_SETTINGS_INTEGRATION === "1" && process.env.DATABASE_URL?.includes("127.0.0.1:15439/lumigap_project_slice_test") && process.env.REDIS_URL === "redis://127.0.0.1:16389";
describe.skipIf(!isolated).sequential("project settings through real HTTP, PostgreSQL and Chromium", () => {
  const db = getPrisma(); let server: Server, base: string, browser: Browser, closeGateway: () => Promise<void>;
  let owner: Awaited<ReturnType<typeof actor>>, member: typeof owner, outsider: typeof owner, lecturer: typeof owner, admin: typeof owner, projectId: string;
  const secret = "CONFIDENTIAL objectives and methods";
  async function actor(name: string, role: "USER" | "ADMIN" = "USER", verifiedLecturer = false) {
    const user = await db.user.create({ data: { fullName: name, email: `settings-${crypto.randomUUID()}@example.org`, emailVerifiedAt: new Date(), onboardingCompletedAt: new Date(), systemRole: role, admissionBasis: "INVITATION" } });
    await db.userEmail.create({ data: { userId: user.id, normalizedEmail: user.email, isPrimary: true, verifiedAt: new Date(), purpose: "ACCOUNT" } });
    await db.academicProfile.create({ data: { userId: user.id, primaryPosition: verifiedLecturer ? "LECTURER" : "RESEARCH_STAFF", academicRole: verifiedLecturer ? "LECTURER" : "RESEARCHER", roleVerificationStatus: verifiedLecturer ? "VERIFIED" : "SELF_DECLARED", positionStatus: verifiedLecturer ? "VERIFIED" : "NOT_SUBMITTED", supportAvailability: { enabled: true } } });
    const sessionId = crypto.randomUUID(); await db.refreshToken.create({ data: { userId: user.id, familyId: sessionId, tokenHash: hashOpaqueToken(crypto.randomUUID()), expiresAt: new Date(Date.now() + 3600000) } });
    return { userId: user.id, sessionId, token: tokenService.signAccessToken({ sub: user.id, systemRole: role, sessionId }).token };
  }
  async function call(path: string, who?: typeof owner, method = "GET", body?: unknown) {
    const response = await fetch(`${base}/api/v1/projects${path}`, { method, headers: { ...(who ? { Authorization: `Bearer ${who.token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, headers: response.headers, json: await response.json() };
  }
  const read = async () => (await call(`/${projectId}`, owner)).json.data;
  beforeAll(async () => {
    server = createServer(createApp()); closeGateway = attachManuscriptCollaboration(server); server.listen(14039, "127.0.0.1"); await once(server, "listening"); base = "http://127.0.0.1:14039";
    owner = await actor("Research owner"); member = await actor("Team member"); outsider = await actor("Nonmember"); lecturer = await actor("Verified lecturer", "USER", true); admin = await actor("Admin", "ADMIN");
    const created = await call("", owner, "POST", { title: "Team settings study", description: secret, researchAreas: ["Computer Science"], idempotencyKey: crypto.randomUUID() });
    expect(created.status).toBe(201); projectId = created.json.data._id;
  }, 30000);
  afterAll(async () => { if (browser) await browser.close(); if (server?.listening) { await closeGateway(); server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); } });

  it("validates scoped general edits, persists reloads and rejects stale versions", async () => {
    const original = await read(); expect(original).toMatchObject({ visibility: "PRIVATE", mentorshipDiscovery: "CLOSED", description: secret });
    for (const body of [{ title: " " }, { researchAreas: ["A", "B", "C", "D"] }, { researchAreas: ["A", "a"] }]) expect((await call(`/${projectId}`, owner, "PUT", body)).status).toBe(400);
    const saved = await call(`/${projectId}`, owner, "PUT", { title: "Updated research title", researchAreas: ["Computer Science", "Artificial Intelligence", "Custom research area"], researchApproach: "EMPIRICAL", expectedVersion: original.version });
    expect(saved.status).toBe(200);
    expect(await read()).toMatchObject({ title: "Updated research title", researchApproach: "EMPIRICAL", description: secret, visibility: "PRIVATE" });
    expect((await call(`/${projectId}`, owner, "PUT", { title: "Stale title", expectedVersion: original.version })).status).toBe(409);
    expect((await db.researchPlan.findUniqueOrThrow({ where: { projectId } })).approach).toBe("EMPIRICAL");
  });
  it("enforces owner-only settings and preserves the member invitation workflow", async () => {
    const invite = await call(`/${projectId}/invitations`, owner, "POST", { userId: member.userId }); expect(invite.status).toBe(201);
    expect((await call(`/${projectId}/invitations/${invite.json.data.id}/accept`, member, "POST")).status).toBe(200);
    for (const who of [member, outsider, lecturer, admin]) {
      expect([403, 404]).toContain((await call(`/${projectId}`, who, "PUT", { visibility: "PUBLIC", publicSummary: "Unauthorized" })).status);
      expect([403, 404]).toContain((await call(`/${projectId}/mentorship-discovery`, who, "PUT", { discovery: "SEEKING_MENTOR", summary: "Unauthorized preview", expertise: [] })).status);
      expect([403, 404]).toContain((await call(`/${projectId}/archive`, who, "POST")).status);
    }
    expect((await call(`/${projectId}/team`, member)).status).toBe(200);
  });
  it("publishes only an explicit summary and revokes public reads immediately", async () => {
    expect((await call(`/${projectId}`, owner, "PUT", { visibility: "PUBLIC" })).status).toBe(400);
    expect((await call(`/${projectId}`, owner, "PUT", { visibility: "PUBLIC", publicSummary: "Safe public introduction", expectedVersion: (await read()).version })).status).toBe(200);
    const publicRead = await call(`/${projectId}`); expect(publicRead.status).toBe(200);
    expect(publicRead.headers.get("cache-control")).toContain("no-store");
    expect(publicRead.json.data).toMatchObject({ title: "Updated research title", description: "Safe public introduction", members: [], papers: [], ownerId: "", memberCount: 0, paperCount: 0 });
    expect(JSON.stringify(publicRead.json)).not.toContain(secret);
    for (const path of ["team", "activity", "plan", "academic-support", "papers", "evidence", "tasks", "discussions", "contributions"]) expect([401, 403, 404]).toContain((await call(`/${projectId}/${path}`, outsider)).status);
    expect((await call(`/${projectId}`, owner, "PUT", { visibility: "PRIVATE", expectedVersion: (await read()).version })).status).toBe(200);
    expect((await call(`/${projectId}`)).status).toBe(404); expect((await call(`/${projectId}`, outsider)).status).toBe(404);
    expect((await read()).publicSummary).toBe("Safe public introduction");
  });
  it("keeps private mentor discovery scoped, versioned and dependent on mutual consent", async () => {
    const current = (await call(`/${projectId}/mentorship-discovery`, owner)).json.data;
    const input = { discovery: "SEEKING_MENTOR", summary: "Safe mentor-facing study preview", expertise: ["Study design"], expectedVersion: current.version };
    expect((await call(`/${projectId}/mentorship-discovery`, owner, "PUT", input)).status).toBe(200);
    expect((await call(`/${projectId}/mentorship-discovery`, owner, "PUT", input)).status).toBe(409);
    const opportunities = await call("/academic-support/opportunities", lecturer); expect(opportunities.status).toBe(200);
    const preview = opportunities.json.data.items.find((item: { id: string }) => item.id === projectId);
    expect(preview).toMatchObject({ summary: input.summary, expertise: input.expertise });
    expect(Object.keys(preview).sort()).toEqual(["id", "title", "summary", "researchField", "stage", "expertise", "discovery"].sort());
    expect((await call(`/${projectId}`, lecturer)).status).toBe(404); expect((await read()).visibility).toBe("PRIVATE");
    const offer = await call(`/${projectId}/mentorship-offers`, lecturer, "POST", { message: "I can guide your study design", idempotencyKey: crypto.randomUUID() }); expect(offer.status).toBe(201);
    expect((await db.mentorRelationship.count({ where: { projectId, status: "ACTIVE" } }))).toBe(0);
    expect((await call(`/${projectId}/mentorships/${offer.json.data.id}/accept`, owner, "POST", {})).status).toBe(200);
    const version = (await call(`/${projectId}/mentorship-discovery`, owner)).json.data.version;
    expect((await call(`/${projectId}/mentorship-discovery`, owner, "PUT", { ...input, discovery: "CLOSED", expectedVersion: version })).status).toBe(200);
    expect(await db.mentorRelationship.count({ where: { projectId, status: "ACTIVE" } })).toBe(1);
    expect((await call(`/${projectId}`, lecturer, "PUT", { title: "Mentor attack" })).status).toBe(403);
  });
  it("archives and restores without losing records and blocks manuscript and settings writes", async () => {
    const manuscript = await manuscriptService.create(projectId, owner.userId, { title: "Protected manuscript", description: "", template: "PROPOSAL", documentType: "RESEARCH_PROPOSAL", clientKey: crypto.randomUUID() });
    const file = (await manuscriptService.detail(projectId, member.userId, manuscript.id)).mainFileId!;
    const ticket = tokenService.signPurposeToken({ actorId: member.userId, projectId, manuscriptId: manuscript.id, fileId: file, sessionId: member.sessionId }, "manuscript-room", "5m");
    const socket = new WebSocket("ws://127.0.0.1:14039/api/v1/manuscript-collaboration", { origin: "http://127.0.0.1:13000" });
    await once(socket, "open");
    const state = new Promise<Record<string, unknown>>(resolve => { socket.on("message", raw => { const frame = JSON.parse(raw.toString()); if (frame.type === "state") resolve(frame); }); });
    socket.send(JSON.stringify({ type: "hello", ticket, clientId: 4501 })); expect((await state).canWrite).toBe(true);
    expect((await call(`/${projectId}`, owner, "DELETE")).status).toBe(409);
    expect((await call(`/${projectId}/archive`, owner, "POST")).status).toBe(200);
    const rejected = new Promise<Record<string, unknown>>(resolve => { socket.on("message", raw => { const frame = JSON.parse(raw.toString()); if (frame.type === "error") resolve(frame); }); });
    socket.send(JSON.stringify({ type: "update", clientSessionId: crypto.randomUUID(), clientSequence: 1, update: "AAA=" }));
    expect((await rejected).code).toBe("FORBIDDEN"); socket.close();
    const queuedReport = await db.report.create({ data: { projectId, userId: owner.userId, title: "Queued report", query: "Research design", status: "queued" } });
    await expect(runRagPipeline({ reportId: queuedReport.id })).rejects.toMatchObject({ statusCode: 409 });
    expect((await db.report.findUniqueOrThrow({ where: { id: queuedReport.id } })).status).toBe("queued");
    expect((await call(`/${projectId}`, member)).status).toBe(200);
    expect((await call(`/${projectId}`, owner, "PUT", { title: "Archived attack" })).status).toBe(409);
    await expect(manuscriptService.createFile(projectId, member.userId, manuscript.id, { path: "archived.tex", kind: "TEXT", content: "", clientKey: crypto.randomUUID() })).rejects.toMatchObject({ statusCode: 409 });
    expect((await call(`/${projectId}/restore`, owner, "POST")).status).toBe(200);
    expect((await read()).mentorshipDiscovery).toBe("CLOSED");
    expect((await manuscriptService.detail(projectId, owner.userId, manuscript.id)).canWrite).toBe(true);
    const empty = await call("", owner, "POST", { title: "Empty project", idempotencyKey: crypto.randomUUID() });
    expect((await call(`/${empty.json.data._id}`, owner, "DELETE")).status).toBe(200);
  });
  it("persists actual form saves and remains usable at desktop, tablet and mobile widths", async () => {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(({ userId, token }) => { localStorage.setItem("trend-auth", JSON.stringify({ state: { user: { id: userId, systemRole: "USER" }, tokens: { accessToken: token, refreshToken: "synthetic-test-session" } }, version: 1 })); localStorage.setItem("lumigap.uiLanguage", "vi"); }, owner);
    const page = await context.newPage(); const origin = "http://127.0.0.1:13000";
    await page.goto(`${origin}/projects/${projectId}?tab=members&team=settings`);
    const title = page.locator("#project-settings-title"); await uiExpect(title).toBeVisible({ timeout: 30000 });
    await title.fill("Tên dự án dài về phương pháp nghiên cứu và cộng tác học thuật đa cơ sở");
    await page.getByRole("button", { name: "Lưu thông tin chung", exact: true }).click();
    await uiExpect(page.getByRole("button", { name: "Lưu thông tin chung", exact: true })).toBeDisabled();
    await page.reload(); await uiExpect(title).toHaveValue("Tên dự án dài về phương pháp nghiên cứu và cộng tác học thuật đa cơ sở");
    await uiExpect(page.locator("#project-public-summary")).toHaveCount(0);
    await uiExpect(page.locator("#project-settings-panel details")).not.toHaveAttribute("open", "");
    await page.getByRole("radio").nth(1).check(); await page.locator("#project-public-summary").fill("Giới thiệu công khai được chủ dự án lựa chọn.");
    await page.getByRole("button", { name: "Lưu quyền riêng tư", exact: true }).click();
    await uiExpect(page.getByRole("dialog")).toBeVisible(); await page.getByRole("button", { name: "Xác nhận công khai", exact: true }).click();
    await uiExpect(page.getByRole("dialog")).toHaveCount(0);
    expect((await call(`/${projectId}`)).json.data.description).toBe("Giới thiệu công khai được chủ dự án lựa chọn.");
    await mkdir("../../docs/project-settings-screenshots", { recursive: true });
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() => window.scrollTo(0, 0));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: `../../docs/project-settings-screenshots/settings-${width}.png`, fullPage: true });
    }
    await page.getByRole("radio").nth(0).check(); await page.getByRole("button", { name: "Lưu quyền riêng tư", exact: true }).click();
    await uiExpect(page.getByRole("button", { name: "Lưu quyền riêng tư", exact: true })).toBeDisabled(); expect((await call(`/${projectId}`)).status).toBe(404);
    await page.goto(`${origin}/projects/${projectId}?tab=support`);
    await uiExpect(page.getByRole("button", { name: "Bật tìm kiếm người hướng dẫn", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Bật tìm kiếm người hướng dẫn", exact: true }).click();
    await page.locator("#mentor-safe-summary").fill("Tóm tắt an toàn cho giảng viên muốn hướng dẫn nghiên cứu.");
    await page.getByRole("button", { name: "Lưu cài đặt tìm người hướng dẫn", exact: true }).click();
    await uiExpect(page.getByRole("button", { name: "Chỉnh sửa tìm người hướng dẫn", exact: true })).toBeVisible();
    expect((await read()).visibility).toBe("PRIVATE");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: "../../docs/project-settings-screenshots/mentor-390.png", fullPage: true });
  }, 90000);
});
