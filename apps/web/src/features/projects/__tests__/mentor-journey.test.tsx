// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ResearchClassificationFields, ResearchClassificationSummary } from "@/features/academic-profile/components/research-classification-fields";
import { MentorTopicSuggestions } from "../components/mentor-topic-suggestions";
import { MentorRelevanceSummary } from "../components/mentor-relevance-summary";
import { mentorJourneyEn, mentorJourneyVi } from "@/i18n/locales/mentor-journey";
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), changed: vi.fn() }));
vi.mock("@/services/api-client", () => ({ api: mocks }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ language: "en", t: (key: string) => key }) }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (state: { user: { id: string } }) => unknown) => select({ user: { id: "owner" } }) }));
let root: Root, host: HTMLDivElement, client: QueryClient;
const empty = { nodeIds: [], keywordIds: [], skillIds: [] };
async function settle() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); }
async function render(node: ReactNode) { await act(async () => root.render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)); await settle(); }
async function click(text: string) { const element = [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes(text)); expect(element).toBeDefined(); await act(async () => element!.click()); await settle(); }
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.resetAllMocks(); mocks.get.mockResolvedValue({ data: { data: [] } }); client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } }); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); });
it("selects a canonical ID with hierarchy context without changing other references", async () => {
  mocks.get.mockImplementation(async (_url, options) => ({ data: { data: options.params.level === "field" ? [{ id: "canonical-field-id", name: "Computer Science", context: "Physical Sciences", source: "OPENALEX" }] : [] } }));
  await render(<ResearchClassificationFields value={{ ...empty, skillIds: ["pytorch"] }} onChange={mocks.changed} />);
  await act(async () => document.querySelector<HTMLInputElement>("input")!.focus()); await settle();
  expect(document.body.textContent).toContain("Physical Sciences"); await click("Computer Science");
  expect(mocks.changed).toHaveBeenCalledWith({ nodeIds: ["canonical-field-id"], keywordIds: [], skillIds: ["pytorch"] });
});
it("keeps catalogue data separate from self-declared interests and survives a provider outage", async () => {
  mocks.get.mockRejectedValue(new Error("Unavailable"));
  await render(<ResearchClassificationFields value={{ ...empty, nodeIds: ["saved-id"] }} onChange={mocks.changed} />); await settle(); await act(async () => document.querySelector<HTMLInputElement>("input")!.focus()); await settle();
  expect(document.body.textContent).toContain("Your saved and custom terms are kept"); expect(mocks.changed).not.toHaveBeenCalled();
});
it("escapes taxonomy labels and displays technologies outside academic hierarchy", async () => {
  await render(<ResearchClassificationSummary value={{ ...empty, nodes: [{ id: "topic", name: "<img src=x onerror=alert(1)>", level: "topic", source: "LOCAL", parentId: null, externalId: null, aliases: [], syncedAt: null, labelVi: null, sourceVersion: null }], skillIds: ["pytorch"], keywords: [], vocabularyVersion: "test" }} />);
  expect(document.querySelector("img")).toBeNull(); expect(document.body.textContent).toContain("Technical skills and methods"); expect(document.body.textContent).toContain("PyTorch");
});
it("does not send project text without explicit consent and never requests on render", async () => {
  await render(<MentorTopicSuggestions projectId="project" version={7} disabled={false} value={empty} onChange={mocks.changed} />);
  expect(mocks.post).not.toHaveBeenCalled(); expect(document.querySelector<HTMLButtonElement>("button")?.disabled).toBe(true);
  expect(document.body.textContent).toContain("OpenAlex");
});
it("adds selected suggestions without overwriting manual classifications", async () => {
  mocks.post.mockResolvedValue({ data: { data: { jobId: "job" } } });
  mocks.get.mockResolvedValue({ data: { data: { jobId: "job", status: "COMPLETED", result: { source: "OPENALEX", classification: { ...empty, nodeIds: ["new-topic"], nodes: [{ id: "new-topic", name: "Medical imaging" }], keywords: [] } } } } });
  await render(<MentorTopicSuggestions projectId="project" version={7} disabled={false} value={{ ...empty, nodeIds: ["manual-topic"], skillIds: ["pytorch"] }} onChange={mocks.changed} />);
  await act(async () => document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  await click("Suggest Research Topics"); await settle();
  expect(mocks.post).toHaveBeenCalledWith("/projects/project/mentorship-topic-suggestions", { authorized: true, expectedVersion: 7 });
  expect(mocks.changed).not.toHaveBeenCalled(); await click("Medical imaging"); expect(mocks.changed).toHaveBeenCalledWith({ nodeIds: ["manual-topic", "new-topic"], skillIds: ["pytorch"], keywordIds: [] });
});
it("requires saving changed preview before an external classification request", async () => {
  await render(<MentorTopicSuggestions projectId="project" version={7} disabled value={empty} onChange={mocks.changed} />);
  await act(async () => document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  expect(document.querySelector<HTMLButtonElement>("button")?.disabled).toBe(true); expect(mocks.post).not.toHaveBeenCalled();
});
it("shows explainable relevance and missing information without a made-up percentage", async () => {
  await render(<MentorRelevanceSummary match={{ relevance: "HIGHLY_RELEVANT", topics: ["Medical imaging"], subfields: [], fields: ["Medicine"], skills: ["PyTorch"], interests: [], support: [], gaps: ["No shared canonical research topic"] }} />);
  expect(document.body.textContent).toContain("Shared research topics"); expect(document.body.textContent).toContain("Matching technical skills"); expect(document.body.textContent).not.toContain("%");
});
it("has Vietnamese translations for every new English key", () => {
  expect(Object.keys(mentorJourneyVi).sort()).toEqual(Object.keys(mentorJourneyEn).sort()); expect(Object.values(mentorJourneyVi).every(text => text.trim().length)).toBe(true);
});
