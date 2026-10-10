import { expect, test, type Page } from "@playwright/test";

const member = { id: "30000000-0000-4000-8000-000000000095", fullName: "Onboarding Fixture", email: "member@example.test", role: "user", systemRole: "USER", accountStatus: "ACTIVE", emailVerifiedAt: "2026-10-09T00:00:00Z", onboarding: { completed: false }, points: 0, capabilities: ["BASIC_RESEARCH"] };
const institution = { id: "20000000-0000-4000-8000-000000000095", name: "Đại học thử nghiệm", hostInstitution: false };
const program = { id: "10000000-0000-4000-8000-000000000095", name: "Software Engineering" };
async function selectArea(page: Page, name: string | RegExp) {
  const edit = page.locator("#edit-onboarding-fields");
  if (await edit.isVisible()) await edit.click();
  await page.locator("#area-search").click();
  await page.getByRole("option", { name, exact: typeof name === "string" }).click();
  await expect(page.getByRole("listbox")).toBeHidden();
}
async function focusSection(page: Page, section: "areas" | "interests" | "skills") {
  if (section === "areas") {
    const expanded = page.locator('.onboarding-optional-section button[aria-expanded="true"]');
    if (await expanded.count()) await expanded.click();
    const edit = page.locator("#edit-onboarding-fields");
    if (await edit.isVisible()) await edit.click();
    await page.locator("#onboarding-fields").scrollIntoViewIfNeeded();
    return;
  }
  const toggle = page.locator(`#optional-${section}`);
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  await expect(page.locator(`#optional-panel-${section}`)).toBeVisible();
  await expect(page.locator("#onboarding-fields")).toBeVisible();
  if (await page.locator("#onboarding-fields .onboarding-area-chip").count()) await expect(page.locator("#onboarding-field-choices")).toBeHidden();
}
async function addResearchItem(page: Page, id: string, value: string) {
  await page.locator(`#${id}-search`).fill(value);
  await page.locator(`#${id}-search`).locator("..").getByRole("button", { name: "Thêm", exact: true }).click();
}

// The deployed UI uses isolated responses; submitting never changes real accounts.
async function fixture(page: Page) {
  let submitted: Record<string, unknown> | undefined;
  let completed = false;
  await page.addInitScript(user => {
    localStorage.setItem("trend-auth", JSON.stringify({ version: 1, state: { user, tokens: { accessToken: "ui-fixture", refreshToken: "ui-fixture" } } }));
    localStorage.setItem("lumigap.uiLanguage", "vi");
  }, member);
  await page.route("**/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path.endsWith("/auth/academic-onboarding/options")) data = { institutions: [institution], programs: [program], researchAreas: ["Software Engineering", "Education", "Artificial Intelligence", "Data Science"], campuses: [] };
    else if (path.endsWith("/auth/me/academic-profile") && route.request().method() === "PATCH") {
      submitted = route.request().postDataJSON(); completed = true;
      data = { user: { ...member, onboarding: { completed: true }, academicRole: submitted!.academicRole } };
    } else if (path.endsWith("/auth/me")) data = { user: { ...member, onboarding: { completed } } };
    await route.fulfill({ json: { success: true, data } });
  });
  return { get submitted() { return submitted; } };
}

