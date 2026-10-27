import { expect, test } from "@playwright/test";

const id = "6ab33f1537802fe30d38753b";
const user = {
  id: "20000000-0000-4000-8000-000000000001", fullName: "Layout fixture", email: "layout@example.org",
  systemRole: "USER", role: "user", emailVerifiedAt: "2026-10-01", onboarding: { completed: true }, capabilities: ["BASIC_RESEARCH"],
};
const project = {
  _id: id, title: "LumiGap", description: "Layout fixture", visibility: "PRIVATE", status: "PLANNING",
  ownerId: user.id, accessRole: "OWNER", version: 1, memberCount: 1, paperCount: 3, members: [], papers: [],
  updatedAt: "2026-10-26T08:00:00Z", createdAt: "2026-10-14T08:00:00Z",
};

for (const entry of ["direct", "directory"] as const) {
  test(`cold ${entry} entry keeps the project switcher closed and the sidebar stationary`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    let releaseList!: () => void;
    let releaseDetail!: () => void;
    const listGate = new Promise<void>(resolve => { releaseList = resolve; });
    const detailGate = new Promise<void>(resolve => { releaseDetail = resolve; });
    await page.addInitScript(user => {
      localStorage.setItem("lumigap.uiLanguage", "vi");
      localStorage.setItem("trend-auth", JSON.stringify({ version: 1, state: {
        user, tokens: { accessToken: "layout-fixture", refreshToken: "layout-fixture-refresh" },
      } }));
    }, user);
    await page.route("**/assets/**", async route => {
      // A fresh browser context has no route/CSS cache. Delay asset loading too.
      await new Promise(resolve => setTimeout(resolve, 100));
      await route.continue();
    });
    await page.route("**/api/v1/**", async route => {
      // The test cannot write real project data or call an AI provider.
      if (route.request().method() !== "GET") return route.fulfill({ status: 405, json: {} });
      const path = new URL(route.request().url()).pathname;
      let data: unknown = [];
      if (path.endsWith("/auth/me")) data = { user };
      else if (path === "/api/v1/projects") { await listGate; data = [project]; }
      else if (path === `/api/v1/projects/${id}`) { await detailGate; data = project; }
      else if (path.endsWith("/workspace")) data = {
        project: { ...project, id, researchStage: null }, capabilities: { manageProject: true, editResearch: true, collaborate: true },
        members: [], memberCount: 1, mentors: [], plan: { problem: "", objectives: [], questions: [], approach: "UNDECIDED" },
        progress: { papers: 3, pendingScreening: 0, included: 0, evidence: 0, gaps: 0, questions: 0 },
        attention: { overdueTasks: 0, blockedTasks: 0, mentorQuestions: 0, mentorFeedback: 0, reviewResponses: 0 },
        myTasks: [], recentArtifacts: [], nextMilestone: null, activity: [],
      };
      else if (path.endsWith("/contributions/activity")) data = {
        items: [], total: 0, hasNext: false, days: [], members: [], timeZone: "Asia/Ho_Chi_Minh",
      };
      await route.fulfill({ json: { success: true, data } });
    });

    await page.goto(entry === "direct" ? `/projects/${id}` : "/projects");
    const sidebar = page.locator(".project-browser-sidebar");
    const picker = sidebar.locator(".coord-project-picker");
    await expect(sidebar).toBeVisible();
    await expect(picker).not.toHaveAttribute("open", "");
    const before = await sidebar.boundingBox();
    await page.screenshot({ path: testInfo.outputPath("pending.png") });
    releaseList();
    releaseDetail();
    await expect(page).toHaveURL(new RegExp(`/projects/${id}$`));
    await expect(page.locator("#project-panel-overview")).toBeVisible();
    await expect(sidebar.locator("#project-tab-papers small")).toHaveText("3");
    await expect(picker).not.toHaveAttribute("open", "");
    const after = await sidebar.boundingBox();
    expect(after).not.toBeNull();
    expect(before).not.toBeNull();
    for (const dimension of ["x", "y", "width", "height"] as const) {
      expect(Math.abs(after![dimension] - before![dimension])).toBeLessThan(1);
    }
    await page.screenshot({ path: testInfo.outputPath("ready.png") });
    expect(errors).toEqual([]);
  });
}
