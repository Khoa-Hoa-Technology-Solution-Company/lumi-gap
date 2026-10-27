import { expect, test } from "@playwright/test";

const projectId = "6ab33f1537802fe30d38753b";
const user = { id: "20000000-0000-4000-8000-000000000001", fullName: "Reader fixture", email: "reader@example.org", systemRole: "USER", role: "user", emailVerifiedAt: "2026-10-01", onboarding: { completed: true }, capabilities: ["BASIC_RESEARCH"] };
const papers = [1, 2].map(index => ({ id: `link${index}`, targetKind: "Paper", targetId: { _id: `p${index}`, title: `Paper ${index}`, authors: [{ displayName: "Research team" }], abstractText: "Project summary abstract", publicationYear: 2024 }, screeningStatus: "UNDECIDED", readingStatus: "NOT_STARTED", evidenceCount: 0, addedAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" }));
const project = { _id: projectId, title: "LumiGap", description: "Reader fixture", visibility: "PRIVATE", status: "PLANNING", ownerId: user.id, accessRole: "OWNER", version: 1, memberCount: 1, paperCount: 2, members: [], papers, updatedAt: "2026-10-27", createdAt: "2026-10-14" };

for (const mobile of [false, true]) {
  test(`paper reader loads together, reopens from cache and recovers on ${mobile ? "mobile" : "desktop"}`, async ({ page }, testInfo) => {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: mobile ? "reduce" : "no-preference" });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    let release!: () => void;
    const pendingPaper = new Promise<void>(resolve => { release = resolve; });
    let analysisReads = 0, paperReads = 0, writes = 0;
    await page.addInitScript(user => {
      localStorage.setItem("lumigap.uiLanguage", "vi");
      localStorage.setItem("trend-auth", JSON.stringify({ version: 1, state: { user, tokens: { accessToken: "reader-fixture", refreshToken: "reader-refresh" } } }));
    }, user);
    await page.route("**/api/v1/**", async route => {
      if (route.request().method() !== "GET") { writes++; return route.fulfill({ status: 405, json: {} }); }
      const path = new URL(route.request().url()).pathname;
      let data: unknown = [];
      if (path.endsWith("/auth/me")) data = { user };
      else if (path === "/api/v1/projects") data = [project];
      else if (path === `/api/v1/projects/${projectId}`) data = project;
      else if (path === "/api/v1/papers/p1") {
        paperReads++;
        await pendingPaper;
        data = { id: "p1", title: "Paper 1 full record", authors: [{ displayName: "Complete author" }], abstractText: "Full abstract loaded together", publicationYear: 2024, topics: [{ topicName: "Biology" }], keywords: [] };
      } else if (path === "/api/v1/papers/p2") return route.fulfill({ status: 404, json: { success: false, error: { code: "NOT_FOUND", message: "Paper not available" } } });
      else if (path.endsWith("/analysis")) { analysisReads++; data = { paperId: "p1", knowledge: { status: "missing", sourceKind: "abstract", warnings: [] }, screeningStatus: "UNDECIDED", analysis: null }; }
      await route.fulfill({ json: { success: true, data } });
    });
    await page.goto(`/projects/${projectId}?tab=papers`);
    await page.getByRole("button", { name: "Đọc Paper 1", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator(".project-reader-loading")).toBeVisible();
    await expect(dialog.locator(".project-reader-header")).toHaveCount(0);
    await expect(dialog).not.toContainText("Project summary abstract");
    expect(analysisReads).toBe(0);
    expect(await dialog.evaluate(element => getComputedStyle(element).animationName)).toBe("none");
    await dialog.screenshot({ path: testInfo.outputPath("reader-loading.png") });
    release();
    await expect(dialog.locator(".project-reader-loading")).toHaveCount(0);
    for (const text of ["Paper 1 full record", "Complete author", "Full abstract loaded together", "Biology"]) await expect(dialog).toContainText(text);
    expect(analysisReads).toBe(0);
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await dialog.screenshot({ path: testInfo.outputPath("reader-ready.png") });
    await dialog.getByRole("button", { name: "Đóng", exact: true }).click();
    await page.getByRole("button", { name: "Đọc Paper 1", exact: true }).click();
    await expect(dialog.locator(".project-reader-loading")).toHaveCount(0);
    await expect(dialog).toContainText("Paper 1 full record");
    expect(paperReads).toBe(1);
    await dialog.getByRole("tab").nth(1).click();
    await expect(dialog.locator(".project-paper-analysis")).toBeVisible();
    expect(analysisReads).toBe(1);
    await dialog.getByRole("tab").first().click();
    await dialog.getByRole("button", { name: "Bài tiếp theo", exact: true }).first().click();
    await expect(dialog).toContainText("Project summary abstract");
    await expect(dialog).not.toContainText("Full abstract loaded together");
    expect(errors).toEqual([]);
    expect(writes).toBe(0);
  });
}
