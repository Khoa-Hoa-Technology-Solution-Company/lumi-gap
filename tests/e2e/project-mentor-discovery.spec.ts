import { expect, test, type Page } from "@playwright/test";

const projectId = "10000000-0000-4000-8000-000000000001";
async function fixture(page: Page, owner = true, available = true, limited = false) {
  const user = { id: "20000000-0000-4000-8000-000000000001", fullName: "Nguyễn Đình Thanh", email: "preview@example.org", systemRole: "USER", role: "user", emailVerifiedAt: "2026-10-01", onboarding: { completed: true }, capabilities: ["BASIC_RESEARCH"] };
  const project = { _id: projectId, title: "LumiGap", description: "Private research context", visibility: "PRIVATE", status: "PLANNING", ownerId: owner ? user.id : "another-owner", accessRole: owner ? "OWNER" : "MEMBER", version: 1, memberCount: 2, paperCount: 0, members: [], papers: [], updatedAt: "2026-10-17T08:00:00Z", createdAt: "2026-10-14T08:00:00Z" };
  let preview = { id: projectId, title: project.title, summary: "Approved research summary for mentors", researchAreas: ["Computer Science"], expertise: ["Machine Learning"], stage: "PLANNING", mentoringNeeds: "Study design and evaluation" };
  let settingsVersion = 1, discovery = "CLOSED", settingsReads = 0;
  const sender = { _id: user.id, fullName: user.fullName, academicRole: "STUDENT", institutionName: "FPT University", positionTitle: "Sinh viên" };
  const mentor = { _id: "30000000-0000-4000-8000-000000000001", fullName: "TS. Trần Minh Anh", institutionName: "FPT University", positionTitle: "Giảng viên", academicRole: "LECTURER", verifiedLecturer: true, acceptingMentorships: true, expertiseAreas: ["Machine Learning", "Computer Science"], researchInterests: ["Research methods"], matchedTerms: ["Machine Learning"], sameInstitution: true };
  const anotherMentor = { ...mentor, _id: "30000000-0000-4000-8000-000000000002", fullName: "TS. Nguyễn Hoàng Phúc", institutionName: "Đại học Quốc gia TP. HCM", expertiseAreas: ["Data Science"], researchInterests: ["Applied statistics"], matchedTerms: [], sameInstitution: false };
  const meta = { page: 1, pageSize: 20, total: 0, totalPages: 1 };
  const requests: unknown[] = [], suggestions: unknown[] = [], saved: Record<string, unknown>[] = [], sent: { path: string; body: Record<string, unknown> }[] = [], filters: URLSearchParams[] = [], errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(user => {
    localStorage.setItem("lumigap.uiLanguage", "vi");
    localStorage.setItem("trend-auth", JSON.stringify({ version: 1, state: { user, tokens: { accessToken: "ui-fixture-token", refreshToken: "ui-fixture-refresh" } } }));
  }, user);
  await page.route("**/api/v1/**", async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    if (request.method() === "PUT" && path.endsWith("/mentorship-discovery")) {
      const input = request.postDataJSON();
      if (!owner) return route.fulfill({ status: 403, json: {} });
      if (input.expectedVersion !== settingsVersion) return route.fulfill({ status: 409, json: {} });
      saved.push(input);
      preview = { ...preview, summary: input.summary, researchAreas: input.researchAreas, expertise: input.expertise, mentoringNeeds: input.mentoringNeeds };
      discovery = input.discovery;
      return route.fulfill({ json: { success: true, data: { ...preview, discovery, version: ++settingsVersion, invitationSender: sender } } });
    }
    // Exercise real UI requests with isolated fixtures; never contact a lecturer.
    if (request.method() === "POST" && (path.endsWith("/mentorships") || path.endsWith("/mentor-suggestions"))) {
      const body = request.postDataJSON(); sent.push({ path, body });
      if (path.endsWith("/mentor-suggestions")) suggestions.push({ id: "suggestion-1", mentorUser: mentor, suggestedBy: { fullName: user.fullName }, message: body.message });
      else requests.push({ id: "invitation-1", kind: "REQUEST", direction: "PROJECT_TO_LECTURER", status: "PENDING", projectId, project: preview, mentorUser: mentor, requestedBy: { fullName: user.fullName }, message: body.message, createdAt: project.createdAt, actions: { cancel: true } });
      return route.fulfill({ status: 201, json: { success: true, data: {} } });
    }
    if (request.method() !== "GET") return route.fulfill({ status: 405, json: {} });
    let data: unknown = [];
    if (path.endsWith("/auth/me")) data = { user };
    else if (path === "/api/v1/projects") data = [project];
    else if (path === `/api/v1/projects/${projectId}`) data = project;
    else if (path.endsWith("/academic-support")) data = { project: preview, canManage: owner, canProvideFeedback: true, accessRole: "TEAM", guidance: [], context: { description: project.description, inclusionCriteria: [], exclusionCriteria: [], items: [], counts: { papers: 0, gaps: 0, evidence: 0, reports: 0, members: 2 }, meta } };
    else if (path.endsWith("/available-mentors")) { filters.push(url.searchParams); data = { items: available ? preview.expertise.includes("Data Science") ? [{ ...anotherMentor, matchedTerms: ["Data Science"] }, mentor] : [mentor, anotherMentor] : [], meta: { ...meta, total: available ? 2 : 0 } }; }
    else if (path.endsWith("/mentorships")) data = { relationships: [], requests, counts: { active: limited ? 2 : 0, pending: requests.length, incoming: 0 }, policy: { maxActiveMentors: 2, maxPendingRequests: 5 }, requestMeta: meta, relationshipMeta: meta };
    else if (path.endsWith("/mentor-suggestions")) data = { items: suggestions, meta };
    else if (path.endsWith("/mentorship-discovery")) { settingsReads++; data = { ...preview, discovery, version: settingsVersion, invitationSender: sender }; }
    else if (path.endsWith("/academic-onboarding/options")) data = { researchAreas: ["Computer Science"] };
    else if (path.endsWith("/workspace")) data = { project: { ...project, id: projectId }, capabilities: { manageProject: owner }, mentors: [] };
    return route.fulfill({ json: { success: true, data } });
  });
  await page.goto(`/projects/${projectId}?tab=papers`);
  if (page.viewportSize()!.width < 768) await page.locator("#project-section-select").selectOption("support");
  else await page.locator("#project-tab-support").click();
  await expect(page).toHaveURL(/tab=support/);
  return { sent, saved, filters, errors, settingsReads: () => settingsReads };
}

