import { expect, test, type Page } from "@playwright/test";

const projectId = "10000000-0000-4000-8000-000000000001";
const user = { id: "20000000-0000-4000-8000-000000000001", fullName: "Nguyễn Đình Thanh", email: "preview@example.org", systemRole: "USER", role: "user", emailVerifiedAt: "2026-10-01", onboarding: { completed: true }, capabilities: ["BASIC_RESEARCH"] };

async function fixture(page: Page) {
  const project = { _id: projectId, title: "LumiGap", description: "Nghiên cứu cộng tác", visibility: "PRIVATE", status: "PLANNING", ownerId: user.id, accessRole: "OWNER", version: 1, memberCount: 2, paperCount: 0, members: [], papers: [], updatedAt: "2026-10-17T08:00:00Z", createdAt: "2026-10-01T08:00:00Z" };
  const actor = { id: user.id, name: user.fullName };
  const days = [{ day: "2026-10-13", count: 2 }, { day: "2026-10-14", count: 3 }, { day: "2026-10-15", count: 4 }];
  const items = [
    { id: "activity-1", type: "PLAN_REVISION", category: "PLAN", actor, artifactVersion: 1, createdAt: "2026-10-15T09:57:00Z", link: { kind: "PLAN_REVISION", id: "revision-1" } },
    { id: "activity-2", type: "TASK_COMPLETED", category: "TASK", actor, artifactVersion: 5, createdAt: "2026-10-15T09:27:00Z", link: { kind: "TASK", id: "task-1" } },
    { id: "activity-3", type: "SCREENING", category: "SCREENING", actor: { id: "peer", name: "Trần Minh Anh" }, artifactVersion: null, createdAt: "2026-10-14T14:18:00Z", link: { kind: "PAPER", id: "paper-1" } },
    { id: "activity-4", type: "LITERATURE", category: "LITERATURE", actor, artifactVersion: null, createdAt: "2026-10-13T15:03:00Z", link: { kind: "PAPER", id: "paper-2" } },
  ];
  const queries: URLSearchParams[] = [], errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(authUser => {
    localStorage.setItem("lumigap.uiLanguage", "vi");
    localStorage.setItem("trend-auth", JSON.stringify({ version: 1, state: { user: authUser, tokens: { accessToken: "ui-fixture-token", refreshToken: "ui-fixture-refresh" } } }));
  }, user);
  await page.route("**/api/v1/**", async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    // UI fixtures exercise layout and filtering without writing to the database.
    if (request.method() !== "GET") return route.fulfill({ status: 405, json: { success: false } });
    let data: unknown = [];
    if (path.endsWith("/auth/me")) data = { user };
    else if (path === "/api/v1/projects") data = [project];
    else if (path === `/api/v1/projects/${projectId}`) data = project;
    else if (path.endsWith("/workspace")) data = { project: { ...project, id: projectId, researchStage: null }, capabilities: { manageProject: true }, mentors: [] };
    else if (path.endsWith("/contributions/activity")) {
      queries.push(url.searchParams);
      const filtered = items.filter(item => (!url.searchParams.get("eventDay") || item.createdAt.startsWith(url.searchParams.get("eventDay")!)) && (!url.searchParams.get("category") || item.category === url.searchParams.get("category")));
      data = { items: filtered, total: filtered.length, hasNext: false, days, members: [actor, { id: "peer", name: "Trần Minh Anh" }], timeZone: "Asia/Ho_Chi_Minh" };
    } else if (path.endsWith("/contributions/work")) data = { items: [], total: 0, hasNext: false, currentActorId: user.id };
    return route.fulfill({ json: { success: true, data } });
  });
  await page.goto(`/projects/${projectId}?tab=contributions`);
  await expect(page.locator(".contribution-timeline li")).toHaveCount(4);
  return { queries, errors };
}

test("contribution calendar labels, filters and artifact links remain usable", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const state = await fixture(page);
  await expect(page.locator(".contribution-weekdays span")).toHaveCount(7);
  await expect(page.locator(".contribution-activity-summary dd")).toHaveText(["9", "3"]);
  const day = page.getByRole("button", { name: /^2026-10-14:/ });
  await day.click();
  await expect(day).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".contribution-timeline li")).toHaveCount(1);
  expect(state.queries.at(-1)?.get("eventDay")).toBe("2026-10-14");
  await expect(page.locator(".contribution-activity-summary dd")).toHaveText(["9", "3"]);
  await page.getByRole("button", { name: "Bỏ lọc theo ngày" }).click();
  await expect(page.locator(".contribution-timeline li")).toHaveCount(4);
  await expect(page.locator(".contribution-timeline a").first()).toHaveAttribute("href", /tab=plan/);
  expect(await page.locator(".contribution-event-main strong").first().evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(16);
  await page.screenshot({ path: "artifacts/contributions-ui/desktop.png", fullPage: true });
  await page.locator(".contribution-timeline li").last().scrollIntoViewIfNeeded();
  await page.screenshot({ path: "artifacts/contributions-ui/desktop-activity.png", fullPage: true });
  await page.getByRole("combobox", { name: "Chuyên mục", exact: true }).selectOption("TASK");
  await expect(page.locator(".contribution-timeline li")).toHaveCount(1);
  expect(state.queries.at(-1)?.get("category")).toBe("TASK");
  await page.getByRole("button", { name: "Kết quả đóng góp", exact: true }).click();
  await expect(page.getByRole("button", { name: "Ghi nhận kết quả đóng góp" })).toBeVisible();
  await page.getByRole("button", { name: "Phân bổ đóng góp", exact: true }).click();
  await expect(page.getByRole("button", { name: "Tạo kỳ phân bổ" })).toBeVisible();
  expect(state.errors).toEqual([]);
});

test("mobile calendar scrolls within its section and preserves readable activity rows", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await fixture(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const calendar = page.locator(".contribution-heatmap-scroll");
  expect(await calendar.evaluate(node => node.scrollWidth > node.clientWidth)).toBe(true);
  await calendar.evaluate(node => { node.scrollLeft = node.scrollWidth; });
  await page.getByRole("button", { name: /^2026-10-14:/ }).click();
  await expect(page.locator(".contribution-timeline li")).toHaveCount(1);
  await page.getByRole("button", { name: "Bỏ lọc theo ngày" }).click();
  await expect(page.locator(".contribution-timeline li")).toHaveCount(4);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "artifacts/contributions-ui/mobile.png", fullPage: true });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.screenshot({ path: "artifacts/contributions-ui/mobile-dark.png", fullPage: true });
  expect(state.errors).toEqual([]);
});
