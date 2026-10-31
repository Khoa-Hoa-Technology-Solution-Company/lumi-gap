import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, expect as uiExpect, type Browser } from "@playwright/test";
import { Worker } from "bullmq";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { mkdir } from "node:fs/promises";
import * as Y from "yjs";
import { createApp } from "../../../app.js";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { makeConnection, QUEUE_NAMES } from "../../../infrastructure/queue.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { tokenService, hashOpaqueToken } from "../../auth/token.service.js";
import { manuscriptService as writing } from "../manuscript.service.js";
import { MANUSCRIPT_WRITING_JOB, manuscriptWritingService } from "../manuscript-writing.service.js";
import { attachManuscriptCollaboration } from "../manuscript-collaboration.js";
import { sourceDocument } from "../manuscript-source.js";

const enabled = process.env.MANUSCRIPT_WRITING_BROWSER === "1";
if (enabled && (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test") || !process.env.REDIS_URL?.endsWith(":16390/1"))) throw new Error("Writing browser test requires its isolated database and Redis DB1");
describe.skipIf(!enabled)("writing evidence in a real browser", () => {
  let browser: Browser, server: Server, worker: Worker, closeGateway: () => Promise<void>;
  beforeAll(async () => {
    server = createServer(createApp()); closeGateway = attachManuscriptCollaboration(server); server.listen(14040, "127.0.0.1"); await once(server, "listening");
    worker = new Worker(QUEUE_NAMES.aiJobs, async job => { if (job.name !== MANUSCRIPT_WRITING_JOB) throw new Error("Unexpected job in isolated writing browser queue"); await manuscriptWritingService.process(job.data.runId as string); }, { connection: makeConnection() });
    browser = await chromium.launch({ headless: true });
  }, 30000);
  afterAll(async () => { if (browser) await browser.close(); if (worker) await worker.close(); if (closeGateway) await closeGateway(); if (server?.listening) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } });
  it("saves, queues, displays a report, creates a draft and stays usable on mobile", async () => {
    const db = getPrisma(), ids: string[] = [];
    for (const fullName of ["Nguyễn Minh An", "Trần Thanh Bình"]) {
      const row = await db.user.create({ data: { fullName, email: `writing-browser-${crypto.randomUUID()}@example.org`, emailVerifiedAt: new Date(), onboardingCompletedAt: new Date() } });
      await db.academicProfile.create({ data: { userId: row.id, primaryPosition: "RESEARCH_STAFF", academicRole: "RESEARCHER" } }); ids.push(row.id);
    }
    const owner = ids[0]!, member = ids[1]!, sessionId = crypto.randomUUID();
    await db.refreshToken.create({ data: { userId: owner, familyId: sessionId, tokenHash: hashOpaqueToken(crypto.randomUUID()), expiresAt: new Date(Date.now() + 3600000) } });
    const token = tokenService.signAccessToken({ sub: owner, systemRole: "USER", sessionId }).token;
    const project = await createProjectFixture({ data: { title: "Đo lường đóng góp viết nghiên cứu", ownerId: owner, status: "ACTIVE" } });
    await db.projectMember.create({ data: { projectId: project.id, userId: member } });
    const manuscript = await writing.create(project.id, owner, { title: "Phân tích dữ liệu nghiên cứu cộng tác", description: "", template: "BLANK", documentType: "RESEARCH_PAPER", clientKey: crypto.randomUUID() });
    const fileId = (await writing.detail(project.id, owner, manuscript.id)).mainFileId!;
    for (const [actor, prose] of [[owner, "Thiết kế nghiên cứu và xây dựng phương pháp. "], [member, "Phân tích dữ liệu và kiểm tra kết quả. "]] as const) {
      const source = await writing.fileContent(project.id, actor, manuscript.id, fileId), doc = sourceDocument(Buffer.from(source.state!, "base64")), vector = Y.encodeStateVector(doc);
      doc.getText("source").insert(doc.getText("source").toString().indexOf("\\end{document}"), prose);
      await writing.applyUpdate(project.id, actor, manuscript.id, fileId, { clientSessionId: crypto.randomUUID(), clientSequence: 1, update: Buffer.from(Y.encodeStateAsUpdate(doc, vector)).toString("base64") }); doc.destroy();
    }
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(({ userId, accessToken }) => {
      localStorage.setItem("trend-auth", JSON.stringify({ state: { user: { id: userId, systemRole: "USER" }, tokens: { accessToken, refreshToken: "isolated-browser-session" } }, version: 1 }));
      localStorage.setItem("lumigap.uiLanguage", "en"); localStorage.setItem("lumigap-ui-language", "en");
    }, { userId: owner, accessToken: token });
    const page = await context.newPage(), errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:13100/projects/${project.id}/manuscripts/${manuscript.id}`);
    await page.locator("#writing-context-panel").selectOption("writing");
    await page.getByRole("button", { name: "Save version and calculate writing", exact: true }).click();
    await uiExpect(page.locator(".writing-contributor-list li")).toHaveCount(2, { timeout: 30000 });
    await page.getByRole("button", { name: "Create contribution draft from this report", exact: true }).click();
    await uiExpect(page.getByRole("link", { name: "Open contributions to review and submit" })).toBeVisible();
    const records = await db.projectContributionProposal.findMany({ where: { projectId: project.id } }); expect(records).toHaveLength(1); expect(records[0]!.status).toBe("DRAFT");
    await mkdir("../../docs/audits/2026-10-28-manuscript-writing", { recursive: true });
    await page.screenshot({ path: "../../docs/audits/2026-10-28-manuscript-writing/desktop.png", fullPage: true, animations: "disabled" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Manuscript actions", exact: true }).click();
    await page.getByRole("menuitem", { name: "Writing contributions", exact: true }).click();
    await uiExpect(page.locator(".writing-contributor-list")).toBeVisible();
    await uiExpect(page.getByRole("menuitem", { name: "Writing contributions", exact: true })).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: "../../docs/audits/2026-10-28-manuscript-writing/mobile.png", fullPage: true, animations: "disabled" });
    expect(errors).toEqual([]); await context.close();
  }, 60000);
});
