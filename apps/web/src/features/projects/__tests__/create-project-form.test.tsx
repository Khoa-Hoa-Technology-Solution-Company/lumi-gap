// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { CreateProjectForm } from "../components/create-project-form";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  inviteMember: vi.fn(),
  searchMentors: vi.fn(),
  requestMentor: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
  close: vi.fn(),
  busy: vi.fn(),
}));
vi.mock("@/i18n", () => ({ useI18n: () => ({ language: "en", t: (key: string) => key }) }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (state: { user: { id: string; email: string } }) => unknown) => select({ user: { id: "creator", email: "owner@example.com" } }) }));
vi.mock("../hooks/use-projects", () => ({ useCreateProject: () => ({ mutateAsync: mocks.create, isPending: false }) }));
vi.mock("../api/projects.api", () => ({ projectsApi: { inviteMember: mocks.inviteMember } }));
vi.mock("../api/academic-support.api", () => ({
  academicSupportApi: {
    searchMentors: mocks.searchMentors,
    request: mocks.requestMentor,
  },
}));
vi.mock("@/features/auth/api/auth.api", () => ({ authApi: { academicOnboardingOptions: async () => ({ researchAreas: ["Education", "Medicine", "Biology", "Economics"] }) } }));
vi.mock("sonner", () => ({ toast: { success: mocks.toastSuccess, warning: mocks.toastWarning } }));
let root: Root, container: HTMLDivElement, client: QueryClient;
const draftKey = "lumigap.project-create.v1.creator";
function Location() { const location = useLocation(); return <output>{location.pathname}{location.search}</output>; }
async function render() {
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Dialog open><DialogContent><CreateProjectForm onClose={mocks.close} onBusyChange={mocks.busy} /></DialogContent></Dialog><Location /></MemoryRouter></QueryClientProvider>));
}
async function fill(selector: string, value: string) {
  const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
  const proto = input.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
}
async function fillStep1(title = "An initial idea", description = "Explore security vulnerabilities using LLMs", keywords = "LLM, Vulnerability Detection, Security") {
  await fill("#project-create-title", title);
  await fill("#project-create-description", description);
  await fill("#project-create-keywords", keywords);
}
const submit = () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.resetAllMocks(); sessionStorage.clear();
  mocks.searchMentors.mockResolvedValue({ items: [], meta: { page: 1, pageSize: 5, total: 0, totalPages: 1 } });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); vi.unstubAllGlobals(); });

it("validates step 1 fields, advances to step 2 with private & exploratory defaults, and creates project", async () => {
  mocks.create.mockResolvedValue({ _id: "created" }); await render();
  expect(document.body.textContent).toContain("Step 1/2");
  expect(document.querySelector('input[name="visibility"]')).toBeNull();
  expect(document.body.textContent).not.toContain("Public summary");
  await act(async () => { submit(); });
  expect(mocks.create).not.toHaveBeenCalled();
  expect(document.querySelector("#project-title-error")?.textContent).toBe("Enter a project title.");
  expect(document.querySelector("#project-description-error")?.textContent).toBe("Enter a topic or research problem.");
  expect(document.querySelector("#project-keywords-error")?.textContent).toBe("Enter at least one research keyword.");

  await fillStep1();
  await act(async () => { submit(); });
  expect(mocks.create).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain("Step 2/2");
  expect(document.body.textContent).toContain("Configuration summary");

  await act(async () => { submit(); });
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
    title: "An initial idea",
    description: "Explore security vulnerabilities using LLMs",
    researchField: "Artificial Intelligence",
    researchAreas: ["Artificial Intelligence", "LLM", "Vulnerability Detection"],
    keywords: ["LLM", "Vulnerability Detection", "Security"],
    visibility: "PRIVATE",
    researchApproach: "EXPLORATORY",
  }));
  expect(container.querySelector("output")?.textContent).toBe("/projects/created?tab=papers&welcome=1");
  expect(sessionStorage.getItem(draftKey)).toBeNull();
});

it("locks repeated clicks while the creation response is pending", async () => {
  let finish!: (value: { _id: string }) => void;
  mocks.create.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await render(); await fillStep1("One project");
  await act(async () => { submit(); });
  await act(async () => { submit(); submit(); });
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(mocks.busy).toHaveBeenLastCalledWith(true);
  await act(async () => finish({ _id: "one" }));
  expect(mocks.busy).toHaveBeenLastCalledWith(false);
});

it.each([false, true])("restores an older public draft as private (submitted: %s)", async submitted => {
  const idempotencyKey = crypto.randomUUID();
  sessionStorage.setItem(draftKey, JSON.stringify({ title: "Saved idea", description: "Saved objective", visibility: "PUBLIC", researchAreas: [], researchApproach: "UNDECIDED", idempotencyKey, submitted }));
  mocks.create.mockResolvedValue({ _id: "private-project" });
  await render();
  expect(document.querySelector<HTMLInputElement>("#project-create-title")?.value).toBe("Saved idea");
  await fill("#project-create-keywords", "Evidence synthesis");
  await act(async () => { submit(); });
  await act(async () => { submit(); });
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ title: "Saved idea", description: "Saved objective", visibility: "PRIVATE", idempotencyKey }));
});

