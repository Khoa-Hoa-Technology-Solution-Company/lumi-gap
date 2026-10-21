import { expect, test, type Page } from "@playwright/test";

const projectId = "10000000-0000-4000-8000-000000000001";
const user = { id: "20000000-0000-4000-8000-000000000001", fullName: "Nguyễn Đình Thanh", email: "preview@example.org", systemRole: "USER", role: "user", emailVerifiedAt: "2026-10-01", onboarding: { completed: true }, capabilities: ["BASIC_RESEARCH"] };
const colleague = { id: "teammate", fullName: "Trần Minh Anh" };
async function fixture(page: Page, language = "vi") {
  const project = { _id: projectId, title: "LumiGap", description: "Nghiên cứu cộng tác", visibility: "PRIVATE", status: "PLANNING", ownerId: user.id, accessRole: "OWNER", version: 1, memberCount: 2, paperCount: 2, members: [], papers: [{ id: "source-1", targetKind: "Paper", targetId: { _id: "paper-1", title: "Research evaluation methods" }, screeningStatus: "INCLUDED", readingStatus: "UNREAD" }, { id: "source-2", targetKind: "Paper", targetId: { _id: "paper-2", title: "Collaborative research practices" }, screeningStatus: "INCLUDED", readingStatus: "UNREAD" }], updatedAt: "2026-10-17T08:00:00Z", createdAt: "2026-10-14T08:00:00Z" };
  const messages = Array.from({ length: 12 }, (_, index) => ({ id: `message-${index}`, projectId, sender: index % 3 === 0 ? user : colleague, content: index === 10 ? "Mình đã cập nhật thêm hai bài báo về phương pháp đánh giá. Cả nhóm xem giúp phần hạn chế nhé.\nhttps://example.org/" + "research".repeat(25) : index % 3 === 0 ? "Mình đồng ý. Chiều nay nhóm cùng rà lại tiêu chí sàng lọc trước khi tổng hợp kết quả nhé." : "Mình đã đọc phần phương pháp. Chúng ta nên so sánh thêm kích thước mẫu và cách thu thập dữ liệu.", createdAt: new Date(Date.UTC(2026, 9, 17, 8, index + 1)).toISOString(), readBy: [user], readCount: 1, isDeleted: index === 1 }));
  let failSend = true;
  const sent: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(({ authUser, language }) => {
    localStorage.setItem("lumigap.uiLanguage", language);
    localStorage.setItem("trend-auth", JSON.stringify({ version: 1, state: { user: authUser, tokens: { accessToken: "ui-fixture-token", refreshToken: "ui-fixture-refresh" } } }));
  }, { authUser: user, language });
  await page.route("**/api/v1/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    // Deterministic UI fixture; no requests are forwarded to the local database.
    if (path.endsWith("/events")) return route.fulfill({ contentType: "text/event-stream", body: 'data: {"type":"ready"}\n\n' });
    if (request.method() === "POST" && path.endsWith("/team-chat")) {
      if (failSend) { failSend = false; return route.fulfill({ status: 503, json: { success: false, error: { message: "Connection interrupted" } } }); }
      const content = request.postDataJSON().content;
      sent.push(content);
      const message = { ...messages[0]!, id: `sent-${sent.length}`, sender: user, content, createdAt: new Date().toISOString() };
      messages.push(message);
      return route.fulfill({ json: { success: true, data: { message } } });
    }
    if (request.method() === "POST" && path.endsWith("/read")) return route.fulfill({ json: { success: true, data: { message: messages.at(-1) } } });
    if (request.method() !== "GET") return route.fulfill({ status: 405, json: { success: false } });
    let data: unknown = [];
    if (path.endsWith("/auth/me")) data = { user };
    else if (path === "/api/v1/projects") data = [project];
    else if (path === `/api/v1/projects/${projectId}`) data = project;
    else if (path.endsWith("/workspace")) data = { project: { ...project, id: projectId, researchStage: null }, capabilities: { manageProject: true }, mentors: [] };
    else if (path.endsWith("/team-chat")) data = { messages };
    else if (path.endsWith("/chat")) data = { messages: [] };
    return route.fulfill({ json: { success: true, data } });
  });
  await page.goto(`/projects/${projectId}?tab=chat`);
  await expect(page.locator(".project-chat-message").last()).toBeVisible();
  return { messages, sent, errors };
}

test("desktop chat keeps reading position, retries failed sends and separates drafts", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const state = await fixture(page);
  const feed = page.locator(".project-team-chat-panel .project-chat-feed");
  const input = page.locator(".project-chat-compose textarea");
  await expect(input).toBeInViewport({ ratio: 1 });
  await expect(page.locator('.project-chat-compose button[type="submit"]')).toBeInViewport({ ratio: 1 });
  await feed.evaluate(node => { node.scrollTop = 0; node.dispatchEvent(new Event("scroll")); });
  state.messages.push({ ...state.messages[2]!, id: "incoming", content: "Tin mới trong khi bạn đang đọc lịch sử.", createdAt: "2026-10-17T10:00:00Z" });
  await expect(page.getByRole("button", { name: "Tin nhắn mới", exact: true })).toBeVisible({ timeout: 12000 });
  expect(await feed.evaluate(node => node.scrollTop)).toBeLessThan(10);
  await page.getByRole("button", { name: "Tin nhắn mới", exact: true }).click();
  await expect(page.getByText("Tin mới trong khi bạn đang đọc lịch sử.")).toBeInViewport();
  await input.fill("Cập nhật của nhóm");
  await input.press("Shift+Enter");
  await input.pressSequentially("Nội dung dòng hai");
  expect(state.sent).toHaveLength(0);
  await input.press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: "Chưa gửi được" })).toBeVisible();
  await expect(input).toHaveValue("Cập nhật của nhóm\nNội dung dòng hai");
  await page.locator('.project-chat-compose button[type="submit"]').click();
  await expect(input).toHaveValue("");
  await expect(input).toBeFocused();
  expect(state.sent).toEqual(["Cập nhật của nhóm\nNội dung dòng hai"]);
  await page.locator(".project-chat-channels [role=tab]").nth(1).click();
  await input.fill("Bản nháp riêng tư");
  await page.locator(".project-chat-channels [role=tab]").nth(2).click();
  await expect(input).toHaveValue("");
  await page.locator(".project-chat-channels [role=tab]").nth(1).click();
  await expect(input).toHaveValue("Bản nháp riêng tư");
  await page.locator(".project-chat-channels [role=tab]").nth(0).click();
  await input.fill("Nhóm mình hẹn 15 giờ để chốt phần phương pháp nhé.");
  await page.screenshot({ path: "artifacts/chat-ux/desktop.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(state.errors).toEqual([]);
});

test.describe("touch chat", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test("keeps mobile Enter for writing and fits light and dark themes", async ({ page }) => {
    const state = await fixture(page);
    const input = page.locator(".project-chat-compose textarea");
    await input.fill("Hẹn nhóm chiều nay"); await input.press("Enter");
    expect(state.sent).toHaveLength(0);
    await expect(input).toHaveValue("Hẹn nhóm chiều nay\n");
    await input.scrollIntoViewIfNeeded();
    await expect(page.locator('.project-chat-compose button[type="submit"]')).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: "artifacts/chat-ux/mobile.png", fullPage: true });
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.screenshot({ path: "artifacts/chat-ux/mobile-dark.png", fullPage: true });
    expect(state.errors).toEqual([]);
  });
});