const scenarios = [
  { role: "STUDENT", detail: "Thông tin học tập", organization: "Bạn đang học tại trường nào?", focus: "Lĩnh vực muốn tìm hiểu", position: undefined },
  { role: "LECTURER", detail: "Thông tin giảng dạy", organization: "Bạn giảng dạy tại đơn vị nào?", focus: "Lĩnh vực giảng dạy và nghiên cứu", position: "Associate Professor" },
  { role: "RESEARCHER", detail: "Thông tin công tác nghiên cứu", organization: "Bạn nghiên cứu tại tổ chức nào?", focus: "Lĩnh vực nghiên cứu", position: "Research Fellow" },
];
for (const width of [1440, 375]) for (const scenario of scenarios) {
  test(`${scenario.role} collects relevant information at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); const api = await fixture(page);
    await page.goto("/onboarding/academic-profile");
    await expect(page.getByRole("heading", { name: "Chọn vai trò của bạn" })).toBeVisible();
    await expect(page.locator("#institution-search")).toHaveCount(0);
    await page.screenshot({ animations: "disabled", path: `artifacts/onboarding-role-collection/roles-${width}.png`, fullPage: true });
    await page.locator(`input[value="${scenario.role}"]`).check();
    await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
    await expect(page.getByRole("heading", { name: scenario.detail, exact: true })).toBeVisible();
    await expect(page.locator('label[for="institution-search"]')).toContainText(scenario.organization);
    await page.getByRole("button", { name: institution.name, exact: true }).click();
    if (scenario.role === "STUDENT") {
      await expect(page.locator("#current-position")).toHaveCount(0);
      await page.locator("#program-select").selectOption(program.id);
    } else {
      await expect(page.locator("#program-select")).toHaveCount(0);
      if (scenario.role === "LECTURER") {
        await expect(page.locator("#current-position")).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Tiếp tục", exact: true })).toBeEnabled();
        await page.screenshot({ animations: "disabled", path: `artifacts/onboarding-role-collection/LECTURER-default-details-${width}.png` });
        await page.getByRole("button", { name: "Bổ sung chức danh học thuật (không bắt buộc)", exact: true }).click();
        await expect(page.locator("#current-position option").filter({ hasText: /^Giảng viên$/ })).toHaveCount(0);
      }
      await page.locator("#current-position").selectOption(scenario.position!);
    }
    await page.reload();
    await expect(page.getByRole("heading", { name: scenario.detail, exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ animations: "disabled", path: `artifacts/onboarding-role-collection/${scenario.role}-details-${width}.png` });
    await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
    await expect(page.locator('label[for="area-search"]')).toContainText(scenario.focus);
    await expect(page.getByRole("listbox")).toBeHidden();
    await expect(page.locator("#area-limit")).toContainText("0/3");
    await expect(page.locator("#optional-interests")).toContainText("0/5");
    await expect(page.locator("#optional-skills")).toContainText("0/5");
    await selectArea(page, /^Kỹ (thuật|nghệ) phần mềm$/);
    await page.screenshot({ animations: "disabled", path: `artifacts/onboarding-role-collection/${scenario.role}-fields-${width}.png`, fullPage: true });
    await focusSection(page, "interests");
    const interestGroup = page.getByRole("group", { name: /Sở thích nghiên cứu/ });
    const recommended = interestGroup.getByLabel("Gợi ý phù hợp với lĩnh vực của bạn", { exact: true });
    await expect(recommended.getByRole("checkbox", { name: "Kiểm thử tự động", exact: true })).toBeVisible();
    await expect(recommended.getByRole("checkbox", { name: "Công nghệ giáo dục", exact: true })).toHaveCount(0);
    await interestGroup.getByRole("textbox", { name: "Tìm chủ đề", exact: true }).fill("giáo dục");
    await interestGroup.getByRole("textbox", { name: "Tìm chủ đề", exact: true }).press("Enter");
    expect(api.submitted).toBeUndefined();
    await page.getByRole("checkbox", { name: "Công nghệ giáo dục", exact: true }).check();
    await focusSection(page, "skills");
    await page.getByRole("checkbox", { name: "Phân tích dữ liệu", exact: true }).check();
    await page.locator("#research-skill-search").fill("Python");
    await page.getByRole("checkbox", { name: "Python", exact: true }).check();
    await page.getByRole("checkbox", { name: "Python", exact: true }).uncheck();
    await page.locator("#research-skill-search").fill("");
    await addResearchItem(page, "research-skill", "R");
    await page.reload();
    await expect(page.locator("#optional-skills")).toHaveAttribute("aria-expanded", "true");
    await focusSection(page, "interests");
    await expect(page.getByRole("checkbox", { name: "Công nghệ giáo dục", exact: true })).toBeChecked();
    await page.screenshot({ animations: "disabled", path: `artifacts/onboarding-role-collection/${scenario.role}-interests-${width}.png`, fullPage: true });
    await focusSection(page, "skills");
    await expect(page.getByRole("checkbox", { name: "Phân tích dữ liệu", exact: true })).toBeChecked();
    await page.locator("#research-skill-search").fill("Python");
    await expect(page.getByRole("checkbox", { name: "Python", exact: true })).not.toBeChecked();
    await page.locator("#research-skill-search").fill("");
    await expect(page.getByRole("checkbox", { name: "R", exact: true })).toBeChecked();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ animations: "disabled", path: `artifacts/onboarding-role-collection/${scenario.role}-focus-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "Hoàn tất thiết lập", exact: true }).click();
    await expect(page).toHaveURL(/\/home$/);
    expect(api.submitted).toMatchObject({ academicRole: scenario.role, institutionId: institution.id, researchAreas: ["Software Engineering"], researchInterests: ["Educational Technology"], skills: ["Data Analysis", "R"] });
    if (scenario.role === "STUDENT") { expect(api.submitted!.programId).toBe(program.id); expect(api.submitted).not.toHaveProperty("positionTitle"); }
    else { expect(api.submitted!.positionTitle).toBe(scenario.position); expect(api.submitted).not.toHaveProperty("programId"); }
  });
}
test("a lecturer can finish on mobile without selecting a title again", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 }); const api = await fixture(page);
  await page.goto("/onboarding/academic-profile");
  await page.locator('input[value="LECTURER"]').check();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await page.getByRole("button", { name: institution.name, exact: true }).click();
  await expect(page.locator("#current-position")).toHaveCount(0);
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await selectArea(page, /^Kỹ (thuật|nghệ) phần mềm$/);
  await page.getByRole("button", { name: "Hoàn tất thiết lập", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  expect(api.submitted).toMatchObject({ academicRole: "LECTURER", positionTitle: "Lecturer", institutionId: institution.id });
  expect(api.submitted).toMatchObject({ researchInterests: [], skills: [] });
});

