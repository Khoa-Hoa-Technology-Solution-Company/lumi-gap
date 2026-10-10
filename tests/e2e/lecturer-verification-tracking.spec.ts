import { expect, test, type Page } from "@playwright/test";

// Production UI with isolated API fixtures. Database permissions/transitions are
// exercised separately by adaptive-lecturer.persistence.test.ts.
const user = { id: "30000000-0000-4000-8000-000000000020", fullName: "Lecturer UI Fixture", email: "lecturer@example.test", role: "user", systemRole: "USER", accountStatus: "ACTIVE", academicProfileType: "lecturer", emailVerifiedAt: "2026-10-08T10:00:00Z", onboarding: { completed: true }, points: 0, capabilities: ["BASIC_RESEARCH"] };
const requestId = "10000000-0000-4000-8000-000000000020";
const institutionId = "20000000-0000-4000-8000-000000000020";
const labels = {
  NOT_SUBMITTED: "Chưa xác minh tư cách giảng viên",
  PENDING: "Đang chờ xét duyệt",
  NEEDS_MORE_INFORMATION: "Cần bổ sung thông tin",
  VERIFIED: "Đã xác minh vị trí giảng viên",
  REJECTED: "Chưa thể xác minh tư cách giảng viên",
};
type Status = keyof typeof labels;

async function fixture(page: Page, initial: Status, unavailable = false, singleFile = false) {
  let status = initial;
  let submitted: Record<string, unknown> | undefined;
  let requests = 0;
  await page.addInitScript(authUser => {
    localStorage.setItem("trend-auth", JSON.stringify({ version: 1, state: { user: authUser, tokens: { accessToken: "ui-fixture", refreshToken: "ui-fixture" } } }));
    localStorage.setItem("lumigap.uiLanguage", "vi");
    localStorage.setItem("theme", "light");
  }, user);
  await page.route("**/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path.endsWith("/auth/me")) data = { user };
    else if (path.endsWith("/verification-status")) {
      requests++;
      if (unavailable) return route.fulfill({ status: 503, json: { success: false, message: "Fixture temporarily unavailable" } });
      const request = { id: requestId, status, revision: 1, institutionId, institutionName: "Fixture University — Department of Advanced Research and Academic Studies", position: "Lecturer", verificationMethod: "INSTITUTIONAL_EMAIL_AND_PROFILE", submittedAt: "2026-10-08T10:00:00Z", reviewedAt: status === "PENDING" ? undefined : "2026-10-08T11:00:00Z", applicantMessage: ["NEEDS_MORE_INFORMATION", "REJECTED"].includes(status) ? "Vui lòng bổ sung minh chứng vị trí công tác hiện tại." : undefined, evidence: [{ id: "source-fixture", type: "OFFICIAL_FACULTY_PROFILE", sourceKind: "URL", reference: "https://example.test/faculty", displayName: "OFFICIAL_FACULTY_PROFILE", submittedAt: "2026-10-08T10:00:00Z", isAvailable: true, replaced: false }, { id: "removed-fixture", type: "APPOINTMENT_DOCUMENT", sourceKind: "DOCUMENT", displayName: "appointment.pdf", submittedAt: "2026-10-08T10:00:00Z", isAvailable: false, replaced: false }] };
      if (singleFile) {
        request.institutionName = "FPT University";
        request.position = "Senior Lecturer";
        request.evidence = [{ id: "staff-card", type: "STAFF_ID", sourceKind: "DOCUMENT", displayName: "Screenshot_2026-10-09_154745.png", submittedAt: "2026-10-08T10:00:00Z", isAvailable: true, replaced: false }];
      }
      data = { lecturer: { status, academicRole: "LECTURER", accountEmailVerified: true, institutionId, institutionName: request.institutionName, position: "Lecturer", allowedActions: status === "PENDING" ? [] : status === "VERIFIED" ? ["MENTORING_SETTINGS", "WORKSPACE"] : status === "NEEDS_MORE_INFORMATION" ? ["SUPPLEMENT"] : status === "REJECTED" ? ["NEW_REQUEST"] : ["START"], currentRequestId: status === "NOT_SUBMITTED" ? undefined : requestId, selectedRequest: status === "NOT_SUBMITTED" ? null : request, history: status === "NOT_SUBMITTED" ? [] : [request], timeline: status === "NOT_SUBMITTED" ? [] : [{ id: "event-fixture", eventType: "SUBMITTED", requestId, createdAt: request.submittedAt }], page: 1, totalPages: 1 } };
    } else if (path.endsWith("/institutional-email/status")) data = { verified: true, accountEmailVerified: true, email: user.email, institutionId, source: "ACCOUNT", officialDomains: ["example.test"], approvedEmailDomains: [{ domain: "example.test", allowSubdomains: false }] };
    else if (path.endsWith("/academic-profiles/me")) data = { userId: user.id, academicRole: "LECTURER", academicRoleVerificationStatus: status === "VERIFIED" ? "VERIFIED" : "SELF_DECLARED", affiliation: { institutionId, institutionName: "Fixture University" }, positionTitle: "Lecturer", verificationStatuses: { position: status }, verificationRequests: [] };
    else if (path.endsWith("/verification-request") && route.request().method() === "POST") {
      submitted = route.request().postDataJSON(); status = "PENDING";
      data = { accepted: true, requestId, status: "PENDING", submissionKey: submitted.submissionKey, submittedAt: "2026-10-08T12:00:00Z" };
    } else if (path.includes("/notifications")) data = [];
    await route.fulfill({ json: { success: true, data } });
  });
  return { get submitted() { return submitted; }, get requests() { return requests; } };
}

