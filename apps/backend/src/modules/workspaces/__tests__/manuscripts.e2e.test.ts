import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, expect as uiExpect, type Browser, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { mkdir } from "node:fs/promises";
import { WebSocket } from "ws";
import { createApp } from "../../../app.js";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { tokenService, hashOpaqueToken } from "../../auth/token.service.js";
import { manuscriptService as writing } from "../manuscript.service.js";
import { attachManuscriptCollaboration } from "../manuscript-collaboration.js";
import { sourceText } from "../manuscript-source.js";
import { projectService } from "../../projects/project.service.js";

const isolated = process.env.WRITING_BROWSER_TEST === "1" && process.env.DATABASE_URL?.includes("127.0.0.1:15439/lumigap_project_slice_test") && process.env.REDIS_URL === "redis://127.0.0.1:16389";
describe.skipIf(!isolated).sequential("two actual manuscript sessions in Chromium", () => {
  const db = getPrisma(), origin = "http://127.0.0.1:13000", screenshots = "../../docs/manuscript-screenshots";
  let browser: Browser, server: Server, closeGateway: () => Promise<void>, a: Awaited<ReturnType<typeof actor>>, b: Awaited<ReturnType<typeof actor>>, outsider: Awaited<ReturnType<typeof actor>>, pageA: Page, pageB: Page, project: string, id: string, main: string;
  async function actor(name: string, lecturer = false) {
    const user = await db.user.create({ data: { fullName: name, email: `writing-browser-${crypto.randomUUID()}@example.org`, emailVerifiedAt: new Date(), onboardingCompletedAt: new Date() } });
    await db.academicProfile.create({ data: { userId: user.id, primaryPosition: lecturer ? "LECTURER" : "RESEARCH_STAFF", academicRole: lecturer ? "LECTURER" : "RESEARCHER", roleVerificationStatus: lecturer ? "VERIFIED" : "SELF_DECLARED", positionStatus: lecturer ? "VERIFIED" : "NOT_SUBMITTED", supportAvailability: { enabled: true } } });
    const sessionId = crypto.randomUUID(); await db.refreshToken.create({ data: { userId: user.id, familyId: sessionId, tokenHash: hashOpaqueToken(crypto.randomUUID()), expiresAt: new Date(Date.now() + 3600000) } });
    return { userId: user.id, sessionId, token: tokenService.signAccessToken({ sub: user.id, systemRole: "USER", sessionId }).token };
  }
  async function pageFor(person: Awaited<ReturnType<typeof actor>>) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(({ userId, token }) => { localStorage.setItem("trend-auth", JSON.stringify({ state: { user: { id: userId, systemRole: "USER" }, tokens: { accessToken: token, refreshToken: "synthetic-browser-session" } }, version: 1 })); if (!localStorage.getItem("lumigap.uiLanguage")) localStorage.setItem("lumigap.uiLanguage", "en"); localStorage.setItem("lumigap-ui-language", "en"); }, person);
    return context.newPage();
  }
  async function startServer() { server = createServer(createApp()); closeGateway = attachManuscriptCollaboration(server); server.listen(14039, "127.0.0.1"); await once(server, "listening"); }
  async function stopServer() { await closeGateway(); server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  const url = () => `${origin}/projects/${project}/manuscripts/${id}`;
  const editor = (page: Page) => page.locator(".cm-content[contenteditable=true]");
  async function saved(page: Page) { await uiExpect(page.getByRole("status").filter({ hasText: "Saved to server" })).toBeVisible({ timeout: 15000 }); }
  async function insert(page: Page, value: string) { await editor(page).click(); await page.keyboard.press("Control+Home"); await page.keyboard.insertText(value); await saved(page); }
  async function text(page: Page) { return page.locator(".cm-line").evaluateAll(lines => lines.map(line => { const clone = line.cloneNode(true) as HTMLElement; clone.querySelectorAll(".cm-ySelectionCaret, .cm-ySelectionInfo, .cm-widgetBuffer").forEach(node => node.remove()); return clone.textContent; }).join("\n")); }
  beforeAll(async () => {
    await startServer(); browser = await chromium.launch({ headless: true }); await mkdir(screenshots, { recursive: true });
    a = await actor("Student A"); b = await actor("Student B"); outsider = await actor("Nonmember");
    const p = await createProjectFixture({ data: { title: "Writing session research project", description: "Evidence and collaborative LaTeX", ownerId: a.userId, status: "ACTIVE" } }); project = p.id;
    await db.projectMember.create({ data: { projectId: project, userId: b.userId } });
    pageA = await pageFor(a); pageB = await pageFor(b);
  }, 30000);
  afterAll(async () => { if (browser) await browser.close(); if (server?.listening) await stopServer(); });
  it("creates from the project UI, exchanges simultaneous edits and survives reload, offline and API restart", async () => {
    await pageA.goto(`${origin}/projects/${project}?tab=manuscripts`);
    await pageA.getByRole("button", { name: "Create manuscript", exact: true }).click();
    await pageA.getByLabel("Manuscript title", { exact: true }).fill("Collaborative methodology manuscript");
    await pageA.getByRole("button", { name: "Create and open editor", exact: true }).click();
    await uiExpect(pageA).toHaveURL(/\/manuscripts\/[a-f0-9-]+$/); id = pageA.url().split("/").pop()!;
    main = (await writing.detail(project, a.userId, id)).mainFileId!;
    await pageB.goto(url()); await saved(pageA); await saved(pageB);
    await insert(pageA, "% Introduction by A\n"); await uiExpect(pageB.locator(".cm-content")).toContainText("Introduction by A");
    await insert(pageB, "% Methodology by B\n"); await uiExpect(pageA.locator(".cm-content")).toContainText("Methodology by B");
    await editor(pageA).click(); await pageA.keyboard.press("Control+Home"); await editor(pageB).click(); await pageB.keyboard.press("Control+Home");
    await Promise.all([pageA.keyboard.insertText("% concurrent A\n"), pageB.keyboard.insertText("% concurrent B\n")]);
    await saved(pageA); await saved(pageB); try { await uiExpect.poll(async () => await text(pageA) === await text(pageB)).toBe(true); } catch (error) { console.log(JSON.stringify({ renderedA: await text(pageA), renderedB: await text(pageB), canonical: sourceText(Buffer.from((await writing.fileContent(project, a.userId, id, main)).state!, "base64")) })); throw error; }
    await uiExpect(pageA.getByLabel("Online collaborators").getByLabel("Student B", { exact: true })).toBeVisible();
    await uiExpect(pageA.locator(".cm-ySelectionCaret").first()).toBeVisible();
    await pageA.reload(); await saved(pageA); await uiExpect(pageA.locator(".cm-content")).toContainText("concurrent B");
    await pageB.context().setOffline(true); await editor(pageB).click(); await pageB.keyboard.press("Control+Home"); await pageB.keyboard.insertText("% offline B\n");
    await insert(pageA, "% online A\n"); await pageB.context().setOffline(false); await saved(pageB);
    await uiExpect(pageA.locator(".cm-content")).toContainText("offline B"); await uiExpect.poll(async () => await text(pageA) === await text(pageB)).toBe(true);
    const persisted = sourceText(Buffer.from((await writing.fileContent(project, a.userId, id, main)).state!, "base64"));
    expect(persisted).toContain("offline B"); await stopServer(); await startServer();
    await saved(pageA); await saved(pageB); await pageA.reload(); await saved(pageA);
    expect(sourceText(Buffer.from((await writing.fileContent(project, a.userId, id, main)).state!, "base64"))).toBe(persisted);
    await uiExpect(pageA.locator(".cm-content")).toContainText("offline B");
    await pageA.screenshot({ path: `${screenshots}/editor-desktop.png`, fullPage: true });
  }, 120000);
  it("keeps same-account tabs distinct and local undo preserves a teammate's edit", async () => {
    const tab = await pageFor(a); await tab.goto(url()); await saved(tab);
    await uiExpect(pageB.getByLabel("Online collaborators").getByLabel("Student A", { exact: true })).toHaveCount(2);
    await insert(pageA, "% undo local marker\n"); await insert(pageB, "% keep teammate marker\n");
    await uiExpect(pageA.locator(".cm-content")).toContainText("keep teammate marker");
    await pageA.getByRole("button", { name: "Undo local edit", exact: true }).click(); await saved(pageA);
    await uiExpect(pageA.locator(".cm-content")).not.toContainText("undo local marker");
    await uiExpect(pageA.locator(".cm-content")).toContainText("keep teammate marker");
    await tab.context().close(); await uiExpect(pageB.getByLabel("Online collaborators").getByLabel("Student A", { exact: true })).toHaveCount(1);
  }, 30000);
  it("synchronizes file create/rename and rejects stale operations", async () => {
    await pageA.getByRole("button", { name: "Create source file", exact: true }).click();
    await pageA.getByLabel("File path", { exact: true }).fill("sections/collaborative_section.tex"); await pageA.getByRole("button", { name: "Confirm", exact: true }).click();
    await uiExpect(pageB.getByRole("button", { name: "collaborative_section.tex", exact: true })).toBeVisible();
    await pageB.getByRole("button", { name: "collaborative_section.tex", exact: true }).click(); await saved(pageB); await insert(pageB, "\\section{Collaborative section}\n");
    const f = (await writing.detail(project, a.userId, id)).files.find(f => f.path.endsWith("collaborative_section.tex"))!;
    await writing.changeFile(project, a.userId, id, f.id, { path: "sections/renamed_section.tex", expectedVersion: f.version });
    await uiExpect(pageB.getByRole("button", { name: "renamed_section.tex", exact: true })).toBeVisible(); await uiExpect(pageB.locator(".writing-source>header")).toContainText("renamed_section.tex");
    await expect(writing.changeFile(project, b.userId, id, f.id, { path: "sections/invalid.tex", expectedVersion: f.version })).rejects.toMatchObject({ statusCode: 409 });
    await uiExpect(pageB.locator(".cm-content")).toContainText("Collaborative section");
    await pageB.context().setOffline(true); await editor(pageB).click(); await pageB.keyboard.insertText("unsaved deleted file recovery");
    const fresh = (await writing.detail(project, a.userId, id)).files.find(row => row.id === f.id)!;
    await writing.changeFile(project, a.userId, id, f.id, { delete: true, expectedVersion: fresh.version });
    await pageB.context().setOffline(false);
    await uiExpect(pageB.getByText("A file was removed while this tab had unsaved edits.", { exact: true })).toBeVisible({ timeout: 15000 });
    const download = pageB.waitForEvent("download"); await pageB.getByRole("button", { name: "Download unsaved file", exact: true }).first().click(); expect((await download).suggestedFilename()).toBe("recovered-source.tex");
  }, 30000);
  it("inserts canonical literature citation from the real UI and keeps editor state", async () => {
    const paper = await db.paper.create({ data: { primaryProvider: "user", title: "Evidence for collaborative methods", publicationYear: 2024 } });
    await db.projectPaper.create({ data: { projectId: project, paperId: paper.id, addedById: a.userId } });
    await pageA.reload(); await saved(pageA); await pageA.getByRole("button", { name: "Research context", exact: true }).click();
    await uiExpect(pageA.getByText(paper.title, { exact: true })).toBeVisible(); await pageA.getByRole("button", { name: "Insert citation", exact: true }).click();
    await saved(pageA); await uiExpect(pageA.locator(".cm-content")).toContainText("\\cite{");
    await pageA.getByRole("button", { name: "references.bib", exact: true }).click(); await saved(pageA); await uiExpect(pageA.locator(".cm-content")).toContainText(paper.title);
    await pageA.getByRole("button", { name: "main.tex", exact: false }).first().click(); await saved(pageA); await uiExpect(pageA.locator(".cm-content")).toContainText("Introduction by A");
  }, 45000);
  it("renders mobile tabs, Vietnamese labels, snapshot comments and authentic blocked preview", async () => {
    await pageA.getByRole("button", { name: "Version history", exact: true }).click(); await pageA.getByLabel("Snapshot name", { exact: true }).fill("Browser v1"); await pageA.getByRole("button", { name: "Create snapshot", exact: true }).click();
    await uiExpect(pageA.getByText("Browser v1", { exact: true })).toBeVisible();
    await pageA.getByRole("button", { name: "Comments", exact: true }).click(); await pageA.getByLabel("Add comment", { exact: true }).fill("Verify evidence for the sampling decision"); await pageA.getByRole("button", { name: "Post comment", exact: true }).click();
    await uiExpect(pageA.getByText("Verify evidence for the sampling decision", { exact: true })).toBeVisible();
    await pageA.setViewportSize({ width: 390, height: 844 }); await pageA.getByRole("button", { name: "Files", exact: true }).click();
    await uiExpect(pageA.getByRole("heading", { name: "Project files", exact: true })).toBeVisible();
    expect(await pageA.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await pageA.screenshot({ path: `${screenshots}/files-mobile.png`, fullPage: true });
    await pageA.getByRole("button", { name: "Editor", exact: true }).click(); await pageA.screenshot({ path: `${screenshots}/editor-mobile.png`, fullPage: true });
    await uiExpect(pageA.getByRole("button", { name: "Compile PDF", exact: true }).first()).toBeDisabled();
    await uiExpect(pageA.getByText("PDF compilation is not available on this server.")).toBeVisible();
    await pageA.evaluate(() => { localStorage.setItem("lumigap.uiLanguage", "vi"); localStorage.setItem("lumigap-ui-language", "vi"); }); await pageA.reload();
    await uiExpect(pageA.getByRole("button", { name: "Biên dịch PDF", exact: true }).first()).toBeVisible();
    await uiExpect(pageA.getByRole("status").filter({ hasText: "Đã lưu" })).toBeVisible();
    await pageA.screenshot({ path: `${screenshots}/editor-vi-mobile.png`, fullPage: true }); expect(await pageA.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }, 45000);
  it("allows the active mentor to comment only on the shared version and keeps old feedback on v1", async () => {
    const m = await actor("Academic mentor", true), request = await db.mentorshipRequest.create({ data: { projectId: project, mentorUserId: m.userId, requestedBy: a.userId, direction: "PROJECT_TO_LECTURER", status: "ACCEPTED", expiresAt: new Date(Date.now() + 86400000) } });
    const relationship = await db.mentorRelationship.create({ data: { projectId: project, mentorUserId: m.userId, sourceRequestId: request.id } });
    const v1 = await writing.snapshot(project, a.userId, id, { label: "Mentor proposal v1", clientKey: crypto.randomUUID(), minimumSequences: {} });
    await writing.comment(project, a.userId, id, { body: "Please check the sampling strategy", snapshotId: v1.id, mentorRelationshipId: relationship.id, clientKey: crypto.randomUUID() });
    const overviewPage = await pageFor(a); await overviewPage.goto(`${origin}/projects/${project}?tab=manuscripts`);
    await uiExpect(overviewPage.getByRole("link", { name: "Mentor feedback pending · Mentor proposal v1", exact: true })).toBeVisible();
    const mentorPage = await pageFor(m); await mentorPage.goto(`${url()}?snapshot=${v1.id}`);
    await mentorPage.getByRole("button", { name: "Comments", exact: true }).click(); await uiExpect(mentorPage.getByText("Please check the sampling strategy", { exact: true })).toBeVisible();
    expect(await mentorPage.locator(".cm-content").getAttribute("contenteditable")).toBe("false");
    await mentorPage.getByLabel("Add comment", { exact: true }).fill("Explain why the sample represents your population"); await mentorPage.getByRole("button", { name: "Post comment", exact: true }).click();
    await uiExpect(mentorPage.getByText("Explain why the sample represents your population", { exact: true })).toBeVisible();
    await mentorPage.screenshot({ path: `${screenshots}/mentor-snapshot-desktop.png`, fullPage: true });
    await overviewPage.reload();
    const feedbackLink = overviewPage.getByRole("link", { name: "Mentor feedback received · Mentor proposal v1", exact: true });
    await uiExpect(feedbackLink).toBeVisible();
    await overviewPage.screenshot({ path: `${screenshots}/overview-feedback-desktop.png`, fullPage: true });
    await overviewPage.setViewportSize({ width: 390, height: 844 });
    expect(await overviewPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await overviewPage.screenshot({ path: `${screenshots}/overview-feedback-mobile.png`, fullPage: true });
    await feedbackLink.click(); await uiExpect(overviewPage).toHaveURL(`${url()}?snapshot=${v1.id}`);
    await overviewPage.getByRole("button", { name: "Comments", exact: true }).click();
    await uiExpect(overviewPage.getByText("Explain why the sample represents your population", { exact: true })).toBeVisible();
    await overviewPage.goto(url()); await saved(overviewPage);
    await uiExpect(overviewPage.locator(".writing-statusbar").getByRole("link", { name: "Mentor feedback received · Mentor proposal v1", exact: true })).toBeVisible();
    await pageB.goto(`${url()}?snapshot=${v1.id}`); await pageB.getByRole("button", { name: "Comments", exact: true }).click();
    await pageB.getByLabel("Reply", { exact: true }).first().fill("We will revise the inclusion criteria"); await pageB.getByRole("button", { name: "Send reply", exact: true }).first().click();
    await uiExpect(pageB.getByText("We will revise the inclusion criteria", { exact: true })).toBeVisible();
    await pageB.goto(url()); await saved(pageB); await insert(pageB, "% revised inclusion criteria\n");
    const v2 = await writing.snapshot(project, a.userId, id, { label: "Mentor proposal v2", clientKey: crypto.randomUUID(), minimumSequences: {} });
    expect(await writing.comments(project, b.userId, id, v2.id)).toHaveLength(0); expect(await writing.comments(project, m.userId, id, v1.id)).toHaveLength(2);
    await overviewPage.context().close();
    await mentorPage.context().close();
  }, 45000);
  it("rejects outsiders, forged room claims, cross-origin sockets, removed member edits and expired sessions", async () => {
    const root = `http://127.0.0.1:14039/api/v1/projects/${project}/manuscripts/${id}`;
    expect((await fetch(root, { headers: { Authorization: `Bearer ${outsider.token}` } })).status).toBe(404);
    expect((await fetch(`${root}/files/${main}/ticket`, { method: "POST", headers: { Authorization: `Bearer ${outsider.token}` } })).status).toBe(404);
    const malicious = new WebSocket("ws://127.0.0.1:14039/api/v1/manuscript-collaboration", { origin: "https://attacker.example" });
    const rejected = await new Promise<number>(resolve => { malicious.on("unexpected-response", (_req, response) => { response.resume(); resolve(response.statusCode!); }); malicious.on("error", () => resolve(0)); }); expect(rejected).toBe(403); malicious.terminate();
    const fake = new WebSocket("ws://127.0.0.1:14039/api/v1/manuscript-collaboration", { origin }); await once(fake, "open"); fake.send(JSON.stringify({ type: "hello", ticket: "forged", clientId: 42 }));
    expect((await once(fake, "close"))[0]).toBe(4401);
    const before = (await writing.fileContent(project, a.userId, id, main)).sequence;
    await pageB.getByRole("button", { name: "main.tex", exact: false }).first().click(); await saved(pageB);
    await projectService.removeMemberFromProject(project, b.userId, a.userId);
    await uiExpect.poll(async () => (await pageB.locator(".cm-content").getAttribute("contenteditable")), { timeout: 15000 }).toBe("false");
    expect((await writing.fileContent(project, a.userId, id, main)).sequence).toBe(before);
    await db.refreshToken.updateMany({ where: { familyId: a.sessionId }, data: { revokedAt: new Date() } });
    expect((await fetch(`${root}/files/${main}/ticket`, { method: "POST", headers: { Authorization: `Bearer ${a.token}` } })).status).toBe(401);
  }, 30000);
});
