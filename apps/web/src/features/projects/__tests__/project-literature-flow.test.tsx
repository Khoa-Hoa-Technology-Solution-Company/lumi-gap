// @vitest-environment jsdom
import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { IProject, Paper } from "@trend/shared-types";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { ProjectLiteratureWorkspace } from "../components/project-literature-workspace";
import { ProjectPaperPickerDialog } from "../components/project-paper-picker-dialog";
import { ProjectSectionNav, type ProjectTab } from "../components/project-section-nav";

const mocks = vi.hoisted(() => ({ add: vi.fn(), update: vi.fn(), criteria: vi.fn(), remove: vi.fn(), list: vi.fn(), detail: vi.fn(), bookmarks: [] as Array<{ targetKind: string; targetId: string }> }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ language: "en", t: (key: string, values?: Record<string, string | number>) => key.replace(/\{\{(\w+)\}\}/g, (_, name) => String(values?.[name] ?? "")) }) }));
vi.mock("../hooks/use-projects", () => ({
  useAddPaperToProject: () => ({ mutateAsync: mocks.add, isPending: false }),
  useUpdateProjectPaper: () => ({ mutateAsync: mocks.update, isPending: false }),
  useUpdateProject: () => ({ mutateAsync: mocks.criteria, isPending: false }),
  useRemovePaperFromProject: () => ({ mutateAsync: mocks.remove, isPending: false }),
}));
vi.mock("@/features/papers/api/papers.api", () => ({ papersApi: { list: mocks.list, detail: mocks.detail } }));
vi.mock("@/features/papers/hooks/use-papers", () => ({ usePaper: () => ({ data: undefined, isLoading: false, isError: false }) }));
vi.mock("@/features/compare/hooks/use-compare", () => ({ useComparePapers: () => ({ data: undefined, isLoading: false, isError: false }) }));
vi.mock("@/features/bookmarks/hooks/use-bookmarks", () => ({ useBookmarks: () => ({ data: mocks.bookmarks, isLoading: false, isError: false, refetch: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

let root: Root, container: HTMLDivElement, client: QueryClient;
const included: IProject["papers"][number] = { id: "link1", targetKind: "Paper", targetId: { _id: "p1", title: "Included paper", authors: [] }, screeningStatus: "INCLUDED", readingStatus: "NOT_STARTED", evidenceCount: 1, addedAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" };
const undecided = { ...included, targetId: { _id: "p2", title: "Unscreened paper", authors: [] }, screeningStatus: "UNDECIDED", evidenceCount: 0 } as IProject["papers"][number];
const callbacks = { onRequestAddPaper: vi.fn(), onNavigateToReports: vi.fn(), onNavigateToGaps: vi.fn(), onViewEvidence: vi.fn() };
const workspace = (props: Partial<React.ComponentProps<typeof ProjectLiteratureWorkspace>> = {}) => <ProjectLiteratureWorkspace projectId="project" papers={[]} isOwner readOnly={false} criteria={{ inclusion: [], exclusion: [] }} {...callbacks} {...props} />;
async function render(node: ReactNode) { await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{node}</MemoryRouter></QueryClientProvider>)); }
async function click(text: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(item => item.getAttribute("aria-label") === text || item.textContent === text);
  expect(button, text).toBeDefined(); await act(async () => button!.click());
}
async function flushQueries() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); }); }
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  Object.values(mocks).forEach(value => { if (typeof value === "function") value.mockReset(); });
  Object.values(callbacks).forEach(mock => mock.mockReset());
  mocks.bookmarks = []; mocks.add.mockResolvedValue(undefined); mocks.list.mockResolvedValue({ papers: [] });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("opens the specific source selected in the empty workspace", async () => {
  await render(workspace());
  await click("Search LumiGap"); expect(callbacks.onRequestAddPaper).toHaveBeenLastCalledWith("search");
  await click("Choose from saved papers"); expect(callbacks.onRequestAddPaper).toHaveBeenLastCalledWith("library");
  await click("Add by DOI"); expect(callbacks.onRequestAddPaper).toHaveBeenLastCalledWith("doi");
});
it("prevents archived workspaces from adding papers or editing criteria", async () => {
  await render(workspace({ readOnly: true }));
  expect(container.textContent).toContain("This project is read-only.");
  expect(container.textContent).not.toContain("Search LumiGap");
  await click("View criteria");
  expect(document.querySelector<HTMLTextAreaElement>("#project-inclusion-criteria")?.disabled).toBe(true);
  expect([...document.querySelectorAll("button")].some(button => button.textContent === "Save criteria")).toBe(false);
  await render(<ProjectPaperPickerDialog projectId="project" papers={[]} open readOnly onOpenChange={vi.fn()} />);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(mocks.list).not.toHaveBeenCalled(); expect(mocks.add).not.toHaveBeenCalled();
});
it("shows all literature initially and views evidence without starting new analysis", async () => {
  await render(workspace({ papers: [included, undecided] }));
  expect(container.textContent).toContain("Included paper"); expect(container.textContent).toContain("Unscreened paper");
  await click("View evidence"); expect(callbacks.onViewEvidence).toHaveBeenCalledOnce(); expect(callbacks.onNavigateToGaps).not.toHaveBeenCalled();
  await click("Create artifact"); expect(callbacks.onNavigateToReports).toHaveBeenCalledOnce();
});
it("requires an exclusion reason and retains the form if the decision fails", async () => {
  mocks.update.mockRejectedValue(new Error("offline"));
  await render(workspace({ papers: [undecided] })); await click("Exclude");
  const save = [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Exclude paper")!;
  expect(save.disabled).toBe(true); expect(mocks.update).not.toHaveBeenCalled();
  await act(async () => document.querySelector<HTMLInputElement>('input[value="WRONG_RESEARCH_TOPIC"]')!.click());
  await click("Exclude paper");
  expect(mocks.update).toHaveBeenCalledWith({ paperId: "p2", data: { screeningStatus: "EXCLUDED", exclusionReason: "WRONG_RESEARCH_TOPIC", exclusionNote: null } });
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
});
it("keeps output actions disabled until literature has been included", async () => {
  await render(workspace({ papers: [undecided] }));
  const output = [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Create artifact")!;
  expect(output.disabled).toBe(true);
  await act(async () => output.click()); expect(callbacks.onNavigateToReports).not.toHaveBeenCalled();
});
it("opens the library directly and retains only failed additions for retry", async () => {
  mocks.bookmarks = [{ targetKind: "paper", targetId: "p1" }, { targetKind: "paper", targetId: "p2" }];
  mocks.detail.mockImplementation(async (id: string) => ({ id, title: `Paper ${id}`, authors: [] } as unknown as Paper));
  let finishFirst!: () => void;
  mocks.add.mockImplementationOnce(() => new Promise<void>(resolve => { finishFirst = resolve; })).mockRejectedValueOnce(new Error("offline"));
  const close = vi.fn();
  await render(<ProjectPaperPickerDialog projectId="project" papers={[]} open initialSource="library" onOpenChange={close} />); await flushQueries();
  expect(document.querySelector('[aria-pressed="true"]')?.textContent).toBe("My Library");
  const checks = [...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]; expect(checks).toHaveLength(2);
  await act(async () => { checks[0]!.click(); checks[1]!.click(); });
  await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect([...document.querySelectorAll<HTMLButtonElement>('[aria-pressed]')].every(button => button.disabled)).toBe(true);
  expect(document.querySelector<HTMLInputElement>("#project-paper-search")?.disabled).toBe(true);
  await act(async () => finishFirst());
  expect(mocks.add).toHaveBeenCalledTimes(2); expect(close).not.toHaveBeenCalled();
  expect(checks[0]!.checked).toBe(false); expect(checks[1]!.checked).toBe(true);
});
it("reports unavailable saved papers instead of silently treating them as an empty library", async () => {
  mocks.bookmarks = [{ targetKind: "paper", targetId: "missing" }]; mocks.detail.mockRejectedValue(new Error("offline"));
  await render(<ProjectPaperPickerDialog projectId="project" papers={[]} open initialSource="library" onOpenChange={vi.fn()} />); await flushQueries();
  expect(document.body.textContent).toContain("Some saved papers could not be loaded.");
});
it("keeps search relevance order instead of ranking results by metadata quality", async () => {
  mocks.list.mockResolvedValue({ papers: [{ id: "relevant", title: "Most relevant result", authors: [], dataQualityScore: 1 }, { id: "other", title: "Less relevant result", authors: [], dataQualityScore: 99 }] });
  await render(<ProjectPaperPickerDialog projectId="project" papers={[]} open onOpenChange={vi.fn()} />);
  vi.useFakeTimers();
  const input = document.querySelector<HTMLInputElement>("#project-paper-search")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "machine learning"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
  await act(async () => { await vi.advanceTimersByTimeAsync(10); });
  const labels = [...document.querySelectorAll("label")].filter(label => label.querySelector('input[type="checkbox"]'));
  expect(labels.map(label => label.textContent)).toEqual([expect.stringContaining("Most relevant result"), expect.stringContaining("Less relevant result")]);
});
it("supports keyboard navigation between project sections", async () => {
  function Fixture() { const [tab, setTab] = useState<ProjectTab>("papers"); return <ProjectSectionNav activeTab={tab} onChange={setTab} paperCount={0} memberCount={1} />; }
  await render(<Fixture />);
  expect(container.querySelector('[role="tablist"]')?.getAttribute("aria-orientation")).toBe("horizontal");
  await act(async () => container.querySelector("#project-tab-papers")!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })));
  expect(container.querySelector('[role="tab"][aria-selected="true"]')?.id).toBe("project-tab-chat");
  await act(async () => container.querySelector("#project-tab-chat")!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
  expect(document.activeElement?.id).toBe("project-tab-papers");
  await act(async () => container.querySelector("#project-tab-papers")!.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })));
  expect(container.querySelector('[role="tab"][aria-selected="true"]')?.id).toBe("project-tab-chat");
  expect(document.activeElement?.id).toBe("project-tab-chat");
});

