import { expect, test } from "@playwright/test";

const projectId = "6ab33f1537802fe30d38753b";
const user = {
  id: "20000000-0000-4000-8000-000000000001", fullName: "Research fixture", email: "research@example.org",
  systemRole: "USER", role: "user", emailVerifiedAt: "2026-10-01", onboarding: { completed: true }, capabilities: ["BASIC_RESEARCH"],
};
const project = {
  _id: projectId, title: "LumiGap", description: "Research progress fixture", visibility: "PRIVATE", status: "PLANNING",
  ownerId: user.id, accessRole: "OWNER", version: 1, memberCount: 1, paperCount: 3, members: [], papers: [],
  updatedAt: "2026-10-27T08:00:00Z", createdAt: "2026-10-14T08:00:00Z",
};
const papers = [
  "Large language models for sustainable assessment and feedback in higher education",
  "How Does ChatGPT Perform on the United States Medical Licensing Examination?",
  "Evaluating language models in scientific research",
].map((title, index) => ({ paperId: `source-${index}`, title, dataStatus: "active", publicationYear: 2024, authors: ["Research team"] }));

for (const mobile of [false, true]) {
  test(`research progress explains each worker stage on ${mobile ? "mobile with reduced motion" : "desktop"}`, async ({ page }, testInfo) => {
    // Includes a reload, three polling cycles and screenshots in both themes.
    test.setTimeout(60_000);
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: mobile ? "reduce" : "no-preference", colorScheme: "light" });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    let stage: "extracting" | "synthesizing" | "generating" | "ready" = "extracting";
    await page.addInitScript(user => {
      localStorage.setItem("lumigap.uiLanguage", "vi");
      localStorage.setItem("trend-auth", JSON.stringify({ version: 1, state: {
        user, tokens: { accessToken: "progress-fixture", refreshToken: "progress-fixture-refresh" },
      } }));
    }, user);
    await page.route("**/api/v1/**", async route => {
      // No real data writes, AI requests or credits are used by this test.
      if (route.request().method() !== "GET") return route.fulfill({ status: 405, json: {} });
      const path = new URL(route.request().url()).pathname;
      let data: unknown = [];
      if (path.endsWith("/auth/me")) data = { user };
      else if (path === "/api/v1/projects") data = [project];
      else if (path === `/api/v1/projects/${projectId}`) data = project;
      else if (path.endsWith("/research/discovery")) data = {
        eligibleCount: 3, minPapers: 2, maxPapers: 10,
        latestAnalysis: {
          id: "progress-run", topic: "Learning", status: stage === "ready" ? "ready" : "analyzing",
          selectedPaperIds: papers.map(paper => paper.paperId), gapIds: [], evidenceMode: "selected",
          createdAt: "2026-10-27T08:00:00Z", updatedAt: "2026-10-27T08:01:00Z",
          discovery: { stage, completed: stage === "extracting" ? 1 : 3, total: 3, papers: [] },
        },
      };
      else if (path.endsWith("/research/papers")) data = { items: papers, total: 3, page: 1, pageSize: 50, hasNext: false };
      await route.fulfill({ json: { success: true, data } });
    });

    await page.goto(`/projects/${projectId}?tab=gaps`);
    const progress = page.getByRole("region", { name: "Tiến trình phân tích" });
    await expect(progress).toBeVisible();
    await expect(progress.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
    await expect(progress.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "3");
    const action = page.getByRole("button", { name: "Đang phân tích", exact: true });
    await expect(action).toBeDisabled();

    stage = "synthesizing";
    await expect(progress.getByRole("heading")).toHaveText("Đang đối chiếu kết quả giữa các bài", { timeout: 8_000 });
    await expect(progress).toContainText("Bước 2 / 3");
    await expect(progress).toContainText("Đã phân tích 3 / 3 bài");
    await expect(progress).toContainText("Đã đọc xong từng bài.");
    await expect(progress.getByRole("progressbar")).toHaveCount(0);
    await expect(progress.locator('[aria-current="step"]')).toContainText("Đối chiếu kết quả");
    const progressBox = await progress.boundingBox();
    const libraryBox = await page.locator(".gap-discovery-workbench").boundingBox();
    expect(progressBox!.y).toBeLessThan(libraryBox!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (mobile) expect(await progress.locator('[aria-current="step"] .gap-analysis-step-marker').evaluate(el => getComputedStyle(el).animationName)).toBe("none");
    await progress.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("comparison.png"), fullPage: true, animations: "disabled" });
    await progress.screenshot({ path: testInfo.outputPath("comparison-panel.png"), animations: "disabled" });
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await progress.screenshot({ path: testInfo.outputPath("comparison-dark.png"), animations: "disabled" });

    await page.reload();
    await expect(progress.getByRole("heading")).toHaveText("Đang đối chiếu kết quả giữa các bài");
    await expect(action).toBeDisabled();
    stage = "generating";
    await expect(progress).toContainText("Bước 3 / 3", { timeout: 8_000 });
    await expect(progress.locator('[aria-current="step"]')).toContainText("Đề xuất hướng nghiên cứu");
    await expect(action).toBeDisabled();
    stage = "ready";
    await expect(progress).toHaveCount(0, { timeout: 8_000 });
    await expect(page.locator(".gap-discovery-workbench")).toBeHidden();
    await page.getByRole("button", { name: "Chọn bài cho lần phân tích mới" }).click();
    await expect(page.getByRole("button", { name: "Phân tích bài báo", exact: true })).toBeEnabled();
    expect(errors).toEqual([]);
  });
}

