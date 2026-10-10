import { expect, test, type Page } from "@playwright/test";

// Isolated API fixtures exercise the deployed UI without changing real review decisions.
const admin = { id: "30000000-0000-4000-8000-000000000090", fullName: "Admin UI Fixture", email: "admin@example.test", role: "admin", systemRole: "ADMIN", accountStatus: "ACTIVE", emailVerifiedAt: "2026-10-09T00:00:00Z", onboarding: { completed: true }, points: 0, capabilities: ["BASIC_RESEARCH"] };
const request = { id: "10000000-0000-4000-8000-000000000090", type: "POSITION", targetValue: "Phó giáo sư", evidenceType: "DOCUMENT", status: "PENDING", submittedAt: "2026-10-09T07:57:14Z", verificationMethod: "INSTITUTIONAL_EMAIL_AND_PROFILE", metadata: { academicRole: "LECTURER", claimedName: "Giảng viên thử nghiệm", institutionName: "Đại học FPT", institutionalEmail: "lecturer@university.edu", identitySource: "ACCOUNT" }, sources: [
  { id: "email", slot: 0, type: "INSTITUTIONAL_EMAIL", sourceKind: "URL", reference: "lecturer@university.edu", status: "UNCHECKED", documentAvailable: false },
  { id: "document", slot: 1, type: "STAFF_ID", sourceKind: "DOCUMENT", fileName: "screencapture-university-faculty-appointment-and-current-position-evidence-2026-10-09-14-44-40.png", mimeType: "image/png", status: "UNCHECKED", documentAvailable: true },
] };
const profile = { userId: "30000000-0000-4000-8000-000000000091", displayName: "Giảng viên thử nghiệm", academicRole: "LECTURER", positionTitle: "Phó giáo sư", affiliation: { institutionName: "Đại học FPT", institutionalEmail: "lecturer@university.edu" }, verificationStatus: "PENDING", verificationStatuses: { identity: "VERIFIED", email: "VERIFIED", affiliation: "VERIFIED", position: "PENDING", orcid: "NOT_SUBMITTED" }, academicIdentityLinks: [] };
async function fixture(page: Page) {
  await page.addInitScript(user => {
    localStorage.setItem("trend-auth", JSON.stringify({ version: 1, state: { user, tokens: { accessToken: "ui-fixture", refreshToken: "ui-fixture" } } }));
    localStorage.setItem("lumigap.uiLanguage", "vi");
  }, admin);
  const item = { request, profile, history: [{ ...request, id: "previous-request", status: "REJECTED", submittedAt: "2026-10-01T00:00:00Z", reviewedAt: "2026-10-02T00:00:00Z", rejectionReason: "Cần tài liệu xác nhận vị trí hiện tại." }, request], accountEmail: "lecturer@university.edu", accountEmailVerified: true };
  await page.route("**/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const data = path.endsWith("/auth/me") ? { user: admin } : path.endsWith("/admin/academic-verifications") ? [item] : path.includes("/admin/academic-verifications/") ? item : [];
    await route.fulfill({ json: { success: true, data, meta: { total: 1, page: 1, totalPages: 1, statusCounts: { ALL: 1, PENDING: 1 } } } });
  });
}
for (const width of [1440, 375]) {
  test(`verification sections are usable at ${width}px`, async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: 900 }); await fixture(page);
    await page.goto("/admin/academic-verifications");
    await page.waitForSelector("tbody tr");
    if (width === 1440) {
      await page.screenshot({ path: "artifacts/admin-verification-tabs/main-table-unified.png" });
    }
    await page.locator("tbody tr").first().locator("button").first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("tab", { name: "Yêu cầu cần duyệt" })).toHaveAttribute("aria-selected", "true");
    await expect(dialog.getByRole("tabpanel")).not.toContainText("lecturer@university.edu");
    for (const [tab, name] of [["request", "Yêu cầu cần duyệt"], ["evidence", "Minh chứng"], ["identity", "Tài khoản & tư cách"], ["history", "Lịch sử xác minh"]]) {
      await dialog.getByRole("tab", { name, exact: true }).click();
      await expect(dialog.getByRole("tab", { name, exact: true })).toHaveAttribute("aria-selected", "true");
      await expect(dialog.getByRole("tabpanel")).toBeVisible();
      await expect.poll(() => dialog.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: `artifacts/admin-verification-tabs/${tab}-${width}.png` });
    }
    await dialog.getByRole("button", { name: "Xét duyệt yêu cầu", exact: true }).click();
    await expect(dialog.getByRole("tab", { name: "Quyết định" })).toHaveAttribute("aria-selected", "true");
    await expect(dialog.getByRole("tab", { name: "Quyết định", exact: true })).toBeVisible();
    await dialog.getByRole("tab", { name: "Minh chứng", exact: true }).click();
    await expect(dialog.getByRole("tabpanel")).toContainText(request.sources[1]!.fileName!);
    await expect.poll(() => dialog.getByRole("tabpanel").evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `artifacts/admin-verification-tabs/review-evidence-${width}.png` });
    await dialog.getByRole("tab", { name: "Quyết định", exact: true }).click();
    await expect(dialog.locator("#verification-admin-note")).toBeVisible();
    await page.screenshot({ path: `artifacts/admin-verification-tabs/decision-${width}.png` });
  });
}