for (const width of [1440, 320]) {
  test(`all five tracking states fit ${width}px in Vietnamese`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const status of Object.keys(labels) as Status[]) {
      await page.unrouteAll(); await fixture(page, status);
      await page.goto("/settings/verification/lecturer");
      await expect(page.getByRole("heading", { level: 1, name: labels[status] })).toBeVisible();
      await expect(page.getByRole("tab", { name: "Thông tin", exact: true })).toBeVisible();
      await expect.poll(() => page.getByRole("tablist").evaluate(list => {
        const bounds = list.getBoundingClientRect();
        const lastTab = list.lastElementChild?.getBoundingClientRect();
        return lastTab ? lastTab.right - bounds.right : 0;
      })).toBeLessThanOrEqual(0);
      if (status !== "NOT_SUBMITTED") await expect(page.getByText("Tài liệu không còn được lưu trữ.")).toBeVisible();
      if (status !== "NOT_SUBMITTED") await expect(page.getByRole("tab", { name: /Minh chứng/ })).toBeVisible();
      if (status === "PENDING") await expect(page.getByRole("list", { name: "Các bước xác minh" })).toContainText("Xét duyệt");
      if (status === "PENDING") await expect(page.getByRole("button", { name: "Bắt đầu xác minh" })).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: `artifacts/lecturer-verification-tabs/${status.toLowerCase()}-${width}.png`, fullPage: true });
    }
  });
}

test("supplement opens original context and returns to acknowledged PENDING", async ({ page }) => {
  const state = await fixture(page, "NEEDS_MORE_INFORMATION");
  await page.goto("/settings/verification/lecturer");
  await page.getByRole("button", { name: "Bổ sung minh chứng", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Vui lòng bổ sung minh chứng vị trí công tác hiện tại.");
  // Replace removed evidence with a current official source, through the actual form.
  await dialog.getByRole("button", { name: "Xóa minh chứng" }).last().click();
  await dialog.locator('#lecturer-primary-evidence').fill("https://university.edu/faculty");
  await dialog.getByRole("button", { name: "Gửi yêu cầu xác minh", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: labels.PENDING })).toBeVisible();
  expect(state.submitted?.supplementsRequestId).toBe(requestId);
  expect(state.submitted?.expectedReviewedAt).toBe("2026-10-08T11:00:00Z");
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: labels.PENDING })).toBeVisible();
});

test("a failed fetch is shown as a load error and never as UNVERIFIED", async ({ page }) => {
  await fixture(page, "NOT_SUBMITTED", true);
  await page.goto("/settings/verification/lecturer");
  await expect(page.getByRole("alert")).toContainText("Chưa tải được thông tin theo dõi", { timeout: 15000 });
  await expect(page.getByRole("heading", { name: labels.NOT_SUBMITTED })).toHaveCount(0);
});

test("information and history tabs work with the keyboard on a narrow dark screen", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 1000 });
  await fixture(page, "PENDING");
  await page.addInitScript(() => localStorage.setItem("theme", "dark"));
  await page.goto("/settings/verification/lecturer");
  const evidenceTab = page.getByRole("tab", { name: /Minh chứng/ });
  await expect(evidenceTab).toHaveAttribute("aria-selected", "true");
  await evidenceTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Thông tin", exact: true })).toBeFocused();
  const metadata = page.getByRole("tabpanel");
  await expect(metadata.getByText(requestId, { exact: true })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: /Lịch sử/ })).toBeFocused();
  await expect(page.getByRole("tabpanel").getByRole("link")).toHaveAttribute("href", `/settings/verification/lecturer?requestId=${requestId}&page=1`);
  await page.keyboard.press("Home");
  await expect(evidenceTab).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: "artifacts/lecturer-verification-tabs/pending-375-dark.png", fullPage: true });
});

for (const width of [1440, 375]) {
  test(`single uploaded document has readable hierarchy at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await fixture(page, "PENDING", false, true);
    await page.goto("/settings/verification/lecturer");
    await expect(page.getByText("Screenshot_2026-10-09_154745.png", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Xem minh chứng", exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `artifacts/lecturer-verification-tabs/single-file-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "Xem chi tiết yêu cầu", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Thông tin", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel").getByText(requestId, { exact: true })).toBeVisible();
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.screenshot({ path: `artifacts/lecturer-verification-tabs/information-${width}.png`, fullPage: true });
  });
}
