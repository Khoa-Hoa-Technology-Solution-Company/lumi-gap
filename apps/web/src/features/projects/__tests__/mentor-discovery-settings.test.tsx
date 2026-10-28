// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { MentorDiscoverySettings } from "../components/mentor-discovery-settings";

const mocks = vi.hoisted(() => ({ settings: vi.fn(), saveSettings: vi.fn() }));
vi.mock("../api/academic-support.api", () => ({ academicSupportApi: mocks }));
vi.mock("@/features/auth/api/auth.api", () => ({ authApi: { academicOnboardingOptions: async () => ({ researchAreas: [] }) } }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (state: { user: { id: string } }) => unknown) => select({ user: { id: "owner" } }) }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("../components/research-area-select", () => ({ ResearchAreaSelect: () => null }));
vi.mock("../components/workspace-common", () => ({ useUnsavedWorkspace: () => {}, canLeaveWorkspace: async () => true }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => { await cleanup?.(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

it("retains dirty mentor preferences and their original version after a background refetch fails", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const settings = { id: "project", title: "Study", summary: "Original safe project summary", discovery: "CLOSED", expertise: [], researchAreas: [], mentoringNeeds: "", stage: "ACTIVE", version: 1 };
  mocks.settings.mockResolvedValue(settings); mocks.saveSettings.mockResolvedValue({ ...settings, mentoringNeeds: "Keep these experiment details", version: 2 });
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  cleanup = async () => { await act(async () => root.unmount()); client.clear(); host.remove(); };
  await act(async () => { root.render(<QueryClientProvider client={client}><MentorDiscoverySettings projectId="project" startEditing /></QueryClientProvider>); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  const needs = host.querySelector<HTMLTextAreaElement>('textarea[id$="-needs"]')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(needs, "Keep these experiment details"); needs.dispatchEvent(new Event("input", { bubbles: true })); });
  mocks.settings.mockRejectedValue(new Error("Background connection interrupted"));
  await act(async () => { await client.invalidateQueries({ queryKey: ["academic-support", "owner", "discovery-settings", "project"] }); });
  expect(host.querySelector<HTMLTextAreaElement>('textarea[id$="-needs"]')).toBe(needs);
  expect(needs.value).toBe("Keep these experiment details");
  await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(mocks.saveSettings).toHaveBeenCalledWith("project", expect.objectContaining({ mentoringNeeds: "Keep these experiment details", expectedVersion: 1 }));
});
