import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { Queue } from "bullmq";
import type { MentorshipCollection, MentorshipRequest } from "@trend/shared-types";
import { createApp } from "../../../app.js";
import { getPrisma, disconnectPostgres } from "../../../infrastructure/database/prisma.js";
import { disconnectRedis } from "../../../infrastructure/redis.js";
import * as queues from "../../../infrastructure/queue.js";
import { tokenService, hashOpaqueToken } from "../../auth/token.service.js";
import { authService } from "../../auth/auth.service.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { newCreatedAcademicData, removeCreatedAcademicData } from "./academic-test-data.js";

const enabled = process.env.MENTORSHIP_INTEGRATION === "1";
if (enabled && !new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Use an isolated _test database");

describe.skipIf(!enabled).sequential("two-way mentorship through authenticated HTTP and PostgreSQL", () => {
  const db = getPrisma(), created = newCreatedAcademicData(), tokens = new Map<string, string>();
  let server: Server, origin: string, owner: string, lecturer: string, member: string, project: string;
  beforeAll(async () => {
    server = createApp().listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  beforeEach(async () => {
    const ids = [];
    for (const role of ["STUDENT", "LECTURER", "RESEARCHER"]) {
      const user = await db.user.create({ data: { fullName: `${role} ${crypto.randomUUID().slice(0, 8)}`, email: `${crypto.randomUUID()}@mentorship-http.invalid`, emailVerifiedAt: new Date(), onboardingCompletedAt: new Date() } });
      await db.academicProfile.create({ data: { userId: user.id, academicRole: role, primaryPosition: role === "LECTURER" ? "LECTURER" : "STUDENT", positionTitle: role, positionStatus: role === "LECTURER" ? "VERIFIED" : "NOT_SUBMITTED", roleVerificationStatus: role === "LECTURER" ? "VERIFIED" : "SELF_DECLARED", supportAvailability: { enabled: role === "LECTURER" } } });
      const familyId = crypto.randomUUID();
      await db.refreshToken.create({ data: { userId: user.id, familyId, tokenHash: hashOpaqueToken(crypto.randomUUID()), expiresAt: new Date(Date.now() + 3600000) } });
      tokens.set(user.id, tokenService.signAccessToken({ sub: user.id, systemRole: "USER", sessionId: familyId }).token);
      created.userIds.push(user.id); ids.push(user.id);
    }
    [owner, lecturer, member] = ids;
    project = (await createProjectFixture({ data: { ownerId: owner, title: `Mentorship HTTP ${crypto.randomUUID().slice(0, 8)}`, visibility: "PRIVATE", description: "CONFIDENTIAL-PROJECT-DATA", researchField: "CONFIDENTIAL-FIELD" } })).id;
    await db.projectMember.create({ data: { projectId: project, userId: member } });
  });
  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await removeCreatedAcademicData(created);
    await Promise.all(Object.values(queues).filter((q): q is Queue => q instanceof Queue).map(q => q.close()));
    await disconnectRedis(); await disconnectPostgres();
  });
  async function request<T = Record<string, unknown>>(who: string, path: string, method = "GET", body?: unknown) {
    const response = await fetch(`${origin}/api/v1${path}`, { method, headers: { Authorization: `Bearer ${tokens.get(who)}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const envelope = await response.json() as { data: T; error?: { message: string } };
    return { status: response.status, data: envelope.data, error: envelope.error };
  }
  async function openDiscovery() {
    const settings = await request(owner, `/projects/${project}/mentorship-discovery`, "PUT", { discovery: "SEEKING_MENTOR", summary: "Study design for a controlled experiment", researchAreas: ["Software Engineering"], expertise: ["Evaluation"], mentoringNeeds: "Help design the experiment" });
    expect(settings.status).toBe(200);
  }
  it.each(["PROJECT_TO_LECTURER", "LECTURER_TO_PROJECT"])("%s completes consent, denies private access before acceptance and revokes scoped access on end", async direction => {
    await openDiscovery();
    expect((await request(member, `/projects/${project}/available-mentors`)).status).toBe(200);
    expect((await request(member, `/projects/${project}/mentorships`, "POST", { mentorUserId: lecturer, message: "Forged invitation" })).status).toBe(403);
    const discovery = await request(lecturer, "/projects/academic-support/opportunities?area=Software%20Engineering");
    expect(discovery.status).toBe(200); expect(JSON.stringify(discovery.data)).not.toContain("CONFIDENTIAL");
    const path = `/projects/${project}/${direction === "PROJECT_TO_LECTURER" ? "mentorships" : "mentorship-offers"}`;
    const sender = direction === "PROJECT_TO_LECTURER" ? owner : lecturer, receiver = direction === "PROJECT_TO_LECTURER" ? lecturer : owner;
    const input = { message: "Help design research methods", ...(direction === "PROJECT_TO_LECTURER" ? { mentorUserId: lecturer } : {}) };
    const pending = await request<MentorshipRequest>(sender, path, "POST", input);
    expect(pending.status).toBe(201); expect(JSON.stringify(pending.data)).not.toContain("CONFIDENTIAL");
    expect((await request(sender, path, "POST", input)).status).toBe(409);
    expect((await request(lecturer, `/projects/${project}/academic-support`)).status).toBe(403);
    for (const suffix of ["", "/manuscripts", "/discussions", "/research/papers", "/research/evidence"]) expect([403, 404]).toContain((await request(lecturer, `/projects/${project}${suffix}`)).status);
    const incoming = await request<MentorshipCollection>(receiver, "/projects/academic-support/mine?view=incoming");
    expect(incoming.data.requests.map(r => r.id)).toContain(pending.data.id);
    const accepted = await request<MentorshipRequest>(receiver, `/projects/${project}/mentorships/${pending.data.id}/accept`, "POST", {});
    expect(accepted.status).toBe(200);
    expect((await request(lecturer, `/projects/${project}/academic-support/guidance`, "POST", { note: "Compare multiple baselines" })).status).toBe(201);
    expect((await request(lecturer, `/projects/${project}`, "PUT", { title: "Unauthorized change" })).status).toBe(403);
    expect(await db.projectMember.count({ where: { projectId: project, userId: lecturer } })).toBe(0);
    expect((await request(owner, `/projects/${project}/mentorships/${accepted.data.relationshipId}/end`, "POST", {})).status).toBe(200);
    expect((await request(lecturer, `/projects/${project}/academic-support`)).status).toBe(403);
    expect((await request(lecturer, `/projects/${project}/academic-support/guidance`, "POST", { note: "Too late" })).status).toBe(403);
  });
  it("validates suggestions, enforces owner decisions and retains rejection without granting privileges", async () => {
    expect((await request(member, `/projects/${project}/mentor-suggestions`, "POST", { mentorUserId: lecturer, message: " " })).status).toBe(400);
    expect((await request(member, `/projects/${project}/mentor-suggestions`, "POST", { mentorUserId: lecturer, message: "Recommended evaluation expert" })).status).toBe(201);
    await openDiscovery();
    const offer = await request<MentorshipRequest>(lecturer, `/projects/${project}/mentorship-offers`, "POST", { message: "Offer guidance" });
    expect((await request(member, `/projects/${project}/mentorships/${offer.data.id}/accept`, "POST", {})).status).toBe(403);
    expect((await request(owner, `/projects/${project}/mentorships/${offer.data.id}/decline`, "POST", { note: "Different expertise needed" })).status).toBe(200);
    expect((await request(owner, `/projects/${project}/mentorships/${offer.data.id}/accept`, "POST", {})).status).toBe(409);
    expect(await db.mentorRelationship.count({ where: { projectId: project } })).toBe(0);
    expect((await request(lecturer, `/projects/${project}/academic-support`)).status).toBe(403);
    expect((await request(owner, `/projects/${project}/mentorships?pageSize=500`)).status).toBe(400);
  });

  it.skipIf(process.env.MENTORSHIP_BROWSER !== "1")("operates both real browser flows and compact Vietnamese mobile forms", async () => {
    const { chromium, expect: browserExpect } = await import("@playwright/test");
    const browser = await chromium.launch({ headless: true }), errors: string[] = [];
    async function pageFor(who: string) {
      const context = await browser.newContext({ viewport: { width: 1365, height: 980 } });
      const user = await authService.me(who);
      await context.addInitScript(({ user, token }) => { localStorage.setItem("lumigap.uiLanguage", "vi"); localStorage.setItem("trend-auth", JSON.stringify({ version: 1, state: { user, tokens: { accessToken: token, refreshToken: "unused-in-test" } } })); }, { user, token: tokens.get(who)! });
      const page = await context.newPage(); page.setDefaultTimeout(15000); page.setDefaultNavigationTimeout(30000); page.on("pageerror", error => errors.push(error.message));
      // Forward API requests to the real isolated app, without fixture responses.
      await page.route("**/api/v1/**", async route => {
        const url = new URL(route.request().url());
        if (url.pathname.endsWith("/stream")) return route.abort();
        await route.continue({ url: `${origin}${url.pathname}${url.search}` });
      });
      return page;
    }
    try {
      const ownerPage = await pageFor(owner), lecturerPage = await pageFor(lecturer), memberPage = await pageFor(member);
      await openDiscovery();
      await memberPage.goto("http://127.0.0.1:5180/academic-support?projectId=" + project);
      await memberPage.getByText("Tìm mentor", { exact: true }).click();
      const lecturerName = (await db.user.findUniqueOrThrow({ where: { id: lecturer } })).fullName;
      await memberPage.getByRole("textbox", { name: "Tìm mentor đang nhận nhóm", exact: true }).fill(lecturerName);
      await memberPage.getByRole("article").filter({ hasText: lecturerName }).getByRole("button", { name: "Đề xuất cố vấn", exact: true }).click();
      await memberPage.getByRole("dialog").locator("textarea").fill("Phù hợp với phương pháp nghiên cứu của nhóm");
      await memberPage.getByRole("button", { name: "Gửi đề xuất", exact: true }).click();
      await browserExpect(memberPage.getByRole("dialog")).toHaveCount(0);
      await ownerPage.goto("http://127.0.0.1:5180/academic-support?projectId=" + project);
      await ownerPage.getByRole("button", { name: "Mời làm mentor", exact: true }).click();
      await ownerPage.getByRole("dialog").locator("textarea").fill("Mời thầy cô hỗ trợ thiết kế thực nghiệm");
      await ownerPage.getByRole("button", { name: "Gửi lời mời", exact: true }).click();
      await browserExpect(ownerPage.getByRole("dialog")).toHaveCount(0);
      await lecturerPage.goto("http://127.0.0.1:5180/academic-support");
      await lecturerPage.getByRole("button", { name: "Chấp nhận", exact: true }).click();
      await lecturerPage.getByRole("button", { name: "Xác nhận", exact: true }).click();
      await browserExpect(lecturerPage.getByRole("dialog")).toHaveCount(0);
      await lecturerPage.getByRole("button", { name: "Quan hệ cố vấn đang hoạt động", exact: true }).click();
      await lecturerPage.getByRole("button", { name: /^Mở (project|dự án)$/ }).click();
      await browserExpect(lecturerPage.getByText("CONFIDENTIAL-PROJECT-DATA", { exact: true })).toBeVisible();
      const relationship = await db.mentorRelationship.findFirstOrThrow({ where: { projectId: project, status: "ACTIVE" } });
      await request(owner, `/projects/${project}/mentorships/${relationship.id}/end`, "POST", {});
      const other = await createProjectFixture({ data: { ownerId: owner, title: "Discoverable mentorship browser project", mentorshipDiscovery: "SEEKING_MENTOR", mentorshipSummary: "Safe shared preview for the offer flow", mentorshipResearchAreas: ["Software Engineering"], mentorshipNeeds: "Help with evaluation", visibility: "PRIVATE", description: "PRIVATE-OFFER-RESEARCH" } });
      await lecturerPage.reload();
      await lecturerPage.getByRole("textbox", { name: "Tìm dự án cần hướng dẫn", exact: true }).fill(other.title);
      await lecturerPage.getByRole("article").filter({ hasText: other.title }).getByRole("button", { name: "Đề nghị hướng dẫn", exact: true }).click();
      await lecturerPage.getByRole("dialog").locator("textarea").fill("Tôi có thể hỗ trợ thiết kế đánh giá");
      await lecturerPage.getByRole("button", { name: "Gửi đề nghị", exact: true }).click();
      await browserExpect(lecturerPage.getByRole("dialog")).toHaveCount(0);
      await ownerPage.reload();
      await ownerPage.getByRole("button", { name: "Chấp nhận", exact: true }).click();
      await ownerPage.getByRole("button", { name: "Xác nhận", exact: true }).click();
      await browserExpect(ownerPage.getByRole("dialog")).toHaveCount(0);
      await lecturerPage.goto("http://127.0.0.1:5180/academic-support?projectId=" + other.id);
      await browserExpect(lecturerPage.getByText("PRIVATE-OFFER-RESEARCH", { exact: true })).toBeVisible();
      await lecturerPage.screenshot({ path: "../../artifacts/mentorship/two-way-lecturer-desktop.png", fullPage: true });
      await ownerPage.goto("http://127.0.0.1:5180/academic-support?projectId=" + other.id);
      await ownerPage.setViewportSize({ width: 390, height: 844 });
      await ownerPage.getByRole("button", { name: "Chỉnh sửa tìm người hướng dẫn", exact: true }).click();
      await browserExpect(ownerPage.locator("#mentor-needs")).toBeVisible();
      expect((await ownerPage.locator("#mentor-safe-summary").boundingBox())!.width).toBeGreaterThan(230);
      expect(await ownerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await ownerPage.locator("#mentor-needs").fill("Cần góp ý thiết kế đánh giá và phương pháp thực nghiệm");
      await ownerPage.evaluate(() => scrollTo(0, 0));
      await ownerPage.screenshot({ path: "../../artifacts/mentorship/two-way-owner-mobile.png", fullPage: true });
      await ownerPage.getByRole("button", { name: "Lưu cài đặt tìm người hướng dẫn", exact: true }).click();
      await browserExpect(ownerPage.locator("#mentor-needs")).toHaveCount(0);
      expect((await db.project.findUniqueOrThrow({ where: { id: other.id } })).mentorshipNeeds).toContain("Cần góp ý");
      expect(errors).toEqual([]);
    } catch (error) {
      for (const [i, context] of browser.contexts().entries()) for (const page of context.pages()) await page.screenshot({ path: `../../artifacts/mentorship/two-way-failure-${i}.png`, fullPage: true }).catch(() => {});
      throw error;
    } finally {
      await Promise.all(browser.contexts().flatMap(context => context.pages().map(page => page.unrouteAll({ behavior: "wait" }))));
      await browser.close();
    }
  }, 120000);
});
