import { expect, test, type Page } from "@playwright/test";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for the production browser E2E gate`);
  }
  return value;
}

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(requiredEnv("E2E_USER_EMAIL"));
  await page.getByLabel("Password").fill(requiredEnv("E2E_USER_PASSWORD"));

  await Promise.all([
    page.waitForURL((url) => !url.pathname.endsWith("/login")),
    page.getByRole("button", { name: /^login$/i }).click(),
  ]);
}

async function submitSearch(page: Page, query: string): Promise<void> {
  const input = page.getByTestId("paper-search-input");
  await input.fill(query);
  await input.press("Enter");
}

test("keyword -> semantic -> AI rerank -> paper detail -> PDF -> translate", async ({
  page,
  context,
}) => {
  const paperId = requiredEnv("E2E_PAPER_ID");
  const query = requiredEnv("E2E_SEARCH_QUERY");
  const translationLanguage = process.env.E2E_TRANSLATION_LANGUAGE?.trim() || "vi";

  await login(page);
  await page.goto("/search");

  await page.getByTestId("search-mode-menu").click();
  await page.getByTestId("search-mode-keyword").click();
  const keywordResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/papers") &&
      response.request().method() === "GET" &&
      response.ok(),
  );
  await submitSearch(page, query);
  await keywordResponse;
  await expect(page.getByTestId("paper-search-results")).toBeVisible();
  await expect(page.getByTestId("paper-card").first()).toBeVisible();

  await page.getByTestId("search-mode-menu").click();
  const semanticResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/search") &&
      response.request().method() === "GET" &&
      !response.url().includes("rerank=true") &&
      response.ok(),
  );
  await page.getByTestId("search-mode-semantic").click();
  await semanticResponse;
  await expect(page.getByTestId("paper-card").first()).toBeVisible();

  const rerankResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/search") &&
      response.url().includes("rerank=true") &&
      response.request().method() === "GET" &&
      response.ok(),
  );
  await page.getByTestId("ai-rerank-toggle").click();
  await rerankResponse;

  const fixtureCard = page.locator(
    `[data-testid="paper-card"][data-paper-id="${paperId}"]`,
  );
  await expect(
    fixtureCard,
    "The E2E fixture paper must be returned by the configured search query",
  ).toBeVisible();
  await fixtureCard.getByTestId("paper-detail-link").click();

  await expect(page.getByTestId("paper-detail-page")).toBeVisible();
  await expect(page.getByTestId("paper-detail-title")).toBeVisible();

  const pdfAction = page.getByTestId("paper-pdf-action");
  await expect(
    pdfAction,
    "The E2E fixture paper must expose a readable PDF",
  ).toBeVisible();
  const pdfPagePromise = context.waitForEvent("page");
  await pdfAction.click();
  const pdfPage = await pdfPagePromise;
  await pdfPage.waitForURL((url) => url.href !== "about:blank", {
    timeout: 30_000,
  });
  expect(pdfPage.url()).toMatch(/^https?:\/\//);
  await pdfPage.close();

  await page.getByTestId("paper-translate-menu").click();
  const translationDialog = page.getByRole("dialog");
  await expect(translationDialog).toBeVisible();
  await translationDialog
    .locator("#action-target-language")
    .selectOption(translationLanguage);

  const translationResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/translate") &&
      response.request().method() === "POST" &&
      response.ok(),
  );
  await translationDialog.getByRole("button", { name: /^translate$/i }).click();
  await translationResponse;

  const translatedAbstract = page.getByTestId("paper-abstract-translated");
  await expect(translatedAbstract).toBeVisible();
  await expect(translatedAbstract).not.toBeEmpty();
});
