// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { CreateProjectForm } from "../components/create-project-form";

const mocks = vi.hoisted(() => ({ create: vi.fn(), close: vi.fn(), busy: vi.fn() }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ language: "en", t: (key: string) => key }) }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (state: { user: { id: string } }) => unknown) => select({ user: { id: "creator" } }) }));
vi.mock("../hooks/use-projects", () => ({ useCreateProject: () => ({ mutateAsync: mocks.create, isPending: false }) }));
vi.mock("@/features/auth/api/auth.api", () => ({ authApi: { academicOnboardingOptions: async () => ({ researchAreas: ["Education", "Medicine", "Biology", "Economics"] }) } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
let root: Root, container: HTMLDivElement, client: QueryClient;
const draftKey = "lumigap.project-create.v1.creator";
function Location() { const location = useLocation(); return <output>{location.pathname}{location.search}</output>; }
async function render() {
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Dialog open><DialogContent><CreateProjectForm onClose={mocks.close} onBusyChange={mocks.busy} /></DialogContent></Dialog><Location /></MemoryRouter></QueryClientProvider>));
}
async function fill(selector: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(selector)!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
}
const submit = () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.resetAllMocks(); sessionStorage.clear();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); vi.unstubAllGlobals(); });

it("requires only a title and defaults to private with an undecided approach", async () => {
  mocks.create.mockResolvedValue({ _id: "created" }); await render();
  expect(document.querySelector<HTMLInputElement>('input[value="PRIVATE"]')!.checked).toBe(true);
  await act(async () => { submit(); });
  expect(mocks.create).not.toHaveBeenCalled();
  expect(document.querySelector("#project-title-error")?.textContent).toBe("Enter a project title.");
  await fill("#project-create-title", "An initial idea"); await act(async () => { submit(); });
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ title: "An initial idea", visibility: "PRIVATE", researchAreas: [], researchApproach: "UNDECIDED" }));
  expect(container.querySelector("output")?.textContent).toBe("/projects/created?tab=papers&welcome=1");
  expect(sessionStorage.getItem(draftKey)).toBeNull();
});

it("locks repeated clicks while the creation response is pending", async () => {
  let finish!: (value: { _id: string }) => void;
  mocks.create.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await render(); await fill("#project-create-title", "One project");
  await act(async () => { submit(); submit(); });
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(mocks.busy).toHaveBeenLastCalledWith(true);
  await act(async () => finish({ _id: "one" }));
  expect(mocks.busy).toHaveBeenLastCalledWith(false);
});

it("recovers the same request after a lost response and a form remount", async () => {
  mocks.create.mockRejectedValueOnce(new Error("Connection lost")).mockResolvedValueOnce({ _id: "recovered" });
  await render(); await fill("#project-create-title", "Retained idea"); await act(async () => { submit(); });
  const original = mocks.create.mock.calls[0]![0];
  await act(async () => root.unmount()); root = createRoot(container); await render();
  expect(document.querySelector<HTMLInputElement>("#project-create-title")?.value).toBe("Retained idea");
  expect(document.querySelector<HTMLFieldSetElement>("form > fieldset")?.disabled).toBe(true);
  await act(async () => { submit(); });
  expect(mocks.create.mock.calls[1]![0]).toEqual(original);
  expect(container.querySelector("output")?.textContent).toContain("/projects/recovered?");
});

it("supports searchable custom areas and enforces a maximum of three", async () => {
  mocks.create.mockResolvedValue({ _id: "areas" }); await render();
  await fill("#project-create-title", "Three areas");
  for (const area of ["Education", "Medicine", "Biology"]) {
    const suggestion = [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === area)!;
    await act(async () => suggestion.click());
  }
  expect(document.querySelector<HTMLButtonElement>('[aria-label="Remove Biology"]')).not.toBeNull();
  const fourth = [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Economics")!;
  expect(fourth.disabled).toBe(true);
  await act(async () => { submit(); });
  expect(mocks.create.mock.calls[0]![0].researchAreas).toEqual(["Education", "Medicine", "Biology"]);
});

it("discards malformed stored input and does not forward unknown stored properties", async () => {
  sessionStorage.setItem(draftKey, JSON.stringify({ title: "Invalid storage", idempotencyKey: crypto.randomUUID(), researchAreas: [], visibility: "PUBLIC", researchApproach: {}, ownerId: "forged" }));
  await render();
  expect(document.querySelector<HTMLInputElement>("#project-create-title")?.value).toBe("");
  expect(document.querySelector<HTMLInputElement>('input[value="PRIVATE"]')?.checked).toBe(true);
});
