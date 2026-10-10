// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AcademicProfileOnboardingPage } from "@/pages/academic-profile-onboarding";

const mocks = vi.hoisted(() => ({ user: { id: "member", systemRole: "USER", emailVerifiedAt: "2026-10-01", onboarding: { completed: false } }, save: vi.fn() }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }), LanguageSwitcher: () => null }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (selector: (value: unknown) => unknown) => selector({ user: mocks.user, tokens: { accessToken: "token" } }) }));
vi.mock("@/features/auth", async () => {
  const { requiresAcademicProfile } = await import("./academic-profile");
  const { resolvePostAuthPath } = await import("./post-auth-redirect");
  return { useCurrentUser: () => ({ data: { user: mocks.user } }), requiresAcademicProfile, resolvePostAuthPath, useLogout: () => ({ mutate: vi.fn() }), useUpdateAcademicProfile: () => ({ mutateAsync: mocks.save }) };
});
vi.mock("@/features/auth/api/auth.api", () => ({ authApi: { academicOnboardingOptions: async () => ({ institutions: [{ id: "11111111-1111-4111-8111-111111111111", name: "University of Melbourne", hostInstitution: false }], programs: [], researchAreas: ["Software Engineering", "Education", "Artificial Intelligence", "Data Science"] }) } }));
let root: Root, container: HTMLDivElement, client: QueryClient;
async function render(returnTo?: string) {
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[{ pathname: "/onboarding/academic-profile", state: { from: returnTo } }]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes><Route path="/onboarding/academic-profile" element={<AcademicProfileOnboardingPage />} /><Route path="/home" element={<p>Home reached</p>} /><Route path="/verify-email" element={<p>Email ownership required</p>} /><Route path="/invitations/example" element={<p>Invitation reached</p>} /></Routes></MemoryRouter></QueryClientProvider>));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
}
async function click(text: string) {
  let button = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(item => item.textContent === text);
  if (!button && container.querySelector("#area-search")) await vi.waitFor(async () => {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    button = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(item => item.textContent === text);
    expect(button, `button ${text}`).toBeDefined();
  });
  expect(button, `button ${text}`).toBeDefined();
  if (button!.getAttribute("role") === "option") await act(async () => container.querySelector<HTMLInputElement>("#area-search")!.click());
  await act(async () => button!.click());
}
async function input(id: string, value: string) {
  const element = container.querySelector<HTMLInputElement>(`#${id}`)!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); });
}
async function identity(role: string) {
  const radio = container.querySelector<HTMLInputElement>(`input[value="${role}"]`)!;
  await act(async () => radio.click());
  await click("Continue");
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  await click("University of Melbourne");
}
async function tick(group: string, value: string) {
  const section = group === "research-interest" ? "interests" : "skills";
  const toggle = container.querySelector<HTMLButtonElement>(`#optional-${section}`)!;
  if (toggle.getAttribute("aria-expanded") !== "true") await act(async () => toggle.click());
  let checkbox = container.querySelector<HTMLInputElement>(`input[name="${group}"][value="${value}"]`);
  if (!checkbox) { await input(`${group}-search`, value); checkbox = container.querySelector<HTMLInputElement>(`input[name="${group}"][value="${value}"]`); }
  expect(checkbox).not.toBeNull();
  await act(async () => checkbox!.click());
  await input(`${group}-search`, "");
}
async function addResearchItem(group: string, value: string) {
  await input(`${group}-search`, value);
  const field = container.querySelector(`#${group}-search`)!.closest("fieldset")!;
  const add = [...field.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Add")!;
  await act(async () => add.click());
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.clearAllMocks(); sessionStorage.clear(); mocks.user.emailVerifiedAt = "2026-10-01";
  mocks.save.mockResolvedValue({ user: { ...mocks.user, onboarding: { completed: true } } });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); vi.unstubAllGlobals(); });
