import { expect, test } from "@playwright/test";

const PUBLIC_ROUTES = ["/home", "/trends", "/forum", "/communities", "/login"];
const VIEWPORTS = [
  { name: "small mobile", width: 320, height: 800 },
  { name: "mobile", width: 360, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

for (const viewport of VIEWPORTS) {
  test(`public application shell has no root overflow on ${viewport.name}`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize(viewport);

    for (const route of PUBLIC_ROUTES) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page.locator("#root header, #root form").first()).toBeVisible();

      await expect.poll(
        () => page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)),
        { message: `${route} should fit the ${viewport.width}px viewport` },
      ).toBeLessThanOrEqual(1);
    }
  });
}

test("small mobile navigation exposes hidden preferences and route groups", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/home", { waitUntil: "domcontentloaded" });

  const menuButton = page.getByRole("button", { name: "Toggle Menu" });
  await expect(menuButton).toBeVisible();
  await menuButton.click();

  const menu = page.locator("#primary-navigation-menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("button", { name: "Change language" })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Trends" })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Forum" })).toBeVisible();
});