for (const width of [1440, 375]) test(`caps optional topics and skills at five including custom values at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); const api = await fixture(page);
  await page.goto("/onboarding/academic-profile");
  await page.locator('input[value="LECTURER"]').check();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await page.getByRole("button", { name: institution.name, exact: true }).click();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await selectArea(page, /^Kỹ (thuật|nghệ) phần mềm$/);
  for (const { section, id, search } of [
    { section: "interests" as const, id: "research-interest", search: "Public Health" },
    { section: "skills" as const, id: "research-skill", search: "Security Testing" },
  ]) {
    await focusSection(page, section);
    const panel = page.locator(`#optional-panel-${section}`);
    for (let index = 0; index < 5; index++) await panel.getByRole("checkbox").nth(index).check();
    await expect(page.locator(`#optional-${section}`)).toContainText("5/5");
    await page.locator(`#${id}-search`).fill(search);
    await expect(panel.locator(".onboarding-suggestions").getByRole("checkbox")).toBeDisabled();
    await page.locator(`#${id}-search`).fill("A custom sixth item");
    await page.locator(`#${id}-search`).press("Enter");
    await expect(panel.getByRole("button", { name: "Thêm", exact: true })).toBeDisabled();
    await expect(page.locator(`#optional-${section}`)).toContainText("5/5");
    await panel.getByRole("checkbox", { checked: true }).first().click();
    await expect(page.locator(`#optional-${section}`)).toContainText("4/5");
    await page.locator(`#${id}-search`).fill(search);
    await expect(panel.locator(".onboarding-suggestions").getByRole("checkbox")).toBeEnabled();
    await panel.locator(".onboarding-suggestions").getByRole("checkbox").click();
    await expect(page.locator(`#optional-${section}`)).toContainText("5/5");
    await page.reload();
    await expect(page.locator(`#optional-${section}`)).toContainText("5/5");
    await expect(page.locator(`#optional-${section}`)).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(`#optional-panel-${section}`).getByRole("checkbox", { checked: true })).toHaveCount(5);
  }
  await page.screenshot({ animations: "disabled", path: `artifacts/onboarding-role-collection/optional-limit-${width}.png`, fullPage: true });
  await page.getByRole("button", { name: "Hoàn tất thiết lập", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  expect(api.submitted!.researchInterests).toHaveLength(5);
  expect(api.submitted!.skills).toHaveLength(5);
});