describe("progressive academic onboarding", () => {
  it("starts research selections empty and opens the fields only on interaction", async () => {
    await render(); await identity("LECTURER"); await click("Continue");
    const search = container.querySelector<HTMLInputElement>("#area-search")!;
    expect(search.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector<HTMLElement>('[role="listbox"]')!.hidden).toBe(true);
    const selections = () => JSON.parse(sessionStorage.getItem("lumigap.onboarding.v4.member")!);
    expect(selections()).toMatchObject({ researchAreas: [], researchInterests: [], skills: [] });
    await act(async () => search.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(selections().researchAreas).toEqual([]); expect(mocks.save).not.toHaveBeenCalled();
    await act(async () => search.click());
    expect(search.getAttribute("aria-expanded")).toBe("true");
    await act(async () => search.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(selections().researchAreas).toEqual([]);
    await act(async () => search.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    await act(async () => search.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(selections()).toMatchObject({ researchAreas: ["Software Engineering"], researchInterests: [], skills: [] });
    expect(search.getAttribute("aria-expanded")).toBe("false");
  });
  it.each(["v2", "v3"] as const)("starts %s research selections empty without a recovery prompt", async version => {
    sessionStorage.setItem(`lumigap.onboarding.${version}.member`, JSON.stringify({ step: 3, expandedFocus: "skills", academicRole: "LECTURER", institutionId: "11111111-1111-4111-8111-111111111111", institutionName: "University of Melbourne", researchAreas: ["Software Engineering"], researchInterests: ["Automated Testing"], skills: ["Data Analysis", "Python", "R", "Academic Writing"] }));
    await render();
    expect(container.querySelector("#area-limit")!.textContent).toContain("0/3");
    expect(container.querySelector("#optional-skills")!.textContent).toContain("0/5");
    expect(container.textContent).not.toContain("Saved choices from an earlier setup");
    expect(container.textContent).not.toContain("Restore previous choices");
    expect(container.textContent).not.toContain("Start with empty selections");
    await act(async () => root.unmount()); root = createRoot(container); await render();
    expect(container.querySelector("#area-limit")!.textContent).toContain("0/3");
    expect(container.querySelector("#optional-skills")!.textContent).toContain("0/5");
    expect(container.textContent).not.toContain("Saved choices from an earlier setup");
    await click("Education");
    await click("Complete onboarding");
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ researchAreas: ["Education"], researchInterests: [], skills: [] }));
    expect(sessionStorage.getItem(`lumigap.onboarding.${version}.member`)).toBeNull();
  });
  it("clears prior research choices when the applicant switches academic roles", async () => {
    await render(); await identity("LECTURER"); await click("Continue"); await click("Education"); await tick("research-skill", "Data Analysis");
    await click("Back"); await click("Back");
    await act(async () => container.querySelector<HTMLInputElement>('input[value="RESEARCHER"]')!.click());
    expect(JSON.parse(sessionStorage.getItem("lumigap.onboarding.v4.member")!)).toMatchObject({ researchAreas: [], researchInterests: [], skills: [] });
  });
  it("keeps required fields visible while optional sections open one at a time and restore after refresh", async () => {
    await render(); await identity("LECTURER"); await click("Continue");
    expect(container.querySelector('[role="tab"]')).toBeNull();
    expect(container.querySelector<HTMLElement>("#optional-panel-interests")!.hidden).toBe(true);
    await tick("research-interest", "Systematic Review");
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
    await act(async () => root.unmount()); root = createRoot(container); await render();
    expect(container.querySelector("#optional-interests")!.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector<HTMLInputElement>('input[value="Systematic Review"][name="research-interest"]')!.checked).toBe(true);
    await act(async () => container.querySelector<HTMLButtonElement>("#optional-skills")!.click());
    expect(container.querySelector<HTMLElement>("#optional-panel-interests")!.hidden).toBe(true);
    expect(container.querySelector<HTMLElement>("#onboarding-fields")!.hidden).toBe(false);
    await click("Education"); await click("Complete onboarding");
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ researchAreas: ["Education"], researchInterests: ["Systematic Review"] }));
  });
  it("caps fields at three and lets the member replace a selected field", async () => {
    await render(); await identity("LECTURER"); await click("Continue");
    await click("Software Engineering"); await click("Education"); await click("Artificial Intelligence");
    const remaining = () => [...container.querySelectorAll("button")].find(button => button.textContent === "Data Science")!;
    await vi.waitFor(() => expect(remaining()?.disabled).toBe(true));
    expect(container.querySelector("#area-limit")!.textContent).toContain("3/3");
    await click("Data Science");
    expect(JSON.parse(sessionStorage.getItem("lumigap.onboarding.v4.member")!).researchAreas).toHaveLength(3);
    await click("EducationRemove");
    await vi.waitFor(async () => {
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
      expect(remaining()?.disabled).toBe(false);
    });
    await click("Data Science"); await click("Complete onboarding");
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ researchAreas: ["Software Engineering", "Artificial Intelligence", "Data Science"] }));
  });
  it("keeps oversized old drafts visible and requires reducing them before saving", async () => {
    sessionStorage.setItem("lumigap.onboarding.v4.member", JSON.stringify({ step: 3, academicRole: "LECTURER", institutionId: "11111111-1111-4111-8111-111111111111", institutionName: "University of Melbourne", researchAreas: ["Software Engineering", "Education", "Artificial Intelligence", "Data Science"] }));
    await render();
    expect(container.querySelector("#area-limit")!.textContent).toContain("4/3");
    expect([...container.querySelectorAll("button")].find(button => button.textContent === "Complete onboarding")!.disabled).toBe(true);
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(mocks.save).not.toHaveBeenCalled();
    expect(JSON.parse(sessionStorage.getItem("lumigap.onboarding.v4.member")!).researchAreas).toHaveLength(4);
    await click("EducationRemove"); await click("Complete onboarding");
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ researchAreas: ["Software Engineering", "Artificial Intelligence", "Data Science"] }));
  });
  it("updates suggestions with fields and keeps freely selected interests and skills", async () => {
    await render(); await identity("LECTURER"); await click("Continue"); await click("Education");
    const interestGroup = () => container.querySelector<HTMLInputElement>("#research-interest-search")!.closest("fieldset")!;
    const recommended = () => interestGroup().querySelector('[aria-label="Suggested for your fields"]')!;
    expect(recommended().textContent).toContain("Educational Technology");
    expect(recommended().textContent).not.toContain("Automated Testing");
    await tick("research-interest", "Educational Technology");
    await tick("research-skill", "Survey Design");
    await tick("research-interest", "LLM for Software Engineering");
    const skillGroup = container.querySelector<HTMLInputElement>("#research-skill-search")!.closest("fieldset")!;
    await click("Show more suggestions");
    expect(skillGroup.querySelector('[aria-label="Suggested for your fields"]')!.textContent).toContain("Machine Learning");
    // Removing the area updates recommendations while preserving the member's choices.
    await click("EducationRemove"); await click("Software Engineering");
    expect(recommended().textContent).toContain("Automated Testing");
    expect(recommended().textContent).not.toContain("Educational Technology");
    expect(interestGroup().querySelector<HTMLInputElement>('input[value="Educational Technology"]')!.checked).toBe(true);
    await click("Complete onboarding");
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ researchAreas: ["Software Engineering"], researchInterests: ["Educational Technology", "LLM for Software Engineering"], skills: ["Survey Design"] }));
  });
  it("keeps selected interests and skills across Back, refresh and failed submission", async () => {
    await render(); await identity("LECTURER"); await click("Continue"); await click("Education");
    await tick("research-interest", "Educational Technology");
    await tick("research-interest", "Public Health"); await tick("research-interest", "Public Health");
    await tick("research-skill", "Data Analysis"); await tick("research-skill", "Python");
    await addResearchItem("research-interest", "Inclusive teaching");
    await addResearchItem("research-skill", "R");
    await click("Back"); await click("Continue");
    await act(async () => root.unmount()); root = createRoot(container); await render();
    expect(container.querySelector<HTMLInputElement>('input[name="research-interest"][value="Educational Technology"]')!.checked).toBe(true);
    expect(JSON.parse(sessionStorage.getItem("lumigap.onboarding.v4.member")!).researchInterests).not.toContain("Public Health");
    expect(container.querySelector<HTMLInputElement>('input[name="research-skill"][value="Data Analysis"]')!.checked).toBe(true);
    expect(container.textContent).toContain("Inclusive teaching");
    mocks.save.mockRejectedValueOnce(new Error("offline")); await click("Complete onboarding");
    const payload = { researchInterests: ["Educational Technology", "Inclusive teaching"], skills: ["Data Analysis", "Python", "R"] };
    expect(JSON.parse(sessionStorage.getItem("lumigap.onboarding.v4.member")!)).toMatchObject(payload);
    await click("Complete onboarding"); expect(mocks.save).toHaveBeenLastCalledWith(expect.objectContaining(payload));
    expect(container.textContent).toContain("Home reached");
  });
  it.each([
    { field: "researchInterests", group: "research-interest", section: "interests", selected: "Educational Technology", replacement: "Public Health" },
    { field: "skills", group: "research-skill", section: "skills", selected: "Data Analysis", replacement: "Python" },
  ])("preserves oversized legacy $field and requires reducing them to five", async ({ field, group, section, selected, replacement }) => {
    sessionStorage.setItem("lumigap.onboarding.v4.member", JSON.stringify({ step: 3, focusTab: section, academicRole: "LECTURER", institutionId: "11111111-1111-4111-8111-111111111111", institutionName: "University of Melbourne", researchAreas: ["Education"], [field]: [selected, ...Array.from({ length: 5 }, (_, i) => `Legacy ${i}`)] }));
    await render();
    expect(container.querySelector(`#optional-${section}`)!.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector(`#optional-${section}`)!.textContent).toContain("6/5");
    await click("Complete onboarding"); expect(mocks.save).not.toHaveBeenCalled();
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(mocks.save).not.toHaveBeenCalled();
    expect(JSON.parse(sessionStorage.getItem("lumigap.onboarding.v4.member")!)[field]).toHaveLength(6);
    await input(`${group}-search`, replacement);
    expect(container.querySelector<HTMLInputElement>(`input[name="${group}"][value="${replacement}"]`)!.disabled).toBe(true);
    await act(async () => container.querySelector<HTMLInputElement>(`input[name="${group}"][value="Legacy 0"]`)!.click());
    await addResearchItem(group, "Custom overflow");
    expect(JSON.parse(sessionStorage.getItem("lumigap.onboarding.v4.member")!)[field]).not.toContain("Custom overflow");
    await act(async () => container.querySelector<HTMLInputElement>(`input[name="${group}"][value="${selected}"]`)!.click());
    await tick(group, replacement); await click("Complete onboarding");
    expect(mocks.save.mock.calls[0]![0][field]).toHaveLength(5);
    expect(mocks.save.mock.calls[0]![0][field]).toContain(replacement);
  });
  it("requires email ownership before showing academic setup", async () => {
    mocks.user.emailVerifiedAt = ""; await render();
    expect(container.textContent).toContain("Email ownership required");
  });
  it("shows only academic identity initially, with no verification documents or external role", async () => {
    await render(); expect(container.textContent).toContain("Step 1 of 3");
    expect(container.querySelector("#program-name")).toBeNull();
    expect(container.querySelector("#institution-search")).toBeNull();
    expect(container.querySelectorAll('input[name="academic-role"]')).toHaveLength(3);
    expect(container.querySelector("#area-search")).toBeNull();
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(container.textContent).not.toContain("External User");
  });
  it("lets a non-FPT Student enter a major, skip optional interests and reach Home", async () => {
    await render(); await identity("STUDENT");
    expect(container.querySelector("#current-position")).toBeNull();
    await input("program-name", "Computer Science"); await click("Continue"); await click("Software Engineering"); await click("Complete onboarding");
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ academicRole: "STUDENT", programName: "Computer Science", institutionName: "University of Melbourne", researchInterests: [] }));
    expect(container.textContent).toContain("Home reached");
    expect(sessionStorage.getItem("lumigap.onboarding.v4.member")).toBeNull();
  });
  it("continues to the original invitation only after completing onboarding", async () => {
    await render("/invitations/example"); await identity("STUDENT");
    await input("program-name", "Computer Science"); await click("Continue");
    await click("Software Engineering"); await click("Complete onboarding");
    expect(container.textContent).toBe("Invitation reached");
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });
  it.each(["RESEARCHER", "LECTURER"])("shows current position rather than program for %s", async role => {
    await render(); await identity(role);
    if (role === "LECTURER") expect(container.querySelector("#current-position")).toBeNull();
    else expect(container.querySelector("#current-position")).not.toBeNull();
    expect(container.querySelector("#program-name")).toBeNull();
    if (role === "LECTURER") expect(container.textContent).toContain("Position verification is available after onboarding.");
  });
  it("restores draft progress after refresh and preserves it after a save failure", async () => {
    await render(); await identity("STUDENT"); await input("program-name", "Computer Science");
    await act(async () => root.unmount()); root = createRoot(container); await render();
    expect(container.textContent).toContain("Step 2 of 3"); expect(container.querySelector<HTMLInputElement>("#program-name")!.value).toBe("Computer Science");
    await click("Continue"); await click("Education"); mocks.save.mockRejectedValueOnce(new Error("offline")); await click("Complete onboarding");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Your progress has been kept");
    expect(JSON.parse(sessionStorage.getItem("lumigap.onboarding.v4.member")!).researchAreas).toEqual(["Education"]);
  });
  it.each([
    ["LECTURER", "Your teaching role", "Additional academic title", "Associate Professor", "Teaching and research fields"],
    ["RESEARCHER", "Your research role", "Research position", "Research Fellow", "Research Areas"],
  ])("collects and saves the appropriate position and focus for %s", async (role, heading, positionLabel, position, focusLabel) => {
    await render(); await identity(role);
    expect(container.querySelector("h1")!.textContent).toBe(heading);
    if (role === "LECTURER") await click("Add an academic title (optional)");
    expect(container.querySelector('label[for="current-position"]')!.textContent).toContain(positionLabel);
    const select = container.querySelector<HTMLSelectElement>("#current-position")!;
    expect([...select.options].some(option => option.value === (role === "LECTURER" ? "Research Fellow" : "Associate Professor"))).toBe(false);
    await act(async () => { select.value = position; select.dispatchEvent(new Event("change", { bubbles: true })); });
    await click("Continue");
    expect(container.querySelector('label[for="area-search"]')!.textContent).toContain(focusLabel);
    await click("Education"); await click("Complete onboarding");
    const payload = mocks.save.mock.calls[0]![0];
    expect(payload).toMatchObject({ academicRole: role, positionTitle: position, researchAreas: ["Education"] });
    expect(payload).not.toHaveProperty("programId"); expect(payload).not.toHaveProperty("programName");
  });
  it("clears student-only data when the role changes and asks the new role's questions", async () => {
    await render(); await identity("STUDENT"); await input("program-name", "Computer Science"); await click("Back");
    await act(async () => container.querySelector<HTMLInputElement>('input[value="LECTURER"]')!.click());
    await click("Continue");
    expect(container.querySelector("#program-name")).toBeNull();
    expect(container.querySelector('label[for="institution-search"]')!.textContent).toContain("Where do you teach?");
    const saved = JSON.parse(sessionStorage.getItem("lumigap.onboarding.v4.member")!);
    expect(saved.programName).toBe(""); expect(saved.programId).toBe("");
    expect(saved.institutionName).toBe("University of Melbourne");
  });
  it("keeps unfinished data from the previous onboarding version", async () => {
    sessionStorage.setItem("lumigap.onboarding.v2.member", JSON.stringify({ step: 2, academicRole: "STUDENT", institutionId: "11111111-1111-4111-8111-111111111111", institutionName: "University of Melbourne", programName: "Computer Science", researchAreas: ["Education"] }));
    await render();
    expect(container.querySelector("h1")!.textContent).toBe("Your studies");
    expect(container.querySelector<HTMLInputElement>("#program-name")!.value).toBe("Computer Science");
    await click("Continue");
    expect(container.querySelector("#area-limit")!.textContent).toContain("0/3");
    expect(container.textContent).not.toContain("Saved choices from an earlier setup");
    await click("Education"); await click("Complete onboarding");
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ programName: "Computer Science", researchAreas: ["Education"] }));
    expect(sessionStorage.getItem("lumigap.onboarding.v2.member")).toBeNull();
  });
  it("uses the selected Lecturer role without requiring another position choice", async () => {
    await render(); await identity("LECTURER");
    expect(container.querySelector("#current-position")).toBeNull();
    await click("Continue"); await click("Education"); await click("Complete onboarding");
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ academicRole: "LECTURER", positionTitle: "Lecturer" }));
    expect(container.textContent).toContain("Home reached");
  });
  it("restores an optional title and lets the applicant remove it", async () => {
    sessionStorage.setItem("lumigap.onboarding.v4.member", JSON.stringify({ step: 2, academicRole: "LECTURER", institutionId: "11111111-1111-4111-8111-111111111111", institutionName: "University of Melbourne", positionTitle: "Associate Professor" }));
    await render();
    const select = container.querySelector<HTMLSelectElement>("#current-position")!;
    expect(select.value).toBe("Associate Professor");
    expect([...select.options].some(option => option.textContent === "Lecturer")).toBe(false);
    await act(async () => { select.value = "Lecturer"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    await click("Continue"); await click("Education"); await click("Complete onboarding");
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ positionTitle: "Lecturer" }));
  });
  it("requires a custom title when Other is chosen and allows cancelling the empty field", async () => {
    await render(); await identity("LECTURER"); await click("Add an academic title (optional)");
    const select = container.querySelector<HTMLSelectElement>("#current-position")!;
    await act(async () => { select.value = "OTHER"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect([...container.querySelectorAll("button")].find(button => button.textContent === "Continue")!.disabled).toBe(true);
    await click("Add an academic title (optional)");
    expect(container.querySelector("#current-position")).toBeNull();
    await click("Continue"); await click("Education"); await click("Complete onboarding");
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ positionTitle: "Lecturer" }));
  });
});
