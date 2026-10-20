import { expect, test, type Page } from "@playwright/test";
import type { ForumPostView } from "../../apps/web/src/features/forum/api/forum.api";

test.setTimeout(60_000);
const user = { id: "20000000-0000-4000-8000-000000000001", fullName: "Researcher", email: "preview@example.org", systemRole: "USER", role: "user", emailVerifiedAt: "2026-10-01", onboarding: { completed: true }, capabilities: ["BASIC_RESEARCH"] };
async function fixture(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(authUser => {
    localStorage.setItem("lumigap.uiLanguage", "en");
    localStorage.setItem("trend-auth", JSON.stringify({ version: 1, state: { user: authUser, tokens: { accessToken: "ui-fixture-token", refreshToken: "ui-fixture-refresh" } } }));
  }, user);
  const posts: ForumPostView[] = Array.from({ length: 20 }, (_, index) => ({
    id: `topic-${index}`, type: "QUESTION", title: `How should we evaluate research evidence? ${index + 1}`, content: "Comparing methods and discussing research evidence.", tags: ["methods"], status: "PUBLISHED", voteScore: 0, commentCount: 2, replyCount: 2, helpfulCount: 0, viewCount: 12, participants: [], viewerVote: 0, isFollowing: false, isPinned: false, canModerate: false, canReply: true, references: [], author: { id: user.id, fullName: user.fullName }, createdAt: "2026-10-15T08:00:00Z",
  }));
  await page.route("**/api/v1/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (request.method() !== "GET") return route.fulfill({ status: 405, json: { success: false } });
    let data: unknown = [];
    if (path.endsWith("/auth/me")) data = { user };
    else if (path === "/api/v1/forum/posts") data = posts;
    else if (path === "/api/v1/forum/categories") data = ["Software Engineering", "Artificial Intelligence", "Data Science", "Cybersecurity", "Information Systems", "Research Methodology", "General Research"].map((name, index) => ({ id: `category-${index}`, name, slug: name.toLowerCase().replaceAll(" ", "-"), description: "Research discussions", sortOrder: index, status: "ACTIVE" }));
    return route.fulfill({ json: { success: true, data, meta: { page: 1, pageSize: 20, total: 20, totalPages: 1 } } });
  });
  await page.goto("/forum");
  await expect(page.getByRole("heading", { name: "Research Forum", exact: true })).toBeVisible({ timeout: 40_000 });
  return errors;
}

