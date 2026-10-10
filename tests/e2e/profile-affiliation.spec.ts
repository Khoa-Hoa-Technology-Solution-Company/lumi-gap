import { expect, test, type Page } from "@playwright/test";

const institutionId = "20000000-0000-4000-8000-000000000021";
const user = {
  id: "30000000-0000-4000-8000-000000000021", fullName: "Nguyễn Đình Thanh",
  email: "lecturer@fpt.edu.vn", role: "user", systemRole: "USER", accountStatus: "ACTIVE",
  academicProfileType: "lecturer", emailVerifiedAt: "2026-10-08T10:00:00Z",
  onboarding: { completed: true }, points: 0, capabilities: ["BASIC_RESEARCH"],
};

async function fixture(page: Page, positionStatus = "PENDING", dark = false) {
  await page.addInitScript(({ authUser, isDark }) => {
    localStorage.setItem("trend-auth", JSON.stringify({ version: 1, state: { user: authUser, tokens: { accessToken: "ui-fixture", refreshToken: "ui-fixture" } } }));
    localStorage.setItem("lumigap.uiLanguage", "vi");
    localStorage.setItem("theme", isDark ? "dark" : "light");
  }, { authUser: user, isDark: dark });
  const profile = {
    id: "profile-fixture", userId: user.id, displayName: user.fullName, points: 0,
    academicRole: "LECTURER", academicType: "lecturer", primaryPosition: "LECTURER",
    positionCategory: "LECTURER", positionSource: "PREDEFINED", positionTitle: "Senior Lecturer",
    affiliation: { institutionId, institutionName: "FPT University", hostInstitution: true, isCurrent: true, affiliationVerificationStatus: "VERIFIED" },
    affiliationHistory: [], profileVisibility: "PUBLIC", discoverability: { allowCollaborationRequests: true, showInResearcherSearch: true },
    researchInterests: [], expertiseAreas: ["Software Engineering"], skills: [], researchKeywords: [],
    academicIdentityLinks: [], externalIdentities: [], featuredWorks: [],
    supportAvailability: { enabled: false, types: [], preferredTopics: [] },
    reviewAvailability: { enabled: false, types: [], preferredTopics: [] },
    verificationStatus: "SELF_DECLARED", academicRoleVerificationStatus: "SELF_DECLARED", verification: { status: "SELF_DECLARED" },
    verificationStatuses: { affiliation: "VERIFIED", position: positionStatus }, verificationEvidence: [],
    verificationRequests: [
      { id: "affiliation-request", type: "AFFILIATION", status: "VERIFIED", submittedAt: "2026-10-09T09:37:46Z" },
      ...(positionStatus === "PENDING" ? [{ id: "position-request", type: "POSITION", status: "PENDING", submittedAt: "2026-10-09T10:00:00Z" }] : []),
    ],
    profileHistory: [], privacy: { expertise: "PUBLIC", researchInterests: "PUBLIC", orcid: "PUBLIC" },
    createdAt: "2026-10-01", updatedAt: "2026-10-09",
  };
  await page.route("**/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname;
    // All writes are blocked: visual checks must never affect a real account.
    if (route.request().method() !== "GET") return route.fulfill({ status: 405, json: { success: false } });
    let data: unknown = [];
    if (path.endsWith("/auth/me")) data = { user };
    else if (path.endsWith("/academic-profiles/me")) data = profile;
    else if (path.endsWith("/auth/academic-onboarding/options")) data = { institutions: [{ id: institutionId, name: "FPT University", hostInstitution: true }], hostInstitution: { id: institutionId, name: "FPT University", hostInstitution: true }, researchAreas: [], programs: [] };
    else if (path.endsWith("/institutional-email/status")) data = { verified: true, accountEmailVerified: true, email: user.email, institutionId, source: "ACCOUNT", officialDomains: ["fpt.edu.vn"], approvedEmailDomains: [{ domain: "fpt.edu.vn", allowSubdomains: false }] };
    await route.fulfill({ json: { success: true, data } });
  });
}

for (const { width, dark } of [{ width: 1440, dark: false }, { width: 375, dark: false }, { width: 320, dark: true }]) {
  test(`affiliation states stay distinct and fit ${width}px ${dark ? "dark" : "light"}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1400 });
    await fixture(page, "PENDING", dark);
    await page.goto("/profile?tab=affiliation");
    const section = page.getByRole("heading", { name: "Vị trí học thuật và xác minh", exact: true }).locator("xpath=ancestor::section[1]");
    await expect(section.getByText("Giảng viên chính", { exact: true })).toBeVisible();
    const email = section.getByRole("region", { name: "Quyền sở hữu email tài khoản" });
    const membership = section.getByRole("region", { name: "Tư cách thành viên FPT Education" });
    const position = section.getByRole("region", { name: "Trạng thái giảng viên" });
    await expect(email.getByRole("status")).toHaveText("Đã xác minh");
    await expect(membership.getByRole("status")).toHaveText("Đã xác minh");
    await expect(position.getByRole("status")).toHaveText("Đang chờ xác minh");
    await expect(position.getByRole("link", { name: "Theo dõi xác minh giảng viên" })).toHaveAttribute("href", "/settings/verification/lecturer");
    await expect(section.getByRole("button", { name: "Xác minh tư cách giảng viên", exact: true })).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    const bounds = await position.evaluate(element => {
      const row = element.getBoundingClientRect();
      const link = element.querySelector("a")!.getBoundingClientRect();
      return { rowRight: row.right, linkRight: link.right };
    });
    expect(bounds.linkRight).toBeLessThanOrEqual(bounds.rowRight + 1);
    await section.evaluate(element => element.scrollIntoView({ block: "start", behavior: "instant" }));
    await page.evaluate(() => window.scrollBy(0, -110));
    await section.screenshot({ path: `artifacts/profile-affiliation/affiliation-${width}${dark ? "-dark" : ""}.png` });
  });
}

test("first position verification opens as a popup and keeps the affiliation route", async ({ page }) => {
  await fixture(page, "NOT_SUBMITTED");
  await page.goto("/profile?tab=affiliation");
  const position = page.getByRole("region", { name: "Trạng thái giảng viên" });
  await position.getByRole("button", { name: "Xác minh tư cách giảng viên", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page).toHaveURL(/\/profile\?tab=affiliation$/);
  await page.getByRole("dialog").getByRole("button", { name: "Hủy", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/\/profile\?tab=affiliation$/);
});