it("recovers the same request after a lost response and a form remount", async () => {
  mocks.create.mockRejectedValueOnce(new Error("Connection lost")).mockResolvedValueOnce({ _id: "recovered" });
  await render(); await fillStep1("Retained idea");
  await act(async () => { submit(); });
  await act(async () => { submit(); });
  const original = mocks.create.mock.calls[0]![0];
  await act(async () => root.unmount()); root = createRoot(container); await render();
  expect(document.body.textContent).toContain("Step 2/2");
  expect(document.querySelector<HTMLFieldSetElement>("form > fieldset")?.disabled).toBe(true);
  await act(async () => { submit(); });
  expect(mocks.create.mock.calls[1]![0]).toEqual(original);
  expect(container.querySelector("output")?.textContent).toContain("/projects/recovered?");
});

it("blocks self-invite and duplicates, preserves step 1 on back, keeps project if invites fail, and prepares the shared lecturer invitation form", async () => {
  mocks.create.mockResolvedValue({ _id: "team-proj", title: "Team study" });
  mocks.inviteMember.mockRejectedValueOnce(new Error("Delivery error")).mockResolvedValueOnce(undefined);
  mocks.searchMentors.mockResolvedValue({
    items: [{
      _id: "mentor-1",
      fullName: "Dr. Nguyen",
      institutionName: "FPT University",
      positionTitle: "Lecturer",
      academicRole: "LECTURER",
      verifiedLecturer: true,
      acceptingMentorships: true,
      expertiseAreas: ["Artificial Intelligence"],
      researchInterests: [],
      matchedTerms: ["Artificial Intelligence"],
      sameInstitution: true,
    }],
    meta: { page: 1, pageSize: 5, total: 1, totalPages: 1 },
  });
  mocks.requestMentor.mockResolvedValue({ id: "req-1", status: "PENDING" });

  await render();
  await fillStep1("Team study");
  await act(async () => { submit(); });

  // Verify summary displays Step 1 title & field before finishing, and Back retains data.
  expect(document.body.textContent).toContain("Team study");
  expect(document.body.textContent).toContain("Artificial Intelligence");
  const backButton = [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Back")!;
  await act(async () => { backButton.click(); });
  expect(document.querySelector<HTMLInputElement>("#project-create-title")?.value).toBe("Team study");
  expect(document.querySelector<HTMLInputElement>("#project-create-keywords")?.value).toBe("LLM, Vulnerability Detection, Security");
  await act(async () => { submit(); });

  // Team mode: block self-invite, accept valid teammate, block duplicate, notice consent requirement.
  const teamRadio = document.querySelector<HTMLInputElement>('input[name="teamMode"][value="TEAM"]')!;
  await act(async () => { teamRadio.click(); });
  expect(document.body.textContent).toContain("Invited teammates join as Members only after accepting their invitation.");

  const addButton = () => [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.includes("Add teammate"))!;
  await fill("#project-wizard-invite-email", "owner@example.com");
  await act(async () => { addButton().click(); });
  expect(document.body.textContent).toContain("You cannot invite yourself to a project.");

  await fill("#project-wizard-invite-email", "teammate@example.com");
  await act(async () => { addButton().click(); });
  await fill("#project-wizard-invite-email", "teammate@example.com");
  await act(async () => { addButton().click(); });
  expect(document.body.textContent).toContain("This email has already been added.");

  await fill("#project-wizard-invite-email", "second@example.com");
  await act(async () => { addButton().click(); });
  expect(document.body.textContent).toContain("1 Owner + {{count}} invitations");

  // Find supervisor & select verified lecturer
  const mentorRadio = document.querySelector<HTMLInputElement>('input[name="mentorMode"][value="FIND"]')!;
  await act(async () => { mentorRadio.click(); });
  await act(async () => { await new Promise(r => setTimeout(r, 10)); });
  expect(document.body.textContent).toContain("Dr. Nguyen");
  const selectMentor = [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Select")!;
  await act(async () => { selectMentor.click(); });
  expect(document.body.textContent).toContain("Dr. Nguyen (Selected)");

  await act(async () => { submit(); });
  expect(mocks.inviteMember).toHaveBeenCalledWith("team-proj", { email: "teammate@example.com" });
  expect(mocks.inviteMember).toHaveBeenCalledWith("team-proj", { email: "second@example.com" });
  expect(mocks.requestMentor).not.toHaveBeenCalled();
  expect(JSON.parse(sessionStorage.getItem("lumigap-supervisor-invite:creator:team-proj:mentor-1")!)).toMatchObject({ summary: "Explore security vulnerabilities using LLMs", support: [], reason: "" });
  expect(mocks.toastWarning).toHaveBeenCalled();
  expect(mocks.toastSuccess).toHaveBeenCalled();
  expect(container.querySelector("output")?.textContent).toBe("/projects/team-proj?tab=support&inviteMentor=mentor-1");
});

it("navigates to academic support when choosing supervisor setup without selecting a lecturer in step 2", async () => {
  mocks.create.mockResolvedValue({ _id: "support-proj", title: "Mentor later" });
  await render();
  await fillStep1("Mentor later");
  await act(async () => { submit(); });
  const mentorRadio = document.querySelector<HTMLInputElement>('input[name="mentorMode"][value="FIND"]')!;
  await act(async () => { mentorRadio.click(); });
  await act(async () => { submit(); });
  expect(container.querySelector("output")?.textContent).toBe("/projects/support-proj?tab=support");
});

it("discards malformed stored input and does not forward unknown stored properties", async () => {
  sessionStorage.setItem(draftKey, JSON.stringify({ step: 1, title: "Invalid storage", idempotencyKey: crypto.randomUUID(), visibility: "PUBLIC", researchApproach: {}, ownerId: "forged" }));
  await render();
  expect(document.querySelector<HTMLInputElement>("#project-create-title")?.value).toBe("");
  expect(document.querySelector('input[name="visibility"]')).toBeNull();
});