test("keeps the shared floating header clear of the sticky forum sidebar", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const errors = await fixture(page);
  const header = page.locator(".lumi-app-header"), panel = page.locator(".forum-sidebar-panel");
  const shellNode = page.locator(".forum-app-shell");
  const initialBackground = await shellNode.evaluate(node => {
    const style = getComputedStyle(node, "::before");
    return { image: style.backgroundImage, size: style.backgroundSize, position: style.backgroundPosition };
  });
  const initialMenuColor = await header.evaluate(node => getComputedStyle(node).backgroundColor);
  expect(await panel.evaluate(node => parseFloat(getComputedStyle(node).borderTopLeftRadius))).toBeGreaterThanOrEqual(18);
  expect(await shellNode.evaluate(node => getComputedStyle(node, "::after").opacity)).toBe("0");
  expect((await page.getByRole("heading", { name: "Research Forum", exact: true }).boundingBox())!.y).toBeLessThan(155);
  expect((await page.locator(".forum-topic-toolbar").boundingBox())!.y).toBeLessThan(290);
  await page.screenshot({ path: "artifacts/forum-header/desktop.png", fullPage: false });
  const bounds = await header.boundingBox();
  expect(bounds!.x).toBeGreaterThan(0); expect(bounds!.y).toBe(20);
  const shell = (await page.locator(".lumi-app-shell").boundingBox())!;
  expect(bounds!.x).toBeCloseTo((shell.width - bounds!.width) / 2, 0);
  expect(bounds!.width).toBeLessThanOrEqual(1280);
  expect(await header.evaluate(node => parseFloat(getComputedStyle(node).borderRadius))).toBeGreaterThanOrEqual(bounds!.height / 2);
  const content = await page.locator(".forum-workspace").boundingBox();
  expect(content!.y).toBeGreaterThanOrEqual(bounds!.y + bounds!.height + 12);
  await page.evaluate(() => window.scrollTo(0, 500));
  await expect.poll(async () => (await header.boundingBox())!.y).toBe(20);
  await expect(shellNode).toHaveClass(/forum-app-shell--scrolled/);
  const backdrop = await shellNode.evaluate(node => {
    const style = getComputedStyle(node, "::after");
    return { opacity: style.opacity, height: parseFloat(style.height), position: style.position, zIndex: Number(style.zIndex) };
  });
  expect(backdrop.opacity).toBe("1");
  expect(backdrop.height).toBeGreaterThanOrEqual(bounds!.y + bounds!.height);
  expect(backdrop.position).toBe("fixed");
  expect(backdrop.zIndex).toBeGreaterThan(10);
  expect(await shellNode.evaluate(node => {
    const style = getComputedStyle(node, "::after");
    return { image: style.backgroundImage, size: style.backgroundSize, position: style.backgroundPosition };
  })).toEqual(initialBackground);
  expect(await header.evaluate(node => getComputedStyle(node).backgroundColor)).toBe(initialMenuColor);
  const sidebar = await panel.boundingBox();
  expect(sidebar!.y).toBeGreaterThanOrEqual(bounds!.y + bounds!.height + 12);
  expect(sidebar!.y + sidebar!.height).toBeLessThanOrEqual(1080);
  await panel.evaluate(element => { element.scrollTop = element.scrollHeight; });
  const lastItem = await panel.getByRole("link", { name: "Submit a copyright claim", exact: true }).boundingBox();
  expect(lastItem!.y + lastItem!.height).toBeLessThanOrEqual(1080);
  await page.screenshot({ path: "artifacts/forum-header/desktop-scrolled.png", fullPage: false });
  await page.getByRole("button", { name: "Explore", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Trends", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(shellNode).not.toHaveClass(/forum-app-shell--scrolled/);
  expect(errors).toEqual([]);
});

test("keeps navigation and content usable across desktop, tablet and mobile widths", async ({ page }) => {
  await fixture(page);
  for (const width of [1440, 1280, 1180, 1024, 768, 640, 420, 390, 360, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    const header = await page.locator(".lumi-app-header").boundingBox();
    expect(header!.y).toBe(width < 768 ? 12 : 20); expect(header!.x).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const brand = await page.locator(".forum-app-brand").boundingBox(), controls = await page.locator(".forum-app-controls").boundingBox();
    expect(brand!.x + brand!.width).toBeLessThanOrEqual(controls!.x);
    if (width >= 1280) {
      await expect(page.getByRole("navigation", { name: "Primary navigation", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Toggle Menu", exact: true })).toBeHidden();
    } else {
      await page.getByRole("button", { name: "Toggle Menu", exact: true }).click();
      const menu = page.locator("#primary-navigation-menu");
      await expect(menu).toBeVisible();
      const menuBounds = await menu.boundingBox();
      expect(menuBounds!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
      expect(menuBounds!.y + menuBounds!.height).toBeLessThanOrEqual(900);
      expect(menuBounds!.x + menuBounds!.width).toBeLessThanOrEqual(width);
      await menu.getByRole("link", { name: "Forum", exact: true }).click();
      await expect(menu).toHaveCount(0);
    }
    if (width === 390) {
      await page.screenshot({ path: "artifacts/forum-header/mobile.png", fullPage: false });
      await page.evaluate(() => window.scrollTo(0, 400));
      await expect(page.locator(".forum-app-shell")).toHaveClass(/forum-app-shell--scrolled/);
      await page.screenshot({ path: "artifacts/forum-header/mobile-scrolled.png", fullPage: false });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.getByRole("button", { name: "Open forum navigation", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Forum navigation", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Close forum navigation", exact: true }).click();
    }
  }
});

test("preserves navigation in dark mode", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors = await fixture(page);
  await page.getByRole("button", { name: "Switch to dark mode", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.screenshot({ path: "artifacts/forum-header/dark.png", fullPage: false });
  await page.getByRole("button", { name: "Explore", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Trends", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});
