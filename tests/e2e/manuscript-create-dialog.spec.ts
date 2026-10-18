import { expect, test, type Page } from "@playwright/test";
import type { CreateManuscript } from "@trend/shared-types";

test.setTimeout(60_000);

const projectId = "6ab33f1537802fe30d38753b", manuscriptId = "40000000-0000-4000-8000-000000000001";
const user = { id: "20000000-0000-4000-8000-000000000001", fullName: "Researcher", email: "preview@example.org", systemRole: "USER", role: "user", emailVerifiedAt: "2026-10-01", onboarding: { completed: true }, capabilities: ["BASIC_RESEARCH"] };
async function fixture(page: Page, archived = false) {
  const project = { _id: projectId, title: "Collaborative research", description: "Review research evidence", visibility: "PRIVATE", status: archived ? "ARCHIVED" : "PLANNING", ownerId: user.id, accessRole: "OWNER", version: 1, memberCount: 1, paperCount: 0, members: [], papers: [], updatedAt: "2026-10-15T08:00:00Z", createdAt: "2026-10-14T08:00:00Z" };
  const state = { attempts: [] as CreateManuscript[], failure: true, hold: false, release: () => {}, errors: [] as string[] };
  page.on("pageerror", error => state.errors.push(error.message));
  await page.addInitScript(authUser => {
    localStorage.setItem("lumigap.uiLanguage", "en");
    localStorage.setItem("trend-auth", JSON.stringify({ version: 1, state: { user: authUser, tokens: { accessToken: "ui-fixture-token", refreshToken: "ui-fixture-refresh" } } }));
  }, user);
  await page.route("**/api/v1/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (request.method() === "POST" && path === `/api/v1/projects/${projectId}/manuscripts`) {
      state.attempts.push(request.postDataJSON());
      if (state.hold) await new Promise<void>(resolve => { state.release = resolve; });
      return route.fulfill(state.failure ? { status: 503, json: { success: false } } : { status: 201, json: { success: true, data: { id: manuscriptId } } });
    }
    // Keep the browser test isolated from live project data.
    if (request.method() !== "GET") return route.fulfill({ status: 405, json: { success: false } });
    let data: unknown = [];
    if (path.endsWith("/auth/me")) data = { user };
    else if (path === "/api/v1/projects") data = [project];
    else if (path === `/api/v1/projects/${projectId}`) data = project;
    else if (path.endsWith("/workspace")) data = { project: { ...project, id: projectId, researchStage: null }, capabilities: { manageProject: !archived }, mentors: [] };
    else if (path.endsWith(`/manuscripts/${manuscriptId}`)) data = { id: manuscriptId, title: state.attempts.at(-1)?.title, files: [], canWrite: true, collaborators: [], compiler: { available: false } };
    else if (path.endsWith("/context")) data = { papers: [], questions: [], gaps: [], evidence: [], objectives: [] };
    return route.fulfill({ json: { success: true, data } });
  });
  await page.goto(`/projects/${projectId}?tab=manuscripts`);
  await expect(page.getByRole("heading", { name: "Start your first manuscript" })).toBeVisible({ timeout: 40_000 });
  return state;
}

test("creates in a popup, retains failed input and opens the editor after retry", async ({ page }) => {
  const state = await fixture(page);
  await page.getByRole("button", { name: "Create manuscript", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Create manuscript", exact: true });
  await expect(dialog.getByLabel("Manuscript title")).toBeFocused();
  await expect(dialog.getByRole("button", { name: "Create and open editor" })).toBeDisabled();
  await dialog.getByLabel("Manuscript title").fill("Evidence synthesis");
  await dialog.getByLabel("Document type").selectOption("THESIS");
  await dialog.getByRole("combobox", { name: /^Template/ }).selectOption("REPORT");
  await dialog.getByLabel("Short description (optional)").fill("A collaborative research draft");
  await page.screenshot({ path: "artifacts/manuscript-dialog/desktop.png", fullPage: true });
  await dialog.getByRole("button", { name: "Create and open editor" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Your input is retained");
  await expect(dialog.getByLabel("Manuscript title")).toHaveValue("Evidence synthesis");
  await expect(dialog.getByLabel("Document type")).toHaveValue("THESIS");
  await expect(dialog.getByRole("combobox", { name: /^Template/ })).toHaveValue("REPORT");
  state.failure = false;
  await dialog.getByRole("button", { name: "Create and open editor" }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/manuscripts/${manuscriptId}$`));
  await expect(dialog).toHaveCount(0);
  expect(state.attempts).toHaveLength(2);
  expect(state.attempts[1]).toEqual(state.attempts[0]);
  expect(state.errors).toEqual([]);
});

test("protects pending creation against dismissal and duplicate submits", async ({ page }) => {
  const state = await fixture(page); state.hold = true;
  await page.getByRole("button", { name: "Create manuscript", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Create manuscript", exact: true });
  await dialog.getByLabel("Manuscript title").fill("Pending draft");
  await dialog.getByRole("button", { name: "Create and open editor" }).click();
  await expect.poll(() => state.attempts.length).toBe(1);
  await expect(dialog.getByLabel("Manuscript title")).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeDisabled();
  await dialog.press("Escape");
  await dialog.locator("form").evaluate(form => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(state.attempts).toHaveLength(1);
  await expect(dialog).toBeVisible();
  state.release();
  await expect(dialog.getByRole("alert")).toBeVisible();
});

test("fits mobile and confirms dismissal of an unsaved draft", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  const trigger = page.getByRole("button", { name: "Create manuscript", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Create manuscript", exact: true });
  await dialog.getByLabel("Manuscript title").fill("Mobile research draft");
  await page.screenshot({ path: "artifacts/manuscript-dialog/mobile.png", fullPage: true });
  const bounds = await dialog.boundingBox();
  expect(bounds!.width).toBeLessThanOrEqual(390);
  expect(bounds!.height).toBeLessThanOrEqual(844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await dialog.press("Escape");
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(dialog.getByLabel("Manuscript title")).toHaveValue("Mobile research draft");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Leave without saving", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(dialog.getByLabel("Manuscript title")).toHaveValue("");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test("keeps archived projects read only", async ({ page }) => {
  await fixture(page, true);
  await expect(page.getByRole("button", { name: "Create manuscript", exact: true })).toHaveCount(0);
  await expect(page.getByText("This project is read-only.", { exact: true })).toBeVisible();
});
