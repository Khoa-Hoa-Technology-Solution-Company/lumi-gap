import { expect, test } from "@playwright/test";

test("keeps chat primary and opens threads and decisions as workspace tools", async ({ page }) => {
  const projectId = "10000000-0000-4000-8000-000000000001";
  const user = { id: "20000000-0000-4000-8000-000000000001", fullName: "Researcher", email: "preview@example.org", systemRole: "USER", role: "user", emailVerifiedAt: "2026-10-01", onboarding: { completed: true }, capabilities: ["BASIC_RESEARCH"] };
  const project = { _id: projectId, title: "Collaborative research", description: "Review research evidence", visibility: "PRIVATE", status: "PLANNING", ownerId: user.id, accessRole: "OWNER", version: 1, memberCount: 1, paperCount: 0, members: [], papers: [], updatedAt: "2026-10-15T08:00:00Z", createdAt: "2026-10-14T08:00:00Z" };
  const empty = { items: [], total: 0, page: 1, pageSize: 20, hasNext: false };
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.addInitScript(authUser => {
    localStorage.setItem("lumigap.uiLanguage", "en");
    localStorage.setItem("trend-auth", JSON.stringify({ version: 1, state: { user: authUser, tokens: { accessToken: "ui-fixture-token", refreshToken: "ui-fixture-refresh" } } }));
  }, user);
  await page.route("**/api/v1/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    // This UI fixture never writes to the running backend.
    if (request.method() !== "GET") return route.fulfill({ status: 405, json: { success: false } });
    if (path.endsWith("/team-chat/events")) return route.fulfill({ contentType: "text/event-stream", body: 'data: {"type":"ready"}\n\n' });
    let data: unknown = [];
    if (path.endsWith("/auth/me")) data = { user };
    else if (path === "/api/v1/projects") data = [project];
    else if (path === `/api/v1/projects/${projectId}`) data = project;
    else if (path.endsWith("/workspace")) data = { project: { ...project, id: projectId, researchStage: null }, capabilities: { manageProject: true }, mentors: [] };
    else if (path.endsWith("/team-chat")) data = { messages: [] };
    else if (path.endsWith("/discussions") || path.endsWith("/decisions")) data = empty;
    return route.fulfill({ json: { success: true, data } });
  });
  await page.goto(`/projects/${projectId}?tab=chat`);
  const workspace = page.locator(".coord-discussions");
  await expect(workspace.getByRole("heading", { name: "Team chat & AI", exact: true })).toBeVisible().catch(error => { console.log(errors); throw error; });
  await expect(page.getByRole("tab", { name: "Team chat & AI", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(workspace.getByRole("tab", { name: /Team Chat/ })).toHaveAttribute("aria-selected", "true");
  await expect(workspace.locator(".coord-subnav")).toHaveCount(0);
  await page.screenshot({ path: "artifacts/chat-workspace/desktop.png", fullPage: true });
  await workspace.getByRole("button", { name: "Threads", exact: true }).click();
  await expect(workspace.getByRole("button", { name: "New discussion", exact: true })).toBeVisible();
  await workspace.getByRole("button", { name: "Decision log", exact: true }).click();
  await expect(workspace.getByRole("button", { name: "Record decision", exact: true })).toBeVisible();
  await page.reload();
  await expect(workspace.getByRole("button", { name: "Decision log", exact: true })).toHaveAttribute("aria-pressed", "true");
  await workspace.getByRole("button", { name: "Back to chat", exact: true }).click();
  await expect(workspace.getByRole("tab", { name: /Team Chat/ })).toHaveAttribute("aria-selected", "true");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(workspace.getByRole("button", { name: "Threads", exact: true })).toBeVisible();
  await expect(workspace.getByRole("button", { name: "Decision log", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "artifacts/chat-workspace/mobile.png", fullPage: true });
  expect(errors).toEqual([]);
});
