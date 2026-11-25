import { once } from "node:events";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import express from "express";
import { chromium, expect } from "@playwright/test";
import type { PrismaClient } from "../../../generated/prisma/client.js";

type Account = { id: string; token: string };
export async function researchChatBrowser(db: PrismaClient, fixture: { projectId: string; owner: Account; member: Account; paperTitle: string; taskTitle: string; draftTitle: string; submissionTitle: string }) {
  const { projectId } = fixture;
  await db.projectTeamMessage.createMany({ data: Array.from({ length: 80 }, (_, i) => ({ projectId, senderId: i % 2 ? fixture.owner.id : fixture.member.id, content: `Historical research note ${i}: đối chiếu nguồn và phương pháp.`, createdAt: new Date(Date.now() - (90 - i) * 60000) })) });
  const app = express();
  app.get("/api/v1/__qa/login/:role", async (req, res) => {
    const account = req.params.role === "a" ? fixture.owner : req.params.role === "b" ? fixture.member : null;
    if (!account) { res.sendStatus(404); return; }
    const user = await db.user.findUniqueOrThrow({ where: { id: account.id } });
    const state = { state: { user: { id: user.id, _id: user.id, email: user.email, fullName: user.fullName, role: "user", systemRole: "USER", emailVerifiedAt: user.emailVerifiedAt, onboardingCompletedAt: user.onboardingCompletedAt }, tokens: { accessToken: account.token, refreshToken: "disposable-test-only" } }, version: 1 };
    res.type("html").send(`<script>localStorage.setItem('trend-auth',${JSON.stringify(JSON.stringify(state)).replaceAll('<', '\\u003c')});localStorage.setItem('LumiGap.uiLanguage','en');location.replace('/projects/${projectId}?tab=chat&channel=team-chat');</script>`);
  });
  const { createApp } = await import("../../../app.js"); app.use(createApp()); const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  const { createServer } = await import("vite"); const webRoot = resolve(process.cwd(), "../web");
  const tailwind = (await import("tailwindcss")).default, autoprefixer = (await import("autoprefixer")).default;
  const { pathToFileURL } = await import("node:url");
  const config = (await import(pathToFileURL(resolve(webRoot, "tailwind.config.js")).href)).default;
  const vite = await createServer({ root: webRoot, cacheDir: resolve(webRoot, ".cache/research-chat-vite"), configFile: `${webRoot}/vite.config.ts`, css: { postcss: { plugins: [tailwind({ ...config, content: [`${webRoot}/index.html`, `${webRoot}/src/**/*.{ts,tsx}`] }), autoprefixer()] } }, server: { host: "127.0.0.1", port: 13102, strictPort: true, proxy: { "/api": { target: `http://127.0.0.1:${(server.address() as { port: number }).port}`, changeOrigin: true, ws: true } } } });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  const output = resolve(process.cwd(), "../../docs/audits/2026-11-17-research-chat"); await mkdir(output, { recursive: true });
  try {
    await vite.listen(); browser = await chromium.launch({ channel: "msedge", headless: true });
    const contextA = await browser.newContext({ viewport: { width: 1440, height: 900 } }), contextB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const a = await contextA.newPage(), b = await contextB.newPage(), errors: string[] = [];
    a.on("pageerror", error => errors.push(error.message)); b.on("pageerror", error => errors.push(error.message));
    for (const [page, role] of [[a, "a"], [b, "b"]] as const) { await page.goto(`http://127.0.0.1:13102/api/v1/__qa/login/${role}`, { waitUntil: "domcontentloaded", timeout: 60000 }); await page.getByRole("textbox", { name: "Message your team", exact: true }).waitFor({ timeout: 60000 }); }
    a.setDefaultTimeout(30000); b.setDefaultTimeout(30000);
    const composerA = a.getByRole("textbox", { name: "Message your team", exact: true }), composerB = b.getByRole("textbox", { name: "Message your team", exact: true });
    await composerA.fill("Realtime discussion: compare three source studies."); await composerA.press("Enter");
    await expect(b.getByRole("log").getByText("Realtime discussion: compare three source studies.", { exact: true })).toBeVisible();
    await b.reload(); await expect(b.getByRole("log").getByText("Realtime discussion: compare three source studies.", { exact: true })).toBeVisible();
    // Simulate an acknowledged write whose HTTP response was lost, then retry it.
    const lostKeys: string[] = []; let loseResponse = true;
    await a.route("**/api/v1/projects/*/team-chat", async route => {
      if (route.request().method() !== "POST") { await route.continue(); return; }
      const payload = route.request().postDataJSON(); lostKeys.push(payload.clientKey);
      if (loseResponse) { loseResponse = false; await route.fetch(); await route.abort("failed"); }
      else await route.continue();
    });
    await composerA.fill("Retry after response loss"); await composerA.press("Enter");
    await expect(a.getByRole("alert")).toContainText("Could not send."); await a.screenshot({ path: `${output}/send-error.png`, fullPage: true }); await expect(composerA).toHaveValue("Retry after response loss");
    await composerA.press("Enter"); await expect(composerA).toHaveValue(""); expect(lostKeys[0]).toBe(lostKeys[1]);
    expect(await db.projectTeamMessage.count({ where: { projectId, content: "Retry after response loss" } })).toBe(1);
    await a.unroute("**/api/v1/projects/*/team-chat");
    await b.getByLabel("Message actions", { exact: true }).last().click(); await b.getByRole("menuitem", { name: "Reply", exact: true }).click();
    await composerB.fill("Agreed. I will compare the reported methods."); await composerB.press("Enter");
    await expect(a.getByRole("log").getByText("Agreed. I will compare the reported methods.", { exact: true })).toBeVisible();
    for (const [choice, title] of [["Share paper", fixture.paperTitle], ["Share task", fixture.taskTitle], ["Share manuscript snapshot", fixture.draftTitle], ["Share submitted version", fixture.submissionTitle]] as const) {
      await a.getByLabel("Share research reference", { exact: true }).click(); await a.getByRole("menuitem", { name: choice, exact: true }).click();
      await expect(a.getByRole("searchbox", { name: "Search this project…", exact: true })).toBeFocused();
      await a.screenshot({ path: `${output}/reference-picker.png`, fullPage: true });
      await a.locator(".research-chat-choices").getByRole("button").filter({ hasText: title }).first().click();
      await a.screenshot({ path: `${output}/composer-reference.png`, fullPage: true });
      await a.getByRole("button", { name: "Send", exact: true }).click(); await expect(b.getByRole("log").getByRole("link").filter({ hasText: title }).first()).toBeVisible();
      const destination = await b.getByRole("log").getByRole("link").filter({ hasText: title }).first().getAttribute("href");
      const viewer = await contextB.newPage();
      try {
        await viewer.goto(`http://127.0.0.1:13102${destination}`, { waitUntil: "domcontentloaded", timeout: 60000 });
        await expect(viewer.getByText(title, { exact: true }).first()).toBeVisible({ timeout: 30000 });
      } finally { await viewer.close(); }
    }
    await a.getByRole("button", { name: "Search messages", exact: true }).click(); await a.getByRole("searchbox", { name: "Search messages", exact: true }).fill("Historical research note 2:");
    await expect(a.locator(".research-chat-search-results > button").first()).toBeVisible(); await a.screenshot({ path: `${output}/search.png`, fullPage: true });
    await a.locator(".research-chat-search-results > button").first().click(); await expect(a.locator('[data-highlight="true"]')).toContainText("Historical research note 2:");
    await a.getByRole("button", { name: "Jump to latest", exact: true }).first().click();
    await a.getByLabel("Message actions", { exact: true }).last().click(); await a.getByRole("menuitem", { name: "Save decision", exact: true }).click();
    const dialog = a.getByRole("dialog"); await dialog.getByLabel("Decision", { exact: true }).fill("Compare source evidence before revising the draft"); await dialog.getByLabel("Rationale", { exact: true }).fill("Ensure the comparison uses consistent criteria."); await dialog.getByRole("button", { name: "Save decision", exact: true }).click(); await expect(dialog).toContainText("Saved in the decision journal."); await dialog.getByRole("button", { name: "Close", exact: true }).first().click();
    expect(await db.projectDecision.count({ where: { projectId, targetKind: "TEAM_MESSAGE" } })).toBe(1);
    const journal = await contextA.newPage();
    try { await journal.goto(`http://127.0.0.1:13102/projects/${projectId}?tab=chat&discussionView=decisions`, { waitUntil: "domcontentloaded" }); await expect(journal.getByText("Compare source evidence before revising the draft", { exact: true })).toBeVisible(); await journal.getByRole("link", { name: "Source message", exact: true }).click(); await expect(journal.locator('[data-highlight="true"]')).toBeVisible(); }
    finally { await journal.close(); }

    await a.getByRole("log").evaluate(el => { el.scrollTop = 40; el.dispatchEvent(new Event("scroll", { bubbles: true })); });
    const before = await a.getByRole("log").evaluate(el => el.scrollTop); await composerB.fill("New findings while another reader checks history"); await composerB.press("Enter");
    await expect(a.getByRole("button", { name: "New messages", exact: true })).toBeVisible(); expect(Math.abs(await a.getByRole("log").evaluate(el => el.scrollTop) - before)).toBeLessThan(4);
    await a.getByRole("button", { name: "New messages", exact: true }).click();
    // Preserve the exact visible anchor while history is prepended.
    const feed = a.getByRole("log"); await feed.evaluate(el => { el.scrollTop = 0; el.dispatchEvent(new Event("scroll", { bubbles: true })); });
    const originalFirst = feed.locator('[id^="team-message-"]').first(), anchorId = await originalFirst.getAttribute("id"), offset = (await originalFirst.locator(".project-chat-message").boundingBox())!.y;
    await a.getByRole("button", { name: "Load older messages", exact: true }).click();
    await expect(feed.getByText("Historical research note 0: đối chiếu nguồn và phương pháp.", { exact: true })).toBeAttached();
    expect(Math.abs((await a.locator(`#${anchorId} .project-chat-message`).boundingBox())!.y - offset)).toBeLessThan(4);
    await a.getByRole("button", { name: "Jump to latest", exact: true }).click();
    for (const [name, width, height] of [["desktop", 1440, 900], ["tablet", 1024, 768], ["mobile", 390, 844]] as const) {
      await a.setViewportSize({ width, height });
      await expect.poll(() => feed.evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThan(64);
      await composerA.scrollIntoViewIfNeeded(); await a.evaluate("window.scrollTo(0,0)"); await a.screenshot({ path: `${output}/${name}-light.png`, fullPage: true });
      expect(await a.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(true);
    }
    await a.evaluate("document.documentElement.classList.add('dark')"); await a.screenshot({ path: `${output}/mobile-dark.png`, fullPage: true });
    await composerA.fill("<img src=x onerror=alert(1)> Tiếng Việt 研究 " + "Research context ".repeat(60)); await composerA.press("Enter"); await expect(a.locator(".project-chat-bubble img")).toHaveCount(0);
    await a.screenshot({ path: `${output}/long-message-mobile.png`, fullPage: true });
    const original = await db.projectTeamMessage.findFirstOrThrow({ where: { projectId, content: "Retry after response loss" } });
    await a.locator(`#team-message-${original.id}`).getByLabel("Message actions", { exact: true }).click();
    await a.getByRole("menuitem", { name: "Delete message", exact: true }).click();
    await expect(b.locator(".research-chat-reply")).toContainText("This message was removed.");
    expect(errors).toEqual([]);
  } finally { await browser?.close(); await vite.close(); server.closeAllConnections(); server.close(); await once(server, "close"); }
}
