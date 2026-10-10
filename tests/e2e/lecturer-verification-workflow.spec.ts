import { expect, test, type Page } from "@playwright/test";

// Isolated API fixtures; no real review decision or email is sent by these checks.
const admin = { id: "30000000-0000-4000-8000-000000000090", fullName: "Admin UI Fixture", email: "admin@example.test", role: "admin", systemRole: "ADMIN", accountStatus: "ACTIVE", emailVerifiedAt: "2026-10-09T00:00:00Z", onboarding: { completed: true }, points: 0, capabilities: ["BASIC_RESEARCH"] };
const requestId = "10000000-0000-4000-8000-000000000090";
async function fixture(page: Page) {
  let decision: Record<string, unknown> | undefined;
  const request = { id: requestId, type: "POSITION", targetValue: "Lecturer", evidenceType: "DOCUMENT", status: "PENDING", submittedAt: "2026-10-09T07:57:14Z", verificationMethod: "INSTITUTIONAL_EMAIL_AND_PROFILE", metadata: { academicRole: "LECTURER", claimedName: "Giảng viên thử nghiệm", institutionName: "Đại học FPT", institutionalEmail: "lecturer@university.edu", identitySource: "ACCOUNT" }, sources: [
    { id: "20000000-0000-4000-8000-000000000091", slot: 0, type: "INSTITUTIONAL_EMAIL", sourceKind: "EMAIL", reference: "lecturer@university.edu", status: "UNCHECKED", documentAvailable: false },
    { id: "20000000-0000-4000-8000-000000000092", slot: 1, type: "STAFF_ID", sourceKind: "DOCUMENT", fileName: "lecturer-appointment.png", mimeType: "image/png", status: "UNCHECKED", documentAvailable: true },
  ] };
  const profile = { userId: "30000000-0000-4000-8000-000000000091", displayName: "Giảng viên thử nghiệm", academicRole: "LECTURER", positionTitle: "Lecturer", affiliation: { institutionName: "Đại học FPT", institutionalEmail: "lecturer@university.edu" }, verificationStatus: "PENDING", verificationStatuses: { identity: "VERIFIED", email: "VERIFIED", affiliation: "VERIFIED", position: "PENDING", orcid: "NOT_SUBMITTED" }, academicIdentityLinks: [] };
  const item = { request, profile, history: [request], accountEmail: "lecturer@university.edu", accountEmailVerified: true };
  await page.addInitScript(user => {
    localStorage.setItem("trend-auth", JSON.stringify({ version: 1, state: { user, tokens: { accessToken: "ui-fixture", refreshToken: "ui-fixture" } } }));
    localStorage.setItem("lumigap.uiLanguage", "vi"); localStorage.setItem("theme", "light");
  }, admin);
  await page.route("**/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith(`/admin/academic-verifications/${requestId}`) && route.request().method() !== "GET") {
      decision = route.request().postDataJSON();
      request.status = decision?.decision === "approve" ? "VERIFIED" : decision?.decision === "more_info" ? "NEEDS_MORE_INFORMATION" : "REJECTED";
      return route.fulfill({ json: { success: true, data: profile } });
    }
    const data = path.endsWith("/auth/me") ? { user: admin } : path.endsWith("/admin/academic-verifications") ? [item] : path.includes("/admin/academic-verifications/") ? item : [];
    await route.fulfill({ json: { success: true, data, meta: { total: 1, page: 1, totalPages: 1 } } });
  });
  return { get decision() { return decision; } };
}

for (const [mode, width] of [["more_info", 1440], ["reject", 375]] as const) {
  test(`${mode} at ${width}px explains consequences and requires public feedback`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 }); const state = await fixture(page);
    await page.goto(`/admin/academic-verifications?requestId=${requestId}`);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("tab", { name: /Quyết định/ }).click();
    await dialog.locator("button[aria-pressed]").nth(mode === "more_info" ? 1 : 2).click();
    const submit = dialog.getByRole("button", { name: mode === "more_info" ? /Request more information|Yêu cầu.*thông tin|Yêu cầu.*bổ sung/i : /Reject position request|Từ chối xác minh vị trí/i }).last();
    await expect(submit).toBeDisabled();
    const feedback = dialog.locator("#verification-rejection-reason");
    await feedback.fill("?"); await expect(submit).toBeDisabled();
    const reason = mode === "more_info" ? "Vui lòng bổ sung quyết định bổ nhiệm còn hiệu lực tại đơn vị." : "Minh chứng hiện tại không xác nhận vị trí giảng viên đã khai báo.";
    await feedback.fill(reason);
    await dialog.locator("#verification-admin-note").fill("PRIVATE REVIEW NOTE");
    await expect(dialog).toContainText("Người gửi sẽ thấy nội dung này trong hồ sơ xác minh và email.");
    await expect.poll(() => dialog.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await submit.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `artifacts/lecturer-workflow/${mode}-${width}.png` });
    await submit.click();
    await expect(dialog).toHaveCount(0);
    expect(state.decision).toMatchObject({ decision: mode, reason, note: "PRIVATE REVIEW NOTE" });
    expect(new URL(page.url()).searchParams.has("requestId")).toBe(false);
  });
}

test("approval requires source assessments and the complete Lecturer checklist", async ({ page }) => {
  const state = await fixture(page);
  await page.goto(`/admin/academic-verifications?requestId=${requestId}`);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: /Quyết định/ }).click();
  const approve = dialog.getByRole("button", { name: /Approve position|Xác minh vị trí học thuật/i });
  await expect(approve).toBeDisabled();
  await dialog.getByRole("tab", { name: "Yêu cầu & Minh chứng", exact: true }).click();
  const assessments = dialog.locator('select:has(option[value="VALID"])');
  await expect(assessments).toHaveCount(2);
  for (let index = 0; index < 2; index++) await assessments.nth(index).selectOption("VALID");
  await dialog.getByRole("tab", { name: /Quyết định/ }).click();
  const checklist = dialog.getByRole("checkbox");
  for (let index = 0; index < await checklist.count(); index++) await checklist.nth(index).check();
  await expect(approve).toBeEnabled();
  await approve.click(); await expect(dialog).toHaveCount(0);
  expect(state.decision).toMatchObject({ decision: "approve", checklist: { identityMatches: true, identityBound: true, currentPositionConfirmed: true }, evidenceChecks: [{ status: "VALID" }, { status: "VALID" }] });
});
