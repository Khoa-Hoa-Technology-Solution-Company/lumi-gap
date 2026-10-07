import { expect, test } from "@playwright/test";

test("legacy search URLs redirect to the dedicated literature results page", async ({ page }) => {
  await page.goto("/search?q=climate%20adaptation");

  await expect(page).toHaveURL(/\/literature\?q=climate%20adaptation$/);
  const composer = page.locator('form[role="search"]');
  await expect(composer).toBeVisible();
  await expect(composer.locator('input[type="search"]')).toHaveValue("climate adaptation");
  await expect(page.locator("#home-search-results")).toBeVisible();
  await expect(page.locator("#home-workflow")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Search$/i })).toHaveCount(0);
});
