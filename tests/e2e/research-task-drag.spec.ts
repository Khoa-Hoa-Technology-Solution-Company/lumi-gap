import { expect, test, type Locator, type Page } from "@playwright/test";
import type { MoveWorkspaceTask, WorkspaceTask, WorkspaceTaskStatus } from "@trend/shared-types";

const projectId = "10000000-0000-4000-8000-000000000001";
const user = { id: "20000000-0000-4000-8000-000000000001", fullName: "Researcher", email: "preview@example.org", systemRole: "USER", role: "user", emailVerifiedAt: "2026-10-01", onboarding: { completed: true }, capabilities: ["BASIC_RESEARCH"] };
const empty = { items: [], total: 0, page: 1, pageSize: 20, hasNext: false };
const statuses: WorkspaceTaskStatus[] = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"];

async function fixture(page: Page, archived = false) {
  await page.setViewportSize({ width: 1600, height: 1200 });
  const project = { _id: projectId, title: "Collaborative research", description: "Review research evidence", visibility: "PRIVATE", status: archived ? "ARCHIVED" : "PLANNING", ownerId: user.id, accessRole: "OWNER", version: 1, memberCount: 1, paperCount: 0, members: [], papers: [], updatedAt: "2026-10-15T08:00:00Z", createdAt: "2026-10-14T08:00:00Z" };
  const tasks: WorkspaceTask[] = ["Review evidence", "Compare methods", "Write findings"].map((title, i) => ({
    id: `30000000-0000-4000-8000-00000000000${i + 1}`, title, description: "", status: "TODO", blockedReason: "", priority: "HIGH", sortOrder: i, parentTaskId: null, checklist: [], completedBy: null, subtaskCount: 0, completedSubtaskCount: 0, deletedAt: null, assignee: null, creator: { id: user.id, name: user.fullName }, milestoneId: null, dueAt: null, completedAt: null, link: null, version: 1, createdAt: project.createdAt, updatedAt: project.updatedAt,
  }));
  let boardVersion = 1;
  const moves: MoveWorkspaceTask[] = [];
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.stack ?? error.message));
  await page.addInitScript(authUser => {
    localStorage.setItem("lumigap.uiLanguage", "en");
    localStorage.setItem("trend-auth", JSON.stringify({ version: 1, state: { user: authUser, tokens: { accessToken: "ui-fixture-token", refreshToken: "ui-fixture-refresh" } } }));
  }, user);
  await page.route("**/api/v1/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (request.method() === "POST" && path.endsWith("/move")) {
      const input = request.postDataJSON() as MoveWorkspaceTask;
      const index = tasks.findIndex(task => path.includes(task.id));
      expect(index).toBeGreaterThanOrEqual(0);
      expect(input.expectedVersion).toBe(tasks[index]!.version);
      expect(input.expectedBoardVersion).toBe(boardVersion);
      moves.push(input);
      const [task] = tasks.splice(index, 1);
      const before = input.beforeId ? tasks.findIndex(item => item.id === input.beforeId) : -1;
      const moved = { ...task!, status: input.status, version: task!.version + 1, blockedReason: input.status === "BLOCKED" ? input.blockedReason ?? "" : "" };
      tasks.splice(before < 0 ? tasks.length : before, 0, moved); boardVersion++;
      return route.fulfill({ json: { success: true, data: moved } });
    }
    // Every other write is blocked, so this browser fixture cannot change live data.
    if (request.method() !== "GET") return route.fulfill({ status: 405, json: { success: false } });
    let data: unknown = [];
    if (path.endsWith("/auth/me")) data = { user };
    else if (path === "/api/v1/projects") data = [project];
    else if (path === `/api/v1/projects/${projectId}`) data = project;
    else if (path.endsWith("/workspace")) data = { project: { ...project, id: projectId, researchStage: null }, capabilities: { manageProject: !archived }, mentors: [] };
    else if (path.endsWith("/tasks/board")) data = { boardVersion, columns: Object.fromEntries(statuses.map(status => { const items = tasks.filter(task => task.status === status); return [status, { ...empty, items, total: items.length }]; })) };
    else if (tasks.some(task => path.endsWith(`/tasks/${task.id}`))) data = { task: tasks.find(task => path.endsWith(`/tasks/${task.id}`)), canDelete: true, comments: empty, history: empty };
    else if (path.endsWith("/tasks")) data = empty;
    else if (path.endsWith("/milestones") || path.endsWith("/workspace/people")) data = empty;
    return route.fulfill({ json: { success: true, data, meta: { hasNext: false } } });
  });
  await page.goto(`/projects/${projectId}?tab=tasks`);
  await expect(page.locator(".task-card")).toHaveCount(3).catch(error => { console.log(errors); throw error; });
  return { moves, tasks, errors };
}

async function drag(page: Page, source: Locator, target: Locator, top = false, cancel = false) {
  const from = await source.boundingBox(), to = await target.boundingBox();
  expect(from).not.toBeNull(); expect(to).not.toBeNull();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(from!.x + from!.width / 2 + 12, from!.y + from!.height / 2, { steps: 4 });
  await page.waitForTimeout(250);
  await page.mouse.move(to!.x + to!.width / 2, to!.y + (top ? 12 : to!.height / 2), { steps: 25 });
  await page.waitForTimeout(300);
  if (cancel) await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator("[data-dnd-placeholder]")).toHaveCount(0);
  await expect(page.locator(".task-board")).toHaveAttribute("aria-busy", "false");
}

