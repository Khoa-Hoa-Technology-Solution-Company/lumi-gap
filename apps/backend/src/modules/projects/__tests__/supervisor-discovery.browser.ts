import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, expect as baseExpect } from "@playwright/test";
import type { PrismaClient } from "../../../generated/prisma/client.js";
import { authService } from "../../auth/auth.service.js";

/** Isolated test database + real HTTP API; no application account or project is modified. */
export async function supervisorDiscoveryBrowser(db: PrismaClient, fixture: { projectId: string; ownerId: string; mentorId: string; ownerToken: string; mentorToken: string; otherId: string; otherToken: string; memberId: string; memberToken: string }) {
  const expect = baseExpect.configure({ timeout: 30000 });
  const { createApp } = await import("../../../app.js");
  const server = createApp().listen(0, "127.0.0.1"); await once(server, "listening");
  const { createServer } = await import("vite");
  const webRoot = resolve(process.cwd(), "../web"), output = resolve(process.cwd(), "../../docs/audits/2026-11-18-support-viewer");
  const tailwind = (await import("tailwindcss")).default, autoprefixer = (await import("autoprefixer")).default;
  const config = (await import(pathToFileURL(resolve(webRoot, "tailwind.config.js")).href)).default;
  const vite = await createServer({ root: webRoot, configFile: `${webRoot}/vite.config.ts`, cacheDir: resolve(webRoot, ".cache/supervisor-vite"), css: { postcss: { plugins: [tailwind({ ...config, content: [`${webRoot}/index.html`, `${webRoot}/src/**/*.{ts,tsx}`] }), autoprefixer()] } }, server: { host: "127.0.0.1", port: 13103, strictPort: true, proxy: { "/api": { target: `http://127.0.0.1:${(server.address() as { port: number }).port}`, changeOrigin: true, ws: true } } } });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    await mkdir(output, { recursive: true }); await vite.listen(); browser = await chromium.launch({ channel: "msedge", headless: true });
    const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const mentorContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const memberContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const otherContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    for (const [context, id, token] of [[ownerContext, fixture.ownerId, fixture.ownerToken], [mentorContext, fixture.mentorId, fixture.mentorToken], [otherContext, fixture.otherId, fixture.otherToken], [memberContext, fixture.memberId, fixture.memberToken]] as const) {
      const user = await authService.me(id);
      await context.addInitScript(({ user, token }) => { localStorage.setItem("LumiGap.uiLanguage", "en"); localStorage.setItem("trend-auth", JSON.stringify({ version: 1, state: { user, tokens: { accessToken: token, refreshToken: "isolated-test-only" } } })); }, { user, token });
    }
    const a = await ownerContext.newPage(), b = await mentorContext.newPage(), errors: string[] = [];
    a.setDefaultTimeout(30000); b.setDefaultTimeout(30000); a.on("pageerror", e => errors.push(e.message)); b.on("pageerror", e => errors.push(e.message));
    const root = "http://127.0.0.1:13103", projectUrl = `${root}/projects/${fixture.projectId}?tab=support`;
    const memberPage = await memberContext.newPage(); memberPage.setDefaultTimeout(30000);
    memberPage.on("pageerror", e => errors.push(e.message));
    await memberPage.goto(projectUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await memberPage.getByPlaceholder("Tìm theo tên giảng viên, email, đơn vị hoặc chuyên môn...", { exact: true }).fill("Dr. Browser Supervisor");
    await memberPage.locator(".mentor-result").filter({ hasText: "Dr. Browser Supervisor" }).getByRole("button", { name: "Suggest Mentor", exact: true }).click();
    const proposal = memberPage.getByRole("dialog"); expect(await proposal.locator("textarea").count()).toBe(1);
    await proposal.getByRole("textbox").fill("Their clinical evaluation expertise fits our research.");
    await proposal.getByRole("button", { name: "Send suggestion", exact: true }).click(); await expect(proposal).toHaveCount(0);
    expect(await db.mentorshipRequest.count({ where: { projectId: fixture.projectId } })).toBe(0);
    expect(await db.notification.count({ where: { userId: fixture.mentorId } })).toBe(0);
    await memberPage.screenshot({ path: `${output}/member-proposal-sent.png`, fullPage: true });
    await a.goto(projectUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    const panel = a.locator(".mentor-workspace"); await expect(panel.getByRole("tab")).toHaveCount(2);
    const proposalInbox = a.locator(`#owner-mentor-suggestions-${fixture.projectId}`);
    await expect(proposalInbox).toContainText("Their clinical evaluation expertise fits our research.");
    await proposalInbox.getByRole("button", { name: "Mời hướng dẫn", exact: true }).click();
    await expect(a.locator(".supervisor-invitation-sheet")).toContainText("Dr. Browser Supervisor");
    expect(await db.mentorshipRequest.count({ where: { projectId: fixture.projectId } })).toBe(0);
    await a.locator(".supervisor-invitation-sheet").getByRole("button", { name: "Cancel", exact: true }).click();

    const search = a.getByPlaceholder("Tìm theo tên giảng viên, email, đơn vị hoặc chuyên môn...", { exact: true });
    await search.fill("PyTorch"); const card = a.locator(".mentor-result").filter({ hasText: "Dr. Browser Supervisor" });
    await expect(card).toHaveCount(1); await search.fill("Dr. Browser Supervisor"); await expect(card).toHaveCount(1);
    const profileLink = card.getByRole("link", { name: "View profile", exact: true }); expect(await profileLink.getAttribute("href")).toContain(fixture.mentorId); expect(await profileLink.getAttribute("target")).toBe("_blank");
    const [profilePage] = await Promise.all([a.waitForEvent("popup"), profileLink.click()]);
    await expect(profilePage.getByRole("heading", { name: "Dr. Browser Supervisor", exact: true }).first()).toBeVisible();
    await profilePage.getByRole("tab", { name: "Collaboration & Review", exact: true }).click();
    await profilePage.getByRole("button", { name: "Invite as Mentor", exact: true }).click();
    await profilePage.getByRole("dialog").getByRole("combobox", { name: "Project", exact: true }).selectOption(fixture.projectId);
    await profilePage.getByRole("dialog").getByRole("button", { name: "Continue", exact: true }).click();
    const profileDrawer = profilePage.locator(".supervisor-invitation-sheet");
    await expect(profileDrawer.getByRole("textbox", { name: /Research summary/ })).toHaveValue(/PRIVATE ORIGINAL GOAL/);
    expect(await profileDrawer.locator("textarea").count()).toBe(2); expect(await profileDrawer.locator("select").count()).toBe(0);
    await profilePage.screenshot({ path: `${output}/invitation-from-profile.png`, fullPage: true });
    await profileDrawer.getByRole("button", { name: "Cancel", exact: true }).click(); await profilePage.close();
    await a.screenshot({ path: `${output}/discovery-desktop.png`, fullPage: true });
    await card.getByRole("button", { name: "Invite supervisor", exact: true }).click();
    const drawer = a.getByRole("dialog"); const summary = drawer.getByRole("textbox", { name: /Research summary/ });
    await expect(summary).toHaveValue(/PRIVATE ORIGINAL GOAL/);
    await drawer.getByRole("button", { name: "Send Invitation", exact: true }).click(); await expect(drawer.locator("#invite-message-error")).toBeVisible();
    await summary.fill("Our team compares reproducible medical imaging methods, documents a baseline evaluation protocol and seeks supervision on experimental design.");
    await drawer.getByRole("textbox", { name: /Invitation message/ }).fill("Your medical imaging expertise fits our study. Please guide the experimental design.");
    expect(await drawer.locator("textarea").count()).toBe(2);
    expect(await drawer.locator("select").count()).toBe(0);
    expect(await drawer.getByRole("checkbox").count()).toBe(0); await drawer.locator(".supervisor-invitation-body").evaluate(el => { el.scrollTop = 0; }); await a.screenshot({ path: `${output}/invitation-desktop.png`, fullPage: true });
    for (const [name, width, height] of [["tablet", 768, 1024], ["mobile", 390, 844]] as const) {
      await a.setViewportSize({ width, height }); await expect(drawer).toBeVisible();
      await expect.poll(async () => (await drawer.boundingBox())!.x).toBeGreaterThanOrEqual(0);
      await expect.poll(async () => { const box = (await drawer.boundingBox())!; const viewport = await a.evaluate(() => (globalThis as unknown as { document: { documentElement: { clientWidth: number } } }).document.documentElement.clientWidth); return box.x + box.width - viewport; }).toBeLessThanOrEqual(1);
      expect(await drawer.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      expect(await a.evaluate(() => {
        const doc = (globalThis as unknown as { document: { documentElement: { scrollWidth: number } }; innerWidth: number });
        return doc.document.documentElement.scrollWidth <= doc.innerWidth;
      })).toBe(true);
      await a.screenshot({ path: `${output}/invitation-${name}.png`, fullPage: false, animations: "disabled" });
    }
    await a.evaluate(() => {
      (globalThis as unknown as { document: { documentElement: { classList: { add: (c: string) => void; remove: (c: string) => void } } } }).document.documentElement.classList.add("dark");
    }); await a.screenshot({ path: `${output}/invitation-mobile-dark.png`, fullPage: false, animations: "disabled" });
    await a.evaluate(() => {
      (globalThis as unknown as { document: { documentElement: { classList: { add: (c: string) => void; remove: (c: string) => void } } } }).document.documentElement.classList.remove("dark");
    });
    // The API commits successfully, but the browser loses that response. Retry must reuse the key.
    const keys: string[] = []; let loseResponse = true;
    await a.route("**/api/v1/projects/*/mentorships", async route => {
      if (route.request().method() !== "POST") { await route.continue(); return; }
      keys.push(route.request().postDataJSON().idempotencyKey);
      if (loseResponse) { loseResponse = false; await route.fetch(); await route.abort("failed"); } else await route.continue();
    });
    await drawer.getByRole("button", { name: "Send Invitation", exact: true }).click(); await expect(drawer.getByRole("alert").last()).toBeVisible(); await expect(summary).toHaveValue(/reproducible medical imaging/);
    await drawer.getByRole("button", { name: "Send Invitation", exact: true }).click(); await expect(drawer).toHaveCount(0); expect(keys[0]).toBe(keys[1]);
    expect(await db.mentorshipRequest.count({ where: { projectId: fixture.projectId } })).toBe(1);
    const request = await db.mentorshipRequest.findFirstOrThrow({ where: { projectId: fixture.projectId } });
    expect(await db.mentorSuggestion.count({ where: { projectId: fixture.projectId, status: "INVITED", requestId: request.id } })).toBe(1);
    expect(await db.notification.count({ where: { eventKey: `MENTORSHIP_REQUEST_RECEIVED:${request.id}:${fixture.mentorId}` } })).toBe(1);
    await a.setViewportSize({ width: 1440, height: 960 }); await panel.getByRole("tab", { name: /Invitations & mentors/ }).click(); await expect(panel.locator('.mentorship-list').getByText("Dr. Browser Supervisor", { exact: true }).first()).toBeVisible();
    await expect(panel.getByRole("heading", { name: /Pending invitations/ })).toBeVisible();
    await panel.getByRole("button", { name: "View sent invitation", exact: true }).click();
    const ownerViewer = a.getByRole("dialog"); await expect(ownerViewer.getByRole("heading", { name: "Sent invitation", exact: true })).toBeVisible();
    await expect(ownerViewer).toContainText("Waiting for the lecturer's response");
    await expect(ownerViewer).not.toContainText("If you accept"); await expect(ownerViewer.getByRole("button", { name: "Accept supervision", exact: true })).toHaveCount(0);
    await expect(ownerViewer.getByRole("button", { name: "Withdraw", exact: true })).toBeVisible();
    await a.screenshot({ path: `${output}/owner-sent-invitation.png`, fullPage: false });
    await a.setViewportSize({ width: 390, height: 844 }); await expect(ownerViewer).toBeVisible(); expect(await ownerViewer.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await a.screenshot({ path: `${output}/owner-sent-invitation-mobile.png`, fullPage: false });
    await ownerViewer.getByRole("button", { name: "Close", exact: true }).first().click(); await a.setViewportSize({ width: 1440, height: 960 });
    await b.goto(`${root}/mentor-workspace?view=incoming`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await expect(b.getByText("Evidence-based research methods", { exact: true }).first()).toBeVisible();
    expect(await b.locator("body").innerText()).not.toContain("PRIVATE ORIGINAL GOAL");
    await b.screenshot({ path: `${output}/mentor-pending.png`, fullPage: true });
    await b.getByRole("button", { name: "View invitation", exact: true }).first().click();
    await expect(b.getByRole("dialog")).toContainText("reproducible medical imaging");
    await b.screenshot({ path: `${output}/mentor-invitation-detail.png`, fullPage: true });
    await b.getByRole("button", { name: "Accept supervision", exact: true }).click(); await expect(b.getByRole("dialog")).toContainText("You are now supervising this project"); await expect(b.getByRole("dialog").getByRole("link", { name: "Open project", exact: true })).toBeVisible();
    await b.screenshot({ path: `${output}/mentor-accepted-next-step.png`, fullPage: true });
    expect(await db.mentorRelationship.count({ where: { projectId: fixture.projectId, mentorUserId: fixture.mentorId, status: "ACTIVE" } })).toBe(1);
    expect(await db.projectMember.count({ where: { projectId: fixture.projectId, userId: fixture.mentorId } })).toBe(0);
    await b.goto(`${root}/mentor-workspace?view=projects`, { waitUntil: "domcontentloaded" });
    await expect(b.getByText("Evidence-based research methods", { exact: true }).first()).toBeVisible();
    await b.screenshot({ path: `${output}/mentor-accepted.png`, fullPage: true });
    await a.reload(); await panel.getByRole("tab", { name: /Invitations & mentors/ }).click(); await expect(panel.locator(".mentorship-list").first()).toContainText("Mentorship active");
    await a.screenshot({ path: `${output}/owner-accepted.png`, fullPage: true });
    await a.goto(`${root}/projects/${fixture.projectId}?tab=members`, { waitUntil: "domcontentloaded" });
    await expect(a.locator(".project-mentor-showcase")).toContainText("Dr. Browser Supervisor");
    await a.screenshot({ path: `${output}/team-accepted-mentor.png`, fullPage: true });
    // A second invitation is independent; both accept before any role is proposed.
    await a.goto(`${projectUrl}&inviteMentor=${fixture.otherId}`, { waitUntil: "domcontentloaded" });
    await expect(drawer).toBeVisible(); await drawer.getByRole("textbox", { name: /Research summary/ }).fill("Study clinical AI.");
    await drawer.getByRole("textbox", { name: /Invitation message/ }).fill("Please guide our methods.");
    expect(await drawer.getByRole("checkbox").count()).toBe(0); await drawer.getByRole("button", { name: "Send Invitation", exact: true }).click(); await expect(drawer).toHaveCount(0);
    const c = await otherContext.newPage(); c.setDefaultTimeout(30000); c.on("pageerror", e => errors.push(e.message));
    await c.goto(`${root}/mentor-workspace?view=incoming`, { waitUntil: "domcontentloaded" });
    await c.getByRole("button", { name: "View invitation", exact: true }).first().click(); await c.getByRole("button", { name: "Accept supervision", exact: true }).click(); await expect(c.getByRole("dialog")).toContainText("You are now supervising this project");
    expect(await db.mentorRelationship.count({ where: { projectId: fixture.projectId, mentorRole: "UNASSIGNED", status: "ACTIVE" } })).toBe(2);
    await a.goto(`${projectUrl}&view=requests`, { waitUntil: "domcontentloaded" });
    const allocation = a.locator(".mentor-role-assignments"); await allocation.locator("summary").click();
    await allocation.getByRole("combobox").nth(0).selectOption("PRIMARY"); await allocation.getByRole("combobox").nth(1).selectOption("SECONDARY");
    await allocation.getByRole("button", { name: "Propose roles", exact: true }).click(); await expect(allocation).toContainText("Confirmed:");
    await a.screenshot({ path: `${output}/role-proposal.png`, fullPage: true });
    for (const page of [b, c]) {
      await page.goto(`${root}/projects/${fixture.projectId}?tab=overview`, { waitUntil: "domcontentloaded" });
      const roles = page.locator(".mentor-role-assignments"); await expect(roles.getByRole("button", { name: "Agree to proposed role", exact: true })).toBeVisible();
      await page.screenshot({ path: `${output}/mentor-role-confirmation-${page === b ? "first" : "second"}.png`, fullPage: true });
      await roles.getByRole("button", { name: "Agree to proposed role", exact: true }).click();
      await expect(roles.getByRole("button", { name: "Agree to proposed role", exact: true })).toHaveCount(0);
    }
    const allocated = await db.mentorRelationship.findMany({ where: { projectId: fixture.projectId, status: "ACTIVE" } });
    expect(allocated.map(r => r.mentorRole).sort()).toEqual(["PRIMARY", "SECONDARY"]);
    expect(await db.mentorshipRequest.count({ where: { projectId: fixture.projectId, mentorRole: "UNASSIGNED" } })).toBe(2);
    await a.reload(); await expect(a.locator(".mentor-role-assignments")).toContainText("Agreed");
    await a.screenshot({ path: `${output}/roles-confirmed.png`, fullPage: true });
    const activeSection = a.getByRole("region", { name: "Active supervisors", exact: true });
    await expect(activeSection.getByRole("link", { name: "Chat", exact: true })).toHaveCount(2);
    await expect(activeSection.getByRole("button", { name: "Open project", exact: true })).toHaveCount(0);
    await expect(a.locator("summary").filter({ hasText: "Advanced permissions & sharing" })).toHaveCount(1);
    await activeSection.getByRole("button", { name: "Manage supervisor Dr. Browser Supervisor", exact: true }).click();
    await a.getByRole("menuitem", { name: "End mentorship", exact: true }).click();
    await expect(a.getByRole("dialog").getByRole("button", { name: "Confirm", exact: true })).toBeVisible();
    expect(await db.mentorRelationship.count({ where: { projectId: fixture.projectId, status: "ACTIVE" } })).toBe(2);
    await a.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
    await a.screenshot({ path: `${output}/owner-support-sections.png`, fullPage: true });

    expect(errors).toEqual([]);
  } catch (error) {
    for (const [i, context] of (browser?.contexts() ?? []).entries()) {
      const page = context.pages()[0];
      if (page) { await page.screenshot({ path: `${output}/failure-${i}.png`, fullPage: true }); await writeFile(`${output}/failure-${i}.txt`, `${page.url()}\n${await page.locator("body").innerText()}\n${JSON.stringify(await page.locator("input").evaluateAll(nodes => nodes.map(node => ({label:node.getAttribute("aria-label"),type:node.getAttribute("type"),placeholder:node.getAttribute("placeholder")}))))}`); }
    }
    throw error;
  } finally { await browser?.close(); await vite.close(); server.closeAllConnections(); server.close(); await once(server, "close"); }
}