it("reveals an overflowing selected tab within its row", async () => {
  function Fixture() { const [tab, setTab] = useState<ProjectTab>("papers"); return <ProjectSectionNav activeTab={tab} onChange={setTab} paperCount={0} memberCount={1} />; }
  await render(<Fixture />);
  const tabs = container.querySelector<HTMLElement>('[role="tablist"]')!;
  const last = container.querySelector<HTMLElement>("#project-tab-chat")!;
  Object.defineProperty(tabs, "clientWidth", { value: 300 });
  tabs.getBoundingClientRect = () => ({ left: 20, right: 320 } as DOMRect);
  last.getBoundingClientRect = () => ({ left: 350, right: 450 } as DOMRect);
  await act(async () => container.querySelector("#project-tab-papers")!.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })));
  expect(tabs.scrollLeft).toBe(130);
  expect(document.activeElement).toBe(last);
  await act(async () => last.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true })));
  expect(container.querySelector('[aria-selected="true"]')?.id).toBe("project-tab-papers");
});

it("changes sections through the mobile select", async () => {
  function Fixture() { const [tab, setTab] = useState<ProjectTab>("papers"); return <ProjectSectionNav activeTab={tab} onChange={setTab} paperCount={0} memberCount={1} />; }
  await render(<Fixture />);
  const select = container.querySelector<HTMLSelectElement>("#project-section-select")!;
  await act(async () => { select.value = "submissions"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(select.getAttribute("aria-controls")).toBe("project-panel-submissions");
  expect(container.querySelector('[aria-selected="true"]')?.id).toBe("project-tab-submissions");
});