test("owner finds mentors directly from the project, filters and sends an invitation", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const state = await fixture(page);
  await expect(page.locator("#project-tab-support")).toContainText("Tìm cố vấn");
  await expect(page.getByRole("heading", { name: "Tìm cố vấn", exact: true })).toBeInViewport();
  await expect(page.locator(".mentor-result")).toHaveCount(2);
  await expect(page.locator(".mentor-result").first().locator(".mentor-match").first()).toContainText("Machine Learning");
  await expect(page.getByRole("textbox", { name: "Lĩnh vực nghiên cứu", exact: true })).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Thêm hướng dẫn", exact: true })).not.toBeVisible();
  await page.screenshot({ path: "artifacts/mentor-discovery/search-desktop.png", fullPage: true });
  await expect(page.getByText("TS. Trần Minh Anh", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Bộ lọc/ }).click();
  await page.getByLabel("Lĩnh vực nghiên cứu", { exact: true }).fill("Computer Science");
  await expect.poll(() => state.filters.at(-1)?.get("area")).toBe("Computer Science");
  await page.getByRole("button", { name: /^Bộ lọc/ }).click();
  await expect(page.locator(".mentor-active-filters")).toContainText("Computer Science");
  await page.locator(".mentor-result").first().getByRole("button", { name: "Mời làm mentor", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Approved research summary for mentors");
  await expect(dialog).not.toContainText("Private research context");
  await expect(dialog.locator(".mentor-invitation-sender")).toContainText("Nguyễn Đình Thanh");
  await expect(dialog.locator(".mentor-invitation-sender")).toContainText("FPT University");
  await expect(dialog).not.toContainText("preview@example.org");
  await dialog.locator("textarea").fill("Nhóm em cần hướng dẫn về thiết kế nghiên cứu.");
  await dialog.getByRole("button", { name: "Gửi lời mời", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Hủy yêu cầu", exact: true })).toBeVisible();
  expect(state.sent).toHaveLength(1);
  expect(state.sent[0]!.path).toBe(`/api/v1/projects/${projectId}/mentorships`);
  expect(state.sent[0]!.body).toMatchObject({ mentorUserId: "30000000-0000-4000-8000-000000000001", message: "Nhóm em cần hướng dẫn về thiết kế nghiên cứu." });
  expect(state.sent[0]!.body.idempotencyKey).toBeTruthy();
  await page.screenshot({ path: "artifacts/mentor-discovery/owner.png", fullPage: true });
  expect(state.errors).toEqual([]);
});

test("member suggests a mentor without sending an official invitation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await fixture(page, false);
  await expect(page.getByRole("button", { name: "Chỉnh sửa nhu cầu", exact: true })).toHaveCount(0);
  expect(state.settingsReads()).toBe(0);
  await expect(page.getByRole("button", { name: "Mời làm mentor", exact: true })).toHaveCount(0);
  await page.screenshot({ path: "artifacts/mentor-discovery/search-mobile.png", fullPage: true });
  await page.locator(".mentor-result").first().getByRole("button", { name: "Đề xuất cố vấn", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("textarea").fill("Cô có chuyên môn phù hợp với hướng nghiên cứu của nhóm.");
  await dialog.getByRole("button", { name: "Gửi đề xuất", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(state.sent[0]!.path).toBe(`/api/v1/projects/${projectId}/mentor-suggestions`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "artifacts/mentor-discovery/member-mobile.png", fullPage: true });
  expect(state.errors).toEqual([]);
});

test("owner saves mentor needs, gets refreshed suggestions and edits shared details before inviting", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const state = await fixture(page);
  const preferences = page.getByRole("region", { name: "Nhu cầu tìm cố vấn", exact: true });
  await preferences.getByRole("button", { name: "Chỉnh sửa nhu cầu", exact: true }).click();
  await expect(page.locator(".mentor-result").first().getByRole("button", { name: "Mời làm mentor", exact: true })).toBeDisabled();
  const expertise = preferences.getByRole("combobox", { name: "Chuyên môn cần hỗ trợ", exact: true });
  await expertise.fill("Data Science");
  await expertise.press("Enter");
  await preferences.getByRole("textbox", { name: "Nhu cầu hướng dẫn", exact: true }).fill("Góp ý hằng tuần về phương pháp đánh giá dữ liệu.");
  await preferences.getByRole("textbox", { name: "Giới thiệu dự án gửi giảng viên", exact: true }).fill("Nhóm nghiên cứu cách đánh giá chất lượng dữ liệu y khoa.");
  await page.screenshot({ path: "artifacts/mentor-discovery/preferences-editor-desktop.png", fullPage: true });
  await preferences.getByRole("button", { name: "Lưu nhu cầu tìm cố vấn", exact: true }).click();
  await expect(preferences.getByRole("button", { name: "Chỉnh sửa nhu cầu", exact: true })).toBeVisible();
  expect(state.saved[0]).toMatchObject({ discovery: "CLOSED", expertise: ["Machine Learning", "Data Science"], mentoringNeeds: "Góp ý hằng tuần về phương pháp đánh giá dữ liệu.", expectedVersion: 1 });
  await expect(page.locator(".mentor-result").first()).toContainText("TS. Nguyễn Hoàng Phúc");
  await page.reload();
  await expect(preferences).toContainText("Góp ý hằng tuần về phương pháp đánh giá dữ liệu.");
  await page.locator(".mentor-result").first().getByRole("button", { name: "Mời làm mentor", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Nhóm nghiên cứu cách đánh giá chất lượng dữ liệu y khoa.");
  await dialog.getByRole("button", { name: "Sửa thông tin dự án", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Gửi lời mời", exact: true })).toBeDisabled();
  await dialog.getByRole("textbox", { name: "Giới thiệu dự án gửi giảng viên", exact: true }).fill("Giới thiệu dự án được trưởng nhóm duyệt để gửi giảng viên.");
  await dialog.getByRole("button", { name: "Lưu nhu cầu tìm cố vấn", exact: true }).click();
  await expect(dialog).toContainText("Giới thiệu dự án được trưởng nhóm duyệt để gửi giảng viên.");
  await dialog.getByRole("textbox", { name: /^Lời nhắn/ }).fill("Mong thầy góp ý phương pháp và trao đổi cùng nhóm mỗi tuần.");
  await page.screenshot({ path: "artifacts/mentor-discovery/invitation-preview.png", fullPage: true });
  await dialog.getByRole("button", { name: "Gửi lời mời", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(state.saved[1]).toMatchObject({ summary: "Giới thiệu dự án được trưởng nhóm duyệt để gửi giảng viên.", expectedVersion: 2 });
  expect(state.sent[0]!.body).toMatchObject({ mentorUserId: "30000000-0000-4000-8000-000000000002", message: "Mong thầy góp ý phương pháp và trao đổi cùng nhóm mỗi tuần." });
  expect(state.sent[0]!.body).not.toHaveProperty("invitationSender");
  expect(state.errors).toEqual([]);
});

test("empty mentor search keeps filters available and explains the result", async ({ page }) => {
  await fixture(page, true, false);
  await expect(page.getByText("Hiện chưa có giảng viên đang nhận nhóm.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Xóa bộ lọc", exact: true })).toHaveCount(0);
  await page.getByRole("textbox", { name: "Tìm mentor đang nhận nhóm", exact: true }).fill("No match");
  await expect(page.getByText("Không có mentor đang nhận nhóm phù hợp với bộ lọc.", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Tìm mentor đang nhận nhóm", exact: true })).toBeVisible();
  await page.locator(".mentor-search-empty").getByRole("button").click();
  await expect(page.getByRole("textbox", { name: "Tìm mentor đang nhận nhóm", exact: true })).toHaveValue("");
});

test("mentor limit keeps lecturer profiles available while preventing new invitations", async ({ page }) => {
  await fixture(page, true, true, true);
  await expect(page.locator(".mentor-result")).toHaveCount(2);
  await expect(page.locator(".mentor-result").first().getByRole("button", { name: "Mời làm mentor", exact: true })).toBeDisabled();
  await expect(page.locator(".mentor-result").first().getByRole("link", { name: "Xem hồ sơ", exact: true })).toHaveAttribute("href", /\/academics\//);
});

test("owner configures mentor preferences on mobile and keeps input after a failed save", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await fixture(page);
  let fail = true;
  await page.route("**/mentorship-discovery", async route => {
    if (route.request().method() === "PUT" && fail) return route.fulfill({ status: 500, json: { success: false } });
    return route.fallback();
  });
  const preferences = page.getByRole("region", { name: "Nhu cầu tìm cố vấn", exact: true });
  await preferences.getByRole("button", { name: "Chỉnh sửa nhu cầu", exact: true }).click();
  await preferences.getByRole("textbox", { name: "Nhu cầu hướng dẫn", exact: true }).fill("Cần cố vấn góp ý phương pháp mỗi tuần.");
  await preferences.getByRole("button", { name: "Lưu nhu cầu tìm cố vấn", exact: true }).click();
  await expect(preferences.getByRole("alert")).toBeVisible();
  await expect(preferences.getByRole("textbox", { name: "Nhu cầu hướng dẫn", exact: true })).toHaveValue("Cần cố vấn góp ý phương pháp mỗi tuần.");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "artifacts/mentor-discovery/preferences-editor-mobile.png", fullPage: true });
  fail = false;
  await preferences.getByRole("button", { name: "Lưu nhu cầu tìm cố vấn", exact: true }).click();
  await expect(preferences.getByRole("button", { name: "Chỉnh sửa nhu cầu", exact: true })).toBeVisible();
  expect(state.saved[0]!.mentoringNeeds).toBe("Cần cố vấn góp ý phương pháp mỗi tuần.");
  expect(state.errors).toEqual([]);
});