test("oversized legacy optional selections remain visible and must be reduced", async ({ page }) => {
  const api = await fixture(page);
  await page.addInitScript(({ id, institution }) => {
    const key = `lumigap.onboarding.v4.${id}`;
    if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, JSON.stringify({ step: 3, academicRole: "LECTURER", institutionId: institution.id, institutionName: institution.name, researchAreas: ["Education"], researchInterests: Array.from({ length: 6 }, (_, i) => `Topic ${i}`), skills: Array.from({ length: 6 }, (_, i) => `Skill ${i}`) }));
  }, { id: member.id, institution });
  await page.goto("/onboarding/academic-profile");
  const finish = page.getByRole("button", { name: "Hoàn tất thiết lập", exact: true });
  await expect(finish).toBeDisabled();
  await expect(page.locator("#optional-interests")).toContainText("6/5");
  await expect(page.locator("#optional-skills")).toContainText("6/5");
  for (const section of ["interests", "skills"] as const) {
    await focusSection(page, section);
    const selections = page.locator(`#optional-panel-${section}`).getByRole("checkbox", { checked: true });
    await expect(selections).toHaveCount(6);
    await selections.first().click();
    await expect(page.locator(`#optional-${section}`)).toContainText("5/5");
  }
  await expect(finish).toBeEnabled();
  await finish.click();
  await expect(page).toHaveURL(/\/home$/);
  expect(api.submitted!.researchInterests).toHaveLength(5);
  expect(api.submitted!.skills).toHaveLength(5);
});

for (const width of [1440, 375]) test(`limits onboarding to three fields at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); const api = await fixture(page);
  await page.goto("/onboarding/academic-profile");
  await page.locator('input[value="LECTURER"]').check();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await page.getByRole("button", { name: institution.name, exact: true }).click();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await expect(page.locator("#area-limit")).toContainText("0/3");
  await expect(page.locator("#onboarding-fields-label")).toContainText("Lĩnh vực");
  await expect(page.getByText(/Chọn từ 1 đến 3 lĩnh vực chính\./)).toBeVisible();
  await selectArea(page, /^Kỹ (thuật|nghệ) phần mềm$/);
  await selectArea(page, "Giáo dục");
  await selectArea(page, "Trí tuệ nhân tạo");
  await expect(page.locator("#area-limit")).toContainText("3/3");
  await page.locator("#area-search").click();
  await expect(page.getByRole("option", { name: "Khoa học dữ liệu", exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.locator("#area-limit")).toContainText("3/3");
  await page.getByRole("button", { name: /^Giáo dục\s*Xóa$/ }).click();
  await page.locator("#area-search").click();
  await expect(page.getByRole("option", { name: "Khoa học dữ liệu", exact: true })).toBeEnabled();
  await selectArea(page, "Khoa học dữ liệu");
  await page.locator("#area-limit").scrollIntoViewIfNeeded();
  await page.screenshot({ animations: "disabled", path: `artifacts/onboarding-role-collection/field-limit-${width}.png` });
  await page.getByRole("button", { name: "Hoàn tất thiết lập", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  expect(api.submitted).toMatchObject({ researchAreas: ["Software Engineering", "Artificial Intelligence", "Data Science"] });
});

test("changing fields keeps prior selections and updates recommendations on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 }); const api = await fixture(page);
  await page.goto("/onboarding/academic-profile");
  await page.locator('input[value="LECTURER"]').check();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await page.getByRole("button", { name: institution.name, exact: true }).click();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await selectArea(page, /^Kỹ (thuật|nghệ) phần mềm$/);
  await focusSection(page, "interests");
  await page.getByRole("checkbox", { name: "Kiểm thử tự động", exact: true }).check();
  await focusSection(page, "skills");
  await page.getByRole("checkbox", { name: "Python", exact: true }).check();
  await focusSection(page, "areas");
  await selectArea(page, "Giáo dục");
  await page.getByRole("button", { name: /^Kỹ (thuật|nghệ) phần mềm\s*Xóa$/ }).click();
  await focusSection(page, "interests");
  const recommended = page.getByRole("group", { name: /Sở thích nghiên cứu/ }).getByLabel("Gợi ý phù hợp với lĩnh vực của bạn", { exact: true });
  await expect(recommended.getByRole("checkbox", { name: "Công nghệ giáo dục", exact: true })).toBeVisible();
  await expect(recommended.getByRole("checkbox", { name: "Kiểm thử tự động", exact: true })).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "Kiểm thử tự động", exact: true })).toBeChecked();
  await focusSection(page, "skills");
  await addResearchItem(page, "research-skill", "__proto__");
  await expect(page.getByRole("checkbox", { name: "__proto__", exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Hoàn tất thiết lập", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  expect(api.submitted).toMatchObject({ researchAreas: ["Education"], researchInterests: ["Automated Testing"], skills: ["Python", "__proto__"] });
});

test("optional sections support keyboard access, reduced motion and dark mode", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 }); await fixture(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/onboarding/academic-profile");
  await page.locator('input[value="LECTURER"]').check();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Thông tin giảng dạy", exact: true })).toBeFocused();
  await page.getByRole("button", { name: institution.name, exact: true }).click();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await expect(page.getByRole("tab")).toHaveCount(0);
  await page.locator("#optional-interests").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#optional-panel-interests")).toBeVisible();
  await expect(page.locator("#onboarding-fields")).toBeVisible();
  await page.locator("#optional-skills").focus();
  await page.keyboard.press("Space");
  await expect(page.locator("#optional-panel-skills")).toBeVisible();
  await expect(page.locator("#optional-panel-interests")).toBeHidden();
  await expect(page.getByRole("button", { name: "Hoàn tất thiết lập", exact: true })).toBeDisabled();
  await expect.poll(() => page.locator(".onboarding-step-content").evaluate(el => getComputedStyle(el).animationName)).toBe("none");
  await page.keyboard.press("Space");
  await selectArea(page, /^Kỹ (thuật|nghệ) phần mềm$/);
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ animations: "disabled", path: "artifacts/onboarding-role-collection/dark-fields-tablet.png", fullPage: true });
});

for (const width of [320, 375]) test(`small screens keep actions inside the form at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 740 }); await fixture(page);
  await page.goto("/onboarding/academic-profile");
  await page.locator('input[value="LECTURER"]').check();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await page.getByRole("button", { name: institution.name, exact: true }).click();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await selectArea(page, /^Kỹ (thuật|nghệ) phần mềm$/);
  const footer = page.locator(".onboarding-form-footer");
  const button = page.getByRole("button", { name: "Hoàn tất thiết lập", exact: true });
  await button.scrollIntoViewIfNeeded();
  const footerBox = await footer.boundingBox(), actionBox = await button.boundingBox();
  const padding = await footer.evaluate(el => Number.parseFloat(getComputedStyle(el).paddingRight));
  expect(actionBox!.x + actionBox!.width).toBeLessThanOrEqual(footerBox!.x + footerBox!.width - padding + 1);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ animations: "disabled", path: `artifacts/onboarding-role-collection/small-fields-${width}.png`, fullPage: true });
});

