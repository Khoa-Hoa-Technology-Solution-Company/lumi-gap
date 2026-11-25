// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MentoringPreferences } from "@trend/shared-types";
import { MentoringPreferencesPanel } from "../components/mentoring-preferences";

const mocks = vi.hoisted(() => ({ preferences: vi.fn(), savePreferences: vi.fn() }));
vi.mock("../api/academic-support.api", () => ({ academicSupportApi: mocks }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: "mentor" } }) }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ language: "en", t: (key: string, values: Record<string, string> = {}) => key.replace(/{{(\w+)}}/g, (_, name) => values[name] ?? "") }) }));
let root: Root, host: HTMLDivElement, client: QueryClient, pref: MentoringPreferences;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.resetAllMocks();
  pref = {canEnable: true, acceptingMentorships: true, emailEnabled: false, locale: "en", emailDelivery: {status: "READY", recipient: "mentor@university.edu"}};
  mocks.preferences.mockImplementation(async () => structuredClone(pref));
  mocks.savePreferences.mockImplementation(async (input: Partial<MentoringPreferences>) => ({...pref, ...input}));
  client = new QueryClient({defaultOptions: {queries: {retry: false}, mutations: {retry: false}}});
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); });
async function mount() {
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><MentoringPreferencesPanel /></MemoryRouter></QueryClientProvider>));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
}
it("persists the email opt-in independently of mentoring availability and displays the server's verified recipient", async () => {
  await mount();
  expect(host.textContent).toContain("Email notifications are off");
  const toggle = host.querySelector<HTMLInputElement>('input[aria-label="Email for mentorship invitations and decisions"]')!;
  await act(async () => toggle.click());
  expect(mocks.savePreferences).toHaveBeenCalledWith({emailEnabled: true, locale: "en"});
  expect(toggle.checked).toBe(true);
  expect(host.textContent).toContain("New mentorship invitations and decisions will be emailed to mentor@university.edu");
  expect(host.querySelector<HTMLInputElement>('input[aria-label="Open to mentoring new teams"]')?.checked).toBe(true);
  await act(async () => toggle.click());
  expect(mocks.savePreferences).toHaveBeenLastCalledWith({emailEnabled: false, locale: "en"});
});
it.each([
  ["TEST_ADDRESS", "cannot receive messages in a real inbox"],
  ["NOT_CONFIGURED", "messages cannot be sent yet"],
] as const)("does not promise real email delivery for %s", async (status, explanation) => {
  pref.emailEnabled = true; pref.emailDelivery!.status = status;
  await mount();
  expect(host.querySelector('[role="status"]')?.textContent).toContain(explanation);
  expect(host.textContent).not.toContain("will be emailed to");
});
it("keeps the prior preference on a failed update and offers the existing error feedback", async () => {
  mocks.savePreferences.mockRejectedValue(new Error("Offline"));
  await mount();
  const toggle = host.querySelector<HTMLInputElement>('input[aria-label="Email for mentorship invitations and decisions"]')!;
  await act(async () => toggle.click());
  expect(toggle.checked).toBe(false);
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
});