test("drags the title into empty and occupied columns and retains moves after reload", async ({ page }) => {
  const state = await fixture(page);
  const destination = page.locator('.task-column[data-status="IN_PROGRESS"]');
  await drag(page, page.getByRole("button", { name: "Review evidence", exact: true }), destination.locator(".task-column-empty"));
  await expect(destination.locator(".task-card-title")).toHaveText("Review evidence");
  expect(state.moves).toHaveLength(1); expect(state.moves[0]!.status).toBe("IN_PROGRESS");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload(); await expect(destination.locator(".task-card-title")).toHaveText("Review evidence");
  await drag(page, page.getByRole("button", { name: "Write findings", exact: true }), destination.locator(".task-card"), true).catch(error => { console.log(state.errors); throw error; });
  await expect(destination.locator(".task-card-title")).toHaveText(["Write findings", "Review evidence"]);
  expect(state.moves).toHaveLength(2); expect(state.moves[1]!.status).toBe("IN_PROGRESS");
  await page.reload();
  await expect(destination.locator(".task-card-title")).toHaveText(["Write findings", "Review evidence"]);
  expect(state.errors).toEqual([]);
});

test("reorders cards with the pointer and still supports the keyboard handle", async ({ page }) => {
  const state = await fixture(page);
  const cards = page.locator('.task-column[data-status="TODO"] .task-card');
  await drag(page, cards.nth(2).locator(".task-card-footer"), cards.first(), true);
  await expect(cards.first().locator(".task-card-title")).toHaveText("Write findings");
  expect(state.moves).toHaveLength(1); expect(state.moves[0]!.beforeId).toBe(state.tasks[1]!.id);
  const handle = cards.nth(2).locator(".task-drag-handle");
  await expect(handle).toBeEnabled();
  await handle.focus(); await handle.press("Space"); await page.waitForTimeout(100);
  await page.keyboard.press("ArrowUp"); await page.waitForTimeout(250); await page.keyboard.press("Space");
  await expect(cards.nth(1).locator(".task-card-title")).toHaveText("Compare methods");
  expect(state.moves).toHaveLength(2); expect(state.errors).toEqual([]);
});

test("requires a reason when dropping into Blocked and rolls back a rejected move", async ({ page }) => {
  const state = await fixture(page);
  const source = page.getByRole("button", { name: "Review evidence", exact: true });
  await drag(page, source, page.locator('.task-column[data-status="BLOCKED"] .task-column-empty'));
  await expect(page.getByRole("textbox", { name: "What is blocking this task?" })).toBeVisible();
  expect(state.moves).toHaveLength(0);
  await page.getByRole("textbox", { name: "What is blocking this task?" }).fill("Waiting for the dataset");
  await page.getByRole("button", { name: "Mark as blocked", exact: true }).click();
  await expect(page.locator('.task-column[data-status="BLOCKED"] .task-card-title')).toHaveText("Review evidence");
  expect(state.moves[0]!.blockedReason).toBe("Waiting for the dataset");
  await page.route("**/move", route => route.fulfill({ status: 409, json: { success: false, error: { code: "TASK_BOARD_CHANGED", message: "Board changed" } } }));
  await drag(page, source, page.locator('.task-column[data-status="TODO"] .task-card').first(), true);
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator('.task-column[data-status="BLOCKED"] .task-card-title')).toHaveText("Review evidence");
  expect(state.errors).toEqual([]);
});

test("cancels a cross-column drag and keeps title clicks and status controls working", async ({ page }) => {
  const state = await fixture(page);
  const title = page.getByRole("button", { name: "Review evidence", exact: true });
  await drag(page, title, page.locator('.task-column[data-status="DONE"] .task-column-empty'), false, true);
  await expect(page.locator('.task-column[data-status="TODO"] .task-card')).toHaveCount(3);
  expect(state.moves).toHaveLength(0);
  await title.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Task title", exact: true })).toHaveValue("Review evidence");
  await page.getByRole("button", { name: "Close task details", exact: true }).click();
  await page.getByLabel("Status for Review evidence", { exact: true }).selectOption("IN_PROGRESS");
  await expect(page.locator('.task-column[data-status="IN_PROGRESS"] .task-card-title')).toHaveText("Review evidence");
  expect(state.moves).toHaveLength(1); expect(state.errors).toEqual([]);
});

test("keeps archived boards read only", async ({ page }) => {
  const state = await fixture(page, true);
  await expect(page.locator(".task-drag-handle").first()).toBeDisabled();
  await drag(page, page.getByRole("button", { name: "Review evidence", exact: true }), page.locator('.task-column[data-status="DONE"] .task-column-empty'));
  await expect(page.locator('.task-column[data-status="TODO"] .task-card')).toHaveCount(3);
  expect(state.moves).toHaveLength(0); expect(state.errors).toEqual([]);
});
