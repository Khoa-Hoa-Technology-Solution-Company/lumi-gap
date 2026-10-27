import { expect, test } from "@playwright/test";

test("project menu keeps its layout while project details and the switcher load", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const id = "10000000-0000-4000-8000-000000000001";
  const user = { id: "20000000-0000-4000-8000-000000000001", fullName: "Preview", email: "preview@example.org", systemRole: "USER", role: "user", emailVerifiedAt: "2026-10-01", onboarding: { completed: true }, capabilities: ["BASIC_RESEARCH"] };
  const project = { _id: id, title: "LumiGap", description: "Collaborative research", visibility: "PRIVATE", status: "PLANNING", ownerId: user.id, accessRole: "OWNER", version: 1, memberCount: 1, paperCount: 2, members: [], papers: [], updatedAt: "2026-10-17T08:00:00Z", createdAt: "2026-10-14T08:00:00Z" };
  let releaseDetail!: () => void, releaseList!: () => void;
  const detailGate = new Promise<void>(resolve => { releaseDetail = resolve; });
  const listGate = new Promise<void>(resolve => { releaseList = resolve; });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(user => {
    localStorage.setItem("lumigap.uiLanguage", "en");
    localStorage.setItem("trend-auth", JSON.stringify({ version: 1, state: { user, tokens: { accessToken: "ui-fixture-token", refreshToken: "ui-fixture-refresh" } } }));
  }, user);
  await page.route("**/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname;
    // Deterministic layout fixtures never write to the database.
    if (route.request().method() !== "GET") return route.fulfill({ status: 405, json: {} });
    let data: unknown = [];
    if (path.endsWith("/auth/me")) data = { user };
    else if (path === "/api/v1/projects") { await listGate; data = [project]; }
    else if (path === `/api/v1/projects/${id}`) { await detailGate; data = project; }
    else if (path.endsWith("/workspace")) data = {
      project: { ...project, id, researchStage: null }, capabilities: { manageProject: true, editResearch: true, collaborate: true },
      members: [], memberCount: 1, mentors: [], plan: { problem: "", objectives: [], questions: [], approach: "UNDECIDED" },
      progress: { papers: 2, pendingScreening: 0, included: 0, evidence: 0, gaps: 0, questions: 0 },
      attention: { overdueTasks: 0, blockedTasks: 0, mentorQuestions: 0, mentorFeedback: 0, reviewResponses: 0 },
      myTasks: [], recentArtifacts: [], nextMilestone: null, activity: [],
    };
    else if (path.endsWith("/team-chat") || path.endsWith("/chat")) data = { messages: [] };
    else if (path.endsWith("/contributions/activity")) data = { items: [], total: 0, hasNext: false, days: [], members: [], timeZone: "Asia/Ho_Chi_Minh" };
    else if (path.endsWith("/contributions/work")) data = { items: [], total: 0, hasNext: false, currentActorId: user.id };
    return route.fulfill({ json: { success: true, data } });
  });
  await page.goto(`/projects/${id}`);
  const sidebar = page.locator(".project-browser-sidebar");
  const nav = sidebar.locator(".coord-workspace-nav");
  await expect(nav).toHaveAttribute("aria-busy", "true");
  await expect(nav.getByRole("tab")).toHaveCount(12);
  await expect(nav.getByRole("tab").first()).toBeDisabled();
  const before = await nav.boundingBox();
  releaseDetail();
  // Navigation becomes usable without waiting for the project directory.
  await expect(nav).toHaveAttribute("aria-busy", "false");
  await expect(nav.getByRole("tab").first()).toBeEnabled();
  await expect(sidebar.locator("summary").first()).toContainText("LumiGap");
  await expect(page.locator("#project-panel-overview")).toBeVisible();
  releaseList();
  await expect(nav.locator("#project-tab-papers small")).toHaveText("2");
  const after = await nav.boundingBox();
  expect(Math.abs(after!.y - before!.y)).toBeLessThan(1);
  expect(Math.abs(after!.height - before!.height)).toBeLessThan(1);
  await expect(sidebar.locator("details").first()).not.toHaveAttribute("open", "");
  await nav.locator("#project-tab-chat").click();
  await expect(page).toHaveURL(/tab=chat/);
  await expect(sidebar).toHaveCSS("transform", "none");
  expect(await page.locator(".app-route-content").evaluate(node => node.getAnimations().length)).toBe(0);
  await sidebar.locator("summary").first().click();
  await expect(sidebar.locator("details").first()).toHaveAttribute("open", "");
  await page.keyboard.press("Escape");
  await expect(sidebar.locator("details").first()).not.toHaveAttribute("open", "");
  // Every section uses Overview's centered workspace, even after lazy CSS loads.
  for (const width of [1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await nav.locator("#project-tab-overview").click();
    await expect(page.locator("#project-panel-overview")).toBeVisible();
    const layout = () => page.locator(".project-browser").evaluate(shell => {
      const box = (node: Element) => {
        const { x, width } = node.getBoundingClientRect();
        return { x, width };
      };
      return { shell: box(shell), sidebar: box(shell.querySelector(".project-browser-sidebar")!), panel: box(shell.querySelector(".project-browser-panel")!) };
    });
    const overview = await layout();
    expect(overview.shell.width).toBe(1360);
    expect(overview.sidebar.width).toBe(260);
    const container = await page.locator(".project-browser").evaluate(node => ({ x: node.parentElement!.getBoundingClientRect().x, width: node.parentElement!.clientWidth }));
    expect(overview.shell.x).toBe(container.x + (container.width - 1360) / 2);
    for (const [section, content] of [["chat", ".project-conversation"], ["contributions", ".contributions-workspace"], ["overview", "#project-panel-overview"]]) {
      await nav.locator(`#project-tab-${section}`).click();
      await expect(page.locator(content)).toBeVisible();
      await expect.poll(layout).toEqual(overview);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      await page.screenshot({ path: `artifacts/project-sidebar/${section}-${width}.png`, fullPage: true });
    }
  }
  await page.screenshot({ path: "artifacts/project-sidebar/after.png", fullPage: true });
  expect(errors).toEqual([]);
});