for (const mobile of [false, true]) {
  test(`saved results recover without a new AI request and selection stays compact on ${mobile ? "mobile" : "desktop"}`, async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    let resultsAvailable = false;
    let writes = 0;
    await page.addInitScript(user => {
      localStorage.setItem("lumigap.uiLanguage", "vi");
      localStorage.setItem("trend-auth", JSON.stringify({ version: 1, state: { user, tokens: { accessToken: "results-fixture", refreshToken: "results-refresh" } } }));
    }, user);
    await page.route("**/api/v1/**", async route => {
      if (route.request().method() !== "GET") { writes++; return route.fulfill({ status: 405, json: {} }); }
      const path = new URL(route.request().url()).pathname;
      let data: unknown = [];
      if (path.endsWith("/auth/me")) data = { user };
      else if (path === "/api/v1/projects") data = [project];
      else if (path === `/api/v1/projects/${projectId}`) data = project;
      else if (path.endsWith("/research/discovery")) data = {
        eligibleCount: 3, minPapers: 2, maxPapers: 10,
        latestAnalysis: { id: "saved-run", status: "ready", topic: "Learning", gapIds: ["saved-gap"], selectedPaperIds: papers.map(paper => paper.paperId), createdAt: "2026-10-27T08:00:00Z" },
      };
      else if (path.endsWith("/research/papers")) data = { items: papers, total: 3, page: 1, pageSize: 50, hasNext: false };
      else if (path === "/api/v1/gaps") {
        expect(new URL(route.request().url()).searchParams.get("analysisId")).toBe("saved-run");
        if (!resultsAvailable) return route.fulfill({ status: 500, json: { success: false, error: { code: "INTERNAL_ERROR" } } });
        data = [{ id: "saved-gap", title: "Kiểm chứng kết quả học tập giữa các cơ sở đào tạo", suggestedResearchQuestion: "Kết quả có lặp lại ở các môi trường đào tạo khác nhau không?", observedLimitation: "Các nghiên cứu hiện tại có phạm vi mẫu giới hạn.", origin: "AI_SUGGESTED", assessmentStatus: "PROPOSED", supportingPapers: [{ id: papers[0].paperId, title: papers[0].title }] }];
      }
      await route.fulfill({ json: { success: true, data } });
    });
    await page.goto(`/projects/${projectId}?tab=gaps`);
    const error = page.getByRole("alert").filter({ hasText: "Chưa tải được các hướng nghiên cứu" });
    await expect(error).toBeVisible({ timeout: 10_000 });
    await expect(error).toContainText("không cần chạy phân tích lần nữa");
    await expect(page.locator(".gap-discovery-workbench")).toBeHidden();
    resultsAvailable = true;
    await error.getByRole("button", { name: "Tải lại kết quả" }).click();
    await expect(error).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Hướng nghiên cứu đề xuất", exact: true })).toContainText("Kiểm chứng kết quả học tập");
    await page.screenshot({ path: testInfo.outputPath("saved-results.png"), fullPage: true });
    await page.getByRole("button", { name: "Chọn bài cho lần phân tích mới" }).click();
    const selector = page.locator(".gap-discovery-workbench");
    await expect(selector).toBeVisible();
    await expect(selector.getByRole("checkbox")).toHaveCount(3);
    await selector.getByRole("checkbox").nth(1).uncheck();
    await expect(selector).toContainText("Đã chọn 2 bài để phân tích");
    await expect(selector.getByRole("button", { name: "Phân tích bài báo", exact: true })).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await selector.screenshot({ path: testInfo.outputPath("paper-selection.png") });
    await page.getByRole("button", { name: "Thu gọn danh sách" }).click();
    await expect(selector).toBeHidden();
    await page.getByRole("button", { name: "Chọn bài cho lần phân tích mới" }).click();
    await expect(selector.getByRole("checkbox").nth(1)).not.toBeChecked();
    expect(writes).toBe(0);
  });
}