test("long field names wrap and remain searchable in Vietnamese and English", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 }); await fixture(page);
  await page.route("**/auth/academic-onboarding/options**", route => route.fulfill({ json: { success: true, data: {
    institutions: [institution], programs: [], campuses: [], researchAreas: ["Biochemistry, Genetics and Molecular Biology", "Pharmacology, Toxicology and Pharmaceutics", "Education"],
  } } }));
  await page.goto("/onboarding/academic-profile");
  await page.locator('input[value="LECTURER"]').check();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await page.getByRole("button", { name: institution.name, exact: true }).click();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await page.locator("#area-search").fill("Biochemistry");
  await selectArea(page, "Hóa sinh, di truyền và sinh học phân tử");
  await expect(page.locator(".onboarding-area-chip")).toContainText("Hóa sinh, di truyền và sinh học phân tử");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ animations: "disabled", path: "artifacts/onboarding-role-collection/long-taxonomy-mobile.png", fullPage: true });
});

for (const width of [1440, 375]) test(`field dropdown requires an explicit choice, supports keyboard and closes outside at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); const api = await fixture(page);
  await page.goto("/onboarding/academic-profile");
  await page.locator('input[value="LECTURER"]').check();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await page.getByRole("button", { name: institution.name, exact: true }).click();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  const input = page.locator("#area-search");
  await expect(input).toHaveAttribute("aria-expanded", "false");
  await input.focus(); await input.press("Enter");
  await expect(page.locator("#area-limit")).toContainText("0/3");
  await input.click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await input.press("Enter");
  await expect(page.locator("#area-limit")).toContainText("0/3");
  await expect(page.getByRole('option', { selected: true })).toHaveCount(0);
  await page.screenshot({ animations: "disabled", path: `artifacts/onboarding-role-collection/field-dropdown-${width}.png`, fullPage: true });
  await input.press("Escape");
  await expect(page.getByRole("listbox")).toBeHidden();
  await input.press("ArrowDown"); await input.press("Enter");
  await expect(page.locator("#area-limit")).toContainText("1/3");
  await expect(page.getByRole("listbox")).toBeHidden();
  await input.click();
  await page.getByRole("heading", { name: "Giảng dạy và nghiên cứu", exact: true }).click();
  await expect(page.getByRole("listbox")).toBeHidden();
  await expect(page.locator("#optional-skills")).toContainText("0/5");
  await page.getByRole("button", { name: "Hoàn tất thiết lập", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  expect(api.submitted).toMatchObject({ researchAreas: ["Software Engineering"], researchInterests: [], skills: [] });
});

for (const width of [1440, 375]) test(`selected research choices appear once and stay compact at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); await fixture(page);
  await page.addInitScript(({ id, institution }) => {
    const key = `lumigap.onboarding.v4.${id}`;
    if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, JSON.stringify({ step: 3, expandedFocus: "skills", academicRole: "LECTURER", institutionId: institution.id, institutionName: institution.name, researchAreas: ["Artificial Intelligence"], researchInterests: ["Natural Language Processing", "Computer Vision", "Responsible AI", "Systematic Review"], skills: ["Systematic Review", "Evidence Extraction", "Experimental Design", "Literature Screening"] }));
  }, { id: member.id, institution });
  await page.goto("/onboarding/academic-profile");
  const panel = page.locator("#optional-panel-skills");
  await expect(panel).toBeVisible();
  await expect(page.locator("#optional-skills")).toContainText("4/5");
  await expect(panel.getByRole("checkbox", { checked: true })).toHaveCount(4);
  await expect(panel.getByRole("checkbox", { name: "Tổng quan hệ thống", exact: true })).toHaveCount(1);
  await expect(panel.locator(".onboarding-suggestions").getByRole("checkbox", { checked: true })).toHaveCount(0);
  expect(await panel.locator(".onboarding-suggestions").getByRole("checkbox").count()).toBeLessThanOrEqual(6);
  await expect(panel.getByRole("textbox")).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ animations: "disabled", path: `artifacts/onboarding-role-collection/compact-research-${width}.png`, fullPage: true });
  await panel.getByRole("checkbox", { name: "Tổng quan hệ thống", exact: true }).focus();
  await page.keyboard.press("Space");
  await expect(page.locator("#optional-skills")).toContainText("3/5");
  await expect(page.locator("#research-skill-search")).toBeFocused();
  await page.reload();
  await expect(page.locator("#optional-skills")).toContainText("3/5");
});

