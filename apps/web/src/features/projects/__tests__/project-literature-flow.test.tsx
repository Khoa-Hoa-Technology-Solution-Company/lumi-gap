// @vitest-environment jsdom
import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useSearchParams } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { IProject, Paper } from "@trend/shared-types";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { ProjectLiteratureWorkspace } from "../components/project-literature-workspace";
import { ProjectPaperPickerDialog } from "../components/project-paper-picker-dialog";
import { ProjectSectionNav, type ProjectTab } from "../components/project-section-nav";

const mocks = vi.hoisted(() => ({ add: vi.fn(), update: vi.fn(), criteria: vi.fn(), remove: vi.fn(), list: vi.fn(), detail: vi.fn(), paper: vi.fn(), bookmarks: [] as Array<{ targetKind: string; targetId: string }> }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ language: "en", t: (key: string, values?: Record<string, string | number>) => key.replace(/\{\{(\w+)\}\}/g, (_, name) => String(values?.[name] ?? "")) }) }));
vi.mock("../hooks/use-projects", () => ({
  useAddPaperToProject: () => ({ mutateAsync: mocks.add, isPending: false }),
  useUpdateProjectPaper: () => ({ mutateAsync: mocks.update, isPending: false }),
  useUpdateProject: () => ({ mutateAsync: mocks.criteria, isPending: false }),
  useRemovePaperFromProject: () => ({ mutateAsync: mocks.remove, isPending: false }),
}));
vi.mock("@/features/papers/api/papers.api", () => ({ papersApi: { list: mocks.list, detail: mocks.detail } }));
vi.mock("@/features/papers/hooks/use-papers", () => ({ usePaper: mocks.paper }));
vi.mock("@/features/compare/hooks/use-compare", () => ({ useComparePapers: () => ({ data: undefined, isLoading: false, isError: false }) }));
vi.mock("@/features/bookmarks/hooks/use-bookmarks", () => ({ useBookmarks: () => ({ data: mocks.bookmarks, isLoading: false, isError: false, refetch: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

let root: Root, container: HTMLDivElement, client: QueryClient;
const included: IProject["papers"][number] = { id: "link1", targetKind: "Paper", targetId: { _id: "p1", title: "Included paper", authors: [] }, screeningStatus: "INCLUDED", readingStatus: "NOT_STARTED", evidenceCount: 1, addedAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" };
const undecided = { ...included, targetId: { _id: "p2", title: "Unscreened paper", authors: [] }, screeningStatus: "UNDECIDED", evidenceCount: 0 } as IProject["papers"][number];
const callbacks = { onRequestAddPaper: vi.fn(), onNavigateToReports: vi.fn(), onNavigateToGaps: vi.fn(), onViewEvidence: vi.fn() };
const workspace = (props: Partial<React.ComponentProps<typeof ProjectLiteratureWorkspace>> = {}) => <ProjectLiteratureWorkspace projectId="project" papers={[]} readOnly={false} {...callbacks} {...props} />;
async function render(node: ReactNode, path = "/") { await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{node}</MemoryRouter></QueryClientProvider>)); }
async function click(text: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(item => item.getAttribute("aria-label") === text || item.textContent === text);
  expect(button, text).toBeDefined(); await act(async () => button!.click());
}
async function chooseGroup(label: string) {
  const button = [...container.querySelectorAll<HTMLButtonElement>('.project-literature-groups button')].find(item => item.textContent?.startsWith(label));
  expect(button).toBeDefined(); await act(async () => button!.click());
}
async function flushQueries() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); }); }
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  Object.values(mocks).forEach(value => { if (typeof value === "function") value.mockReset(); });
  Object.values(callbacks).forEach(mock => mock.mockReset());
  mocks.bookmarks = []; mocks.add.mockResolvedValue(undefined); mocks.list.mockResolvedValue({ papers: [] });
  mocks.paper.mockReturnValue({ data: undefined, isLoading: false, isError: false });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("opens the specific source selected in the empty workspace", async () => {
  await render(workspace());
  await click("Find papers"); expect(callbacks.onRequestAddPaper).toHaveBeenLastCalledWith("search");
  await click("Add saved papers"); expect(callbacks.onRequestAddPaper).toHaveBeenLastCalledWith("library");
  await click("Add by DOI"); expect(callbacks.onRequestAddPaper).toHaveBeenLastCalledWith("doi");
});
it("routes independent screening to its assigned workflow while keeping reading and notes available", async () => {
  await render(workspace({ papers: [undecided], screeningMode: "INDEPENDENT" }));
  await click("Read Unscreened paper");
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.textContent).toContain("Independent reviewers");
  expect([...dialog.querySelectorAll("button")].some(button => button.textContent === "Relevant")).toBe(false);
  expect([...dialog.querySelectorAll("button")].some(button => button.textContent === "Add note")).toBe(true);
  expect(dialog.querySelector('select[aria-label="Reading status"]')).not.toBeNull();
  await click("Independent reviewers · Screening");
  expect(mocks.update).not.toHaveBeenCalled();
});
it("records uncertainty as MAYBE rather than resetting to not screened", async () => {
  await render(workspace({ papers: [undecided] }));
  await click("Read Unscreened paper");
  await click("Considering");
  expect(mocks.update).toHaveBeenCalledWith({ paperId: "p2", data: { screeningStatus: "MAYBE", expectedUpdatedAt: undecided.updatedAt } });
});
it("navigates seamlessly between papers inside the reader dialog without closing it", async () => {
  await render(workspace({ papers: [included, undecided] }));
  await click("Read Included paper");
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.textContent).toContain("Included paper");
  expect(dialog.querySelector<HTMLButtonElement>('[aria-label="Previous paper"]')?.disabled).toBe(true);
  expect(dialog.querySelector<HTMLButtonElement>('[aria-label="Next paper"]')?.disabled).toBe(false);

  // Click Next paper to switch to the second paper without closing dialog
  await click("Next paper");
  expect(dialog.textContent).toContain("Unscreened paper");
  expect(dialog.querySelector<HTMLButtonElement>('[aria-label="Previous paper"]')?.disabled).toBe(false);
  expect(dialog.querySelector<HTMLButtonElement>('[aria-label="Next paper"]')?.disabled).toBe(true);

  // Click Previous paper to go back
  await click("Previous paper");
  expect(dialog.textContent).toContain("Included paper");
});
it("combines contributor and relevance filters and clears both together", async () => {
  const alice = { _id: "alice", fullName: "Alice Nguyen" }, bao = { _id: "bao", fullName: "Bao Tran" };
  await render(workspace({ papers: [{ ...included, addedBy: alice, screenedBy: bao }, { ...undecided, addedBy: bao }] }));
  expect(container.textContent).toContain("Added by Alice Nguyen");
  expect(container.textContent).toContain("Reviewed by Bao Tran");
  const contributor = container.querySelector<HTMLSelectElement>('[aria-label="Filter by who added the paper"]')!;
  await act(async () => { contributor.value = "bao"; contributor.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(container.querySelector('[aria-label="Read Included paper"]')).toBeNull();
  expect(container.querySelector('[aria-label="Read Unscreened paper"]')).not.toBeNull();
  await chooseGroup("Relevant");
  expect(container.textContent).toContain("No papers match these filters");
  await click("Clear filters");
  expect(contributor.value).toBe(""); expect(container.querySelector('.project-literature-groups [aria-pressed="true"]')?.textContent).toContain("All papers");
  expect(container.querySelectorAll(".project-paper-row")).toHaveLength(2);
});
it("saves a quick relevance decision without opening the paper", async () => {
  await render(workspace({ papers: [undecided] }));
  const decision = container.querySelector<HTMLSelectElement>('[aria-label="Relevance of Unscreened paper"]')!;
  await act(async () => { decision.value = "INCLUDED"; decision.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(mocks.update).toHaveBeenCalledWith({ paperId: "p2", data: { screeningStatus: "INCLUDED", expectedUpdatedAt: undecided.updatedAt } });
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
it("requires a reason for a quick rejection and preserves an undecided paper on cancel", async () => {
  await render(workspace({ papers: [undecided] }));
  const decision = container.querySelector<HTMLSelectElement>('[aria-label="Relevance of Unscreened paper"]')!;
  await act(async () => { decision.value = "EXCLUDED"; decision.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(mocks.update).not.toHaveBeenCalled();
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  await click("Cancel");
  await flushQueries();
  expect(document.activeElement).toBe(decision);
  expect(decision.value).toBe("UNDECIDED"); expect(mocks.update).not.toHaveBeenCalled();
});
it("removes optional tools and prevents quick edits in independent screening", async () => {
  await render(workspace({ papers: [undecided], screeningMode: "INDEPENDENT" }));
  expect(container.querySelector(".project-literature-options")).toBeNull();
  expect(container.textContent).not.toContain("Review criteria (optional)");
  expect(container.textContent).not.toContain("Create artifact");
  expect(container.textContent).not.toContain("Evidence matrix");
  expect(container.querySelector('[aria-label="Relevance of Unscreened paper"]')).toBeNull();
  expect(container.textContent).not.toContain("No screening criteria yet.");
  expect(container.querySelector(".project-screening-summary")).toBeNull();
});
it("removes a paper only after confirmation without deleting its library record", async () => {
  await render(workspace({ papers: [undecided] }));
  await click("Remove Unscreened paper from project");
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("The saved paper itself will not be deleted.");
  await click("Remove paper"); expect(mocks.remove).toHaveBeenCalledWith("p2");
});
it("prevents archived workspaces from adding papers", async () => {
  await render(workspace({ readOnly: true }));
  expect(container.textContent).toContain("This project is read-only.");
  expect(container.textContent).not.toContain("Find papers");
  await render(<ProjectPaperPickerDialog projectId="project" papers={[]} open readOnly onOpenChange={vi.fn()} />);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(mocks.list).not.toHaveBeenCalled(); expect(mocks.add).not.toHaveBeenCalled();
});
it("shows all literature initially and views evidence without starting new analysis", async () => {
  await render(workspace({ papers: [included, undecided] }));
  expect(container.textContent).toContain("Included paper"); expect(container.textContent).toContain("Unscreened paper");
  await click("Read Included paper");
  await click("View evidence"); expect(callbacks.onViewEvidence).toHaveBeenCalledOnce(); expect(callbacks.onNavigateToGaps).not.toHaveBeenCalled();
  await click("Close");
  expect(container.textContent).not.toContain("Create artifact");
});
it("requires an exclusion reason and retains the form if the decision fails", async () => {
  mocks.update.mockRejectedValue(new Error("offline"));
  await render(workspace({ papers: [undecided] })); await click("Read Unscreened paper"); await click("Not relevant");
  const save = [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Exclude paper")!;
  expect(save.disabled).toBe(true); expect(mocks.update).not.toHaveBeenCalled();
  await act(async () => document.querySelector<HTMLInputElement>('input[value="WRONG_RESEARCH_TOPIC"]')!.click());
  await click("Exclude paper");
  expect(mocks.update).toHaveBeenCalledWith({ paperId: "p2", data: { screeningStatus: "EXCLUDED", exclusionReason: "WRONG_RESEARCH_TOPIC", exclusionNote: null, expectedUpdatedAt: undecided.updatedAt } });
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
});
it("opens only the chosen paper on demand and returns focus to its row", async () => {
  await render(workspace({ papers: [included, undecided] }));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(mocks.paper).toHaveBeenLastCalledWith(undefined);
  const row = container.querySelector<HTMLButtonElement>('[aria-label="Read Unscreened paper"]')!;
  await click("Read Unscreened paper");
  expect(mocks.paper).toHaveBeenLastCalledWith("p2");
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.querySelector("h2")?.textContent).toBe("Unscreened paper");
  expect(dialog.textContent).not.toContain("Included paper");
  await click("Close");
  await flushQueries(); // Radix restores focus after unmounting its focus scope.
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(row);
});
it("shows a single loading layout then reveals the complete reader together", async () => {
  mocks.paper.mockReturnValue({ data: undefined, isLoading: true, isError: false });
  await render(workspace({ papers: [included] }));
  await click("Read Included paper");
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.querySelector('[aria-busy="true"]')).not.toBeNull();
  expect(dialog.querySelector('[role="status"][aria-label="Loading..."]')).not.toBeNull();
  expect(dialog.querySelector("h2")?.textContent).toBe("Included paper");
  expect(dialog.querySelector(".project-reader-header")).toBeNull();
  expect(dialog.textContent).not.toContain("No abstract is available for this paper.");
  expect(dialog.textContent).not.toContain("No notes yet.");
  mocks.paper.mockReturnValue({ data: { id: "p1", title: "Full paper title", authors: [{ displayName: "Researcher" }], abstractText: "Complete abstract", topics: [{ topicName: "Biology" }] }, isLoading: false, isError: false });
  await render(workspace({ papers: [included] }));
  expect(dialog.querySelector(".project-reader-loading")).toBeNull();
  for (const text of ["Full paper title", "Researcher", "Complete abstract", "Biology", "No notes yet."]) expect(dialog.textContent).toContain(text);
  expect(dialog.querySelector(".project-paper-analysis")).toBeNull();
});
it("shows the summary and honest unavailable state after paper loading fails", async () => {
  mocks.paper.mockReturnValue({ data: undefined, isLoading: false, isError: true });
  await render(workspace({ papers: [included] }));
  await click("Read Included paper");
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.querySelector(".project-reader-loading")).toBeNull();
  expect(dialog.textContent).toContain("Could not load the full paper record. Showing the project summary instead.");
  expect(dialog.querySelector("h2")?.textContent).toBe("Included paper");
  expect(dialog.textContent).toContain("No abstract is available for this paper.");
});
it("opens an analyzed source deep link and clears its source parameter on reader close", async () => {
  function Location() { const [params] = useSearchParams(); return <output>{params.toString()}</output>; }
  await render(<>{workspace({ papers: [included, undecided] })}<Location /></>, "/projects/project?tab=papers&source=p2");
  expect(document.querySelector('[role="dialog"] h2')?.textContent).toBe("Unscreened paper");
  expect(mocks.paper).toHaveBeenLastCalledWith("p2");
  await click("Close"); await flushQueries();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(container.querySelector("output")?.textContent).toBe("tab=papers");
});
it("resolves an analyzed source UUID while the library exposes its legacy paper identifier", async () => {
  const legacy = { ...undecided, targetId: { id: "canonical-paper", _id: "legacy-paper", title: "Unscreened paper", authors: [] } };
  await render(workspace({ papers: [legacy] }), "/projects/project?tab=papers&source=canonical-paper");
  expect(document.querySelector('[role="dialog"] h2')?.textContent).toBe("Unscreened paper");
  expect(mocks.paper).toHaveBeenLastCalledWith("legacy-paper");
});
it("keeps bulk selection separate from opening a paper", async () => {
  await render(workspace({ papers: [included, undecided] }));
  await act(async () => container.querySelector<HTMLInputElement>('[aria-label="Select Included paper for bulk actions"]')!.click());
  expect(container.textContent).toContain("1 selected");
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(mocks.paper).toHaveBeenLastCalledWith(undefined);
});
it("retains the open paper after screening moves it out of the filter", async () => {
  await render(workspace({ papers: [undecided] }));
  await chooseGroup("Not reviewed");
  await click("Read Unscreened paper");
  await click("Relevant");
  await render(workspace({ papers: [{ ...undecided, screeningStatus: "INCLUDED" }] }));
  expect(document.querySelector('[role="dialog"] h2')?.textContent).toBe("Unscreened paper");
  expect(container.querySelector('[aria-label="Read Unscreened paper"]')).toBeNull();
  await click("Close");
  await flushQueries();
  expect(document.activeElement).toBe(container.querySelector('input[aria-label="Search title, author, year, or venue"]'));
});
it("allows archived papers to be read while keeping reader mutations disabled", async () => {
  await render(workspace({ papers: [included], readOnly: true }));
  await click("Read Included paper");
  const dialog = document.querySelector('[role="dialog"]')!;
  const buttons = [...dialog.querySelectorAll<HTMLButtonElement>("button")];
  for (const label of ["Relevant", "Considering", "Not relevant", "Add note"]) expect(buttons.find(button => button.textContent === label)?.disabled).toBe(true);
  expect(dialog.querySelector<HTMLSelectElement>('select[aria-label="Reading status"]')?.disabled).toBe(true);
  expect(mocks.update).not.toHaveBeenCalled();
});
it("filters each relevance outcome directly and keeps reading progress separate", async () => {
  const excluded = { ...undecided, id: "link3", targetId: { _id: "p3", title: "Excluded paper", authors: [] }, screeningStatus: "EXCLUDED" } as IProject["papers"][number];
  const considering = { ...undecided, id: "link4", targetId: { _id: "p4", title: "Considering paper", authors: [] }, screeningStatus: "MAYBE" } as IProject["papers"][number];
  await render(workspace({ papers: [included, { ...undecided, readingStatus: "REVIEWED" }, excluded, considering] }));
  expect(container.querySelector('.project-literature-groups')?.textContent).toContain("Relevant 1");
  await chooseGroup("Not reviewed");
  expect(container.querySelectorAll(".project-paper-row")).toHaveLength(1);
  expect(container.querySelector(".project-paper-list")?.textContent).toContain("Unscreened paper");
  await chooseGroup("Considering");
  expect(container.querySelector(".project-paper-list")?.textContent).toContain("Considering paper");
  await chooseGroup("Relevant");
  expect(container.querySelectorAll(".project-paper-row")).toHaveLength(1);
  expect(container.querySelector(".project-paper-list")?.textContent).toContain("Included paper");
  await chooseGroup("Not relevant");
  expect(container.querySelectorAll(".project-paper-row")).toHaveLength(1);
  expect(container.querySelector(".project-paper-list")?.textContent).toContain("Excluded paper");
});
it("moves a paper between review groups after a saved decision", async () => {
  await render(workspace({ papers: [undecided] }));
  await chooseGroup("Not reviewed");
  const decision = container.querySelector<HTMLSelectElement>('[aria-label="Relevance of Unscreened paper"]')!;
  await act(async () => { decision.value = "MAYBE"; decision.dispatchEvent(new Event("change", { bubbles: true })); });
  await render(workspace({ papers: [{ ...undecided, screeningStatus: "MAYBE" }] }));
  expect(container.querySelectorAll(".project-paper-row")).toHaveLength(0);
  await chooseGroup("Considering");
  expect(container.querySelectorAll(".project-paper-row")).toHaveLength(1);
  const considering = container.querySelector<HTMLSelectElement>('[aria-label="Relevance of Unscreened paper"]')!;
  await act(async () => { considering.value = "INCLUDED"; considering.dispatchEvent(new Event("change", { bubbles: true })); });
  await render(workspace({ papers: [{ ...undecided, screeningStatus: "INCLUDED" }] }));
  expect(container.querySelectorAll(".project-paper-row")).toHaveLength(0);
  await chooseGroup("Relevant");
  expect(container.querySelectorAll(".project-paper-row")).toHaveLength(1);
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
it("supports keyboard navigation within and between project section groups", async () => {
  function Fixture() { const [tab, setTab] = useState<ProjectTab>("papers"); return <ProjectSectionNav activeTab={tab} onChange={setTab} paperCount={0} memberCount={1} />; }
  await render(<Fixture />);
  expect(container.querySelector('[role="tablist"]')?.getAttribute("aria-orientation")).toBe("vertical");
  await act(async () => container.querySelector("#project-tab-papers")!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })));
  expect(container.querySelector('[role="tab"][aria-selected="true"]')?.id).toBe("project-tab-overview");
  await act(async () => container.querySelector("#project-tab-overview")!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
  expect(document.activeElement?.id).toBe("project-tab-papers");
  await act(async () => container.querySelector("#project-tab-papers")!.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })));
  expect(container.querySelector('[role="tab"][aria-selected="true"]')?.id).toBe("project-tab-plan");
  expect(document.activeElement?.id).toBe("project-tab-plan");
  await act(async () => container.querySelector<HTMLButtonElement>("#project-tab-submissions")!.click());
  await act(async () => container.querySelector("#project-tab-submissions")!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
  expect(document.activeElement?.id).toBe("project-tab-members");
  expect(container.querySelector('[role="tab"][aria-selected="true"]')?.id).toBe("project-tab-members");
});

it("reveals a selected section without moving focus out of the workspace navigation", async () => {
  function Fixture() { const [tab, setTab] = useState<ProjectTab>("papers"); return <ProjectSectionNav activeTab={tab} onChange={setTab} paperCount={0} memberCount={1} />; }
  await render(<Fixture />);
  const last = container.querySelector<HTMLElement>("#project-tab-plan")!;
  const reveal = vi.fn(); last.scrollIntoView = reveal;
  await act(async () => container.querySelector("#project-tab-papers")!.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })));
  expect(reveal).toHaveBeenCalledWith({ block: "nearest", inline: "nearest", behavior: "smooth" });
  expect(document.activeElement).toBe(last);
  await act(async () => last.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true })));
  expect(container.querySelector('[aria-selected="true"]')?.id).toBe("project-tab-overview");
});

it("changes sections through the mobile select", async () => {
  function Fixture() { const [tab, setTab] = useState<ProjectTab>("papers"); return <ProjectSectionNav activeTab={tab} onChange={setTab} paperCount={0} memberCount={1} />; }
  await render(<Fixture />);
  const select = container.querySelector<HTMLSelectElement>("#project-section-select")!;
  await act(async () => { select.value = "submissions"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(select.getAttribute("aria-controls")).toBe("project-panel-submissions");
  expect(container.querySelector('[aria-selected="true"]')?.id).toBe("project-tab-submissions");
});
