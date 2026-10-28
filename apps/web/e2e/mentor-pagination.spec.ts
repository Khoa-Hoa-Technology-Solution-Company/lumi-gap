import { expect, test } from "@playwright/test";

const id = "6ab33f1537802fe30d38753b";
const user = { id: "20000000-0000-4000-8000-000000000001", fullName: "Pagination fixture", email: "pagination@example.org", systemRole: "USER", role: "user", emailVerifiedAt: "2026-10-01", onboarding: { completed: true }, capabilities: ["BASIC_RESEARCH"] };
const project = { _id: id, title: "LumiGap", description: "Pagination fixture", visibility: "PRIVATE", status: "PLANNING", ownerId: user.id, accessRole: "OWNER", version: 1, memberCount: 1, paperCount: 3, members: [], papers: [], updatedAt: "2026-10-27", createdAt: "2026-10-14" };
const preview = { id, title: "LumiGap", summary: "Research project", researchAreas: [], expertise: [], stage: "PLANNING", mentoringNeeds: "", discovery: "CLOSED" };
const meta = { page: 1, pageSize: 10, total: 0, totalPages: 0 };

for (const mobile of [false, true]) {
  test(`mentor pagination preserves filters and uses server pages on ${mobile ? "mobile" : "desktop"}`, async ({ page }, testInfo) => {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
    const requests: Array<{ page: number; pageSize: number; q: string | null }> = [];
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    let writes = 0;
    await page.addInitScript(user => {
      localStorage.setItem("lumigap.uiLanguage", "vi");
      localStorage.setItem("trend-auth", JSON.stringify({ version: 1, state: { user, tokens: { accessToken: "pagination-fixture", refreshToken: "pagination-fixture-refresh" } } }));
    }, user);
    await page.route("**/api/v1/**", async route => {
      if (route.request().method() !== "GET") { writes++; return route.fulfill({ status: 405, json: {} }); }
      const url = new URL(route.request().url()), path = url.pathname;
      let data: unknown = [];
      if (path.endsWith("/auth/me")) data = { user };
      else if (path.endsWith("/academic-onboarding/options")) data = { researchAreas: [] };
      else if (path === "/api/v1/projects") data = [project];
      else if (path === `/api/v1/projects/${id}`) data = project;
      else if (path.endsWith("/academic-support")) data = { project: preview, accessRole: "TEAM", canManage: true, canProvideFeedback: true, guidance: [] };
      else if (path.endsWith("/mentorship-discovery")) data = preview;
      else if (path.endsWith("/mentorships")) data = { relationships: [], requests: [], counts: { active: 0, pending: 0 }, policy: { maxActiveMentors: 2, maxPendingRequests: 3 }, requestMeta: meta, relationshipMeta: meta };
      else if (path.endsWith("/available-mentors")) {
        const current = Number(url.searchParams.get("page")), size = Number(url.searchParams.get("pageSize"));
        requests.push({ page: current, pageSize: size, q: url.searchParams.get("q") });
        data = { items: Array.from({ length: Math.min(size, 19 - (current - 1) * size) }, (_, index) => ({ _id: `mentor-${(current - 1) * size + index}`, fullName: `Lecturer ${(current - 1) * size + index + 1}`, institutionName: "Research University", matchedTerms: [], expertiseAreas: [], researchInterests: [] })), meta: { page: current, pageSize: size, total: 19, totalPages: Math.ceil(19 / size) } };
      }
      await route.fulfill({ json: { success: true, data } });
    });
    await page.goto(`/projects/${id}?tab=support`);
    const nav = page.getByRole("navigation", { name: "Phân trang cố vấn" });
    await expect.poll(() => errors, { timeout: 1000 }).toEqual([]);
    await expect(nav).toBeVisible();
    await expect(nav).toContainText("Hiển thị 1–6 / 19 cố vấn");
    await expect(page.locator(".mentor-result")).toHaveCount(6);
    await nav.getByRole("button", { name: "Sau", exact: true }).click();
    await expect(nav).toContainText("Hiển thị 7–12 / 19 cố vấn");
    await expect(page.locator(".mentor-result").first()).toContainText("Lecturer 7");
    const search = page.getByRole("textbox", { name: "Tìm mentor đang nhận nhóm" });
    await search.fill("learning");
    await expect.poll(() => requests.at(-1)?.q).toBe("learning");
    await expect(nav).toContainText("Hiển thị 1–6 / 19 cố vấn");
    await nav.getByRole("button", { name: "Sau", exact: true }).click();
    await expect(nav).toContainText("Hiển thị 7–12 / 19 cố vấn");
    expect(requests.at(-1)).toEqual({ page: 2, pageSize: 6, q: "learning" });
    await nav.getByRole("combobox", { name: "Cố vấn mỗi trang" }).selectOption("12");
    await expect(nav).toContainText("Hiển thị 1–12 / 19 cố vấn");
    await expect(page.locator(".mentor-result")).toHaveCount(12);
    expect(requests.at(-1)).toEqual({ page: 1, pageSize: 12, q: "learning" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await nav.screenshot({ path: testInfo.outputPath("mentor-pagination.png") });
    expect(writes).toBe(0);
  });
}