test("old choices stay empty after Next and reload without a recovery prompt", async ({ page }) => {
  const api = await fixture(page);
  await page.addInitScript(({ userId, institution }) => {
    const key = `lumigap.onboarding.v3.${userId}`;
    if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, JSON.stringify({ step: 2, academicRole: "LECTURER", institutionId: institution.id, institutionName: institution.name, researchAreas: ["Software Engineering"], skills: ["Data Analysis", "Python", "R", "Academic Writing"] }));
  }, { userId: member.id, institution });
  await page.goto("/onboarding/academic-profile");
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await expect(page.locator("#area-limit")).toContainText("0/3");
  await expect(page.locator("#optional-skills")).toContainText("0/5");
  await expect(page.getByText("Có lựa chọn từ lần thiết lập trước", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Khôi phục lựa chọn cũ", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Bỏ lựa chọn cũ", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Hoàn tất thiết lập", exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.locator("#optional-skills")).toContainText("0/5");
  await expect(page.locator("#area-limit")).toContainText("0/3");
  await expect(page.locator("#optional-skills")).toContainText("0/5");
  await expect(page.getByText("Có lựa chọn từ lần thiết lập trước", { exact: true })).toHaveCount(0);
  await selectArea(page, "Giáo dục");
  await page.getByRole("button", { name: "Hoàn tất thiết lập", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  expect(api.submitted).toMatchObject({ researchAreas: ["Education"], researchInterests: [], skills: [] });
});
