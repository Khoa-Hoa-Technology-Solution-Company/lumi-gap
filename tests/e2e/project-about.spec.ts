import { expect, test } from "@playwright/test";
import type { PlanDraftUpdate, ResearchPlanContent } from "@trend/shared-types";

test("reads the project introduction, edits one field and keeps supporting research details", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const id = "10000000-0000-4000-8000-000000000001";
  const user = { id: "20000000-0000-4000-8000-000000000001", fullName: "Researcher", email: "preview@example.org", systemRole: "USER", role: "user", emailVerifiedAt: "2026-10-01", onboarding: { completed: true }, capabilities: ["BASIC_RESEARCH"] };
  const project = { _id: id, title: "Evidence in collaborative research", description: "How teams make sense of conflicting findings.", status: "ACTIVE", visibility: "PRIVATE", ownerId: user.id, accessRole: "OWNER", version: 1, members: [], papers: [], memberCount: 1, paperCount: 0, createdAt: "2026-10-01", updatedAt: "2026-10-17" };
  let content: ResearchPlanContent = { approach: "EXPLORATORY", problem: "# Evidence in collaborative research\n\nResearch rarely follows a straight line. Our team is exploring how students assess evidence when published studies reach different conclusions.\n\nWe want to understand which signals help teams identify reliable findings, discuss uncertainty and explain their research choices.", objectives: ["Understand how teams discuss conflicting evidence"], questions: [], scope: "Student research teams", methodology: "Interviews and a small observational study", searchStrategy: "", deliverables: [], inclusionCriteria: ["Peer reviewed studies"], exclusionCriteria: [] };
  let version = 1;
  const writes: PlanDraftUpdate[] = [];
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(user => {
    localStorage.setItem("lumigap.uiLanguage", "en");
    localStorage.setItem("trend-auth", JSON.stringify({ version: 1, state: { user, tokens: { accessToken: "ui-fixture-token", refreshToken: "ui-fixture-refresh" } } }));
  }, user);
  // This browser fixture never writes to the application database.
  await page.route("**/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path.endsWith("/plan/draft") && route.request().method() === "PATCH") {
      const input = route.request().postDataJSON() as PlanDraftUpdate;
      writes.push(input);
      content = { ...content, ...input.changes };
      data = { content, version: ++version };
    } else if (route.request().method() !== "GET") return route.fulfill({ status: 405, json: {} });
    else if (path.endsWith("/auth/me")) data = { user };
    else if (path === "/api/v1/projects") data = [project];
    else if (path === `/api/v1/projects/${id}`) data = project;
    else if (path.endsWith("/plan")) data = { projectId: id, projectTitle: project.title, version, currentRevisionId: "revision", canEdit: true, canShare: false, archived: false, access: "TEAM", content };
    return route.fulfill({ json: { success: true, data } });
  });
  await page.goto(`/projects/${id}?tab=plan`);
  const about = page.locator(".project-about");
  await expect(about.getByRole("heading", { name: project.title })).toBeVisible();
  await expect(page.getByRole("tab", { name: "About project", exact: true })).toBeVisible();
  await expect(about.locator("textarea")).toHaveCount(0);
  await page.screenshot({ path: "artifacts/project-about/desktop.png", fullPage: true });
  await about.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(about.locator("textarea:visible")).toHaveCount(1);
  await expect(about.locator("textarea")).toHaveCount(1);
  await expect(about.locator("details, select")).toHaveCount(0);
  const introduction = "# Evidence in collaborative research\n\nOur project explores how research teams evaluate conflicting evidence.\n\nWe study the decisions teams make while comparing published findings.";
  await about.getByRole("textbox", { name: "Project introduction", exact: true }).fill(introduction);
  await about.getByRole("tab", { name: "Preview", exact: true }).click();
  await expect(about.locator(".project-readme-content h1")).toHaveText(project.title);
  await about.getByRole("button", { name: "Done editing", exact: true }).click();
  await expect(about.locator("textarea")).toHaveCount(0);
  expect(writes).toHaveLength(1);
  expect(writes[0]!.changes).toEqual({ problem: introduction });
  expect(content.methodology).toBe("Interviews and a small observational study");
  expect(content.inclusionCriteria).toEqual(["Peer reviewed studies"]);
  await page.reload();
  await expect(about.locator(".project-readme-content h1")).toHaveText(project.title);
  await expect(about.locator(".project-readme-content")).toContainText("Our project explores");
  await expect(about.locator("details, select")).toHaveCount(0);
  await expect(about.getByText("Versions & mentor feedback", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("tab").last()).toHaveText("About project");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: "artifacts/project-about/mobile.png", fullPage: true });
  expect(errors).toEqual([]);
});
