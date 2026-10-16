// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ResearchEvidence } from "../components/research-evidence";
import { ResearchGapEvaluation } from "../components/research-gap-evaluation";
import { WorkspaceArtifactLink } from "../components/workspace-common";

const mocks = vi.hoisted(() => Object.fromEntries(["evidence", "library", "suggestions", "createEvidence", "editEvidence", "reviewEvidence", "evidenceHistory", "gap", "assessGap", "linkEvidence", "guidance", "plan"].map(key => [key, vi.fn()])));
vi.mock("../api/project-research.api", () => ({ researchApi: mocks }));
vi.mock("../api/workspace.api", () => ({ workspaceApi: { plan: mocks.plan } }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (state: { user: { id: string } }) => unknown) => select({ user: { id: "actor" } }) }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ language: "en", t: (key: string) => key }) }));
const page = { items: [], total: 0, page: 1, pageSize: 20, hasNext: false };
const content = { claim: "A reported finding", quotation: "", locator: "", context: "University", methodology: "Interviews", population: "24 participants", results: "Mixed", limitations: "Single site", themes: ["transfer"] };
const item = { ...content, id: "e1", paperId: "paper", projectId: "p", version: 1, origin: "AI_SUGGESTED", reviewState: "PENDING", sourceTitle: "Source study", sourceSnapshot: {}, reviewRationale: "" };
const gap = { gap: { id: "g", version: 3, title: "A bounded gap", description: "Single site limitation", rationale: "Lacks replication", assumptions: "", assessmentStatus: "PROPOSED", assessmentRationale: "" }, evidence: [], questions: [], history: [], discussions: [], guidance: [], canContribute: true };
let root: Root, container: HTMLDivElement, client: QueryClient;
async function render(node: ReactNode, path = "/projects/p?tab=papers&view=evidence") {
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{node}</MemoryRouter></QueryClientProvider>));
  await settle();
}
async function settle() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); }); }
async function click(text: string) { const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === text); expect(button, text).toBeDefined(); await act(async () => button!.click()); await settle(); }
async function fill(label: string, value: string) {
  const input = [...container.querySelectorAll("label")].find(item => item.textContent?.startsWith(label))?.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input,textarea,select"); expect(input, label).toBeDefined();
  await act(async () => { const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value); input!.dispatchEvent(new Event(input instanceof HTMLSelectElement ? "change" : "input", { bubbles: true })); }); await settle();
}
async function submit() { await act(async () => container.querySelector("form.research-editor")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); await settle(); }
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.resetAllMocks(); Object.values(mocks).forEach(mock => mock.mockResolvedValue(undefined));
  mocks.evidence!.mockResolvedValue(page); mocks.evidenceHistory!.mockResolvedValue([]); mocks.library!.mockResolvedValue({ ...page, items: [{ paperId: "paper", title: "Source study" }] }); mocks.suggestions!.mockResolvedValue([]); mocks.gap!.mockResolvedValue(gap); mocks.plan!.mockResolvedValue({ version: 1, canEdit: true });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } }); container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("shows AI provenance and a distinct human review action without trusting a suggestion on save", async () => {
  mocks.suggestions!.mockResolvedValue([{ corpusPaperId: "cp", paperId: "paper", content }]);
  await render(<ResearchEvidence projectId="p" readOnly={false} />); await click("Extract evidence"); await fill("Source paper", "paper"); await click("Use suggestion as draft");
  expect(container.textContent).toContain("It remains unreviewed after saving");
  await submit(); expect(mocks.createEvidence).toHaveBeenCalledWith("p", expect.objectContaining({ claim: content.claim, origin: "AI_SUGGESTED", corpusPaperId: "cp" })); expect(mocks.reviewEvidence).not.toHaveBeenCalled();
});
it("explains why extraction has no eligible sources and prevents saving without one", async () => {
  mocks.library!.mockResolvedValue(page);
  await render(<ResearchEvidence projectId="p" readOnly={false} />); await click("Extract evidence");
  expect(container.querySelector('[role="status"]')?.textContent).toContain("include a source in Screening first");
  const save = [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Save extraction for review");
  expect(save?.disabled).toBe(true); expect(mocks.createEvidence).not.toHaveBeenCalled();
});
it("keeps a failed extraction draft, including comma-separated themes, for correction and retry", async () => {
  mocks.createEvidence!.mockRejectedValue(new Error("Conflict")); await render(<ResearchEvidence projectId="p" readOnly={false} />); await click("Extract evidence"); await fill("Source paper", "paper"); await fill("Finding or claim", "My retained interpretation"); await fill("Research themes", "transfer, replication,"); await submit();
  const textarea = container.querySelector<HTMLTextAreaElement>("textarea"); expect(textarea?.value).toBe("My retained interpretation"); expect(container.querySelector('[role="alert"]')).not.toBeNull(); expect(mocks.createEvidence).toHaveBeenCalledWith("p", expect.objectContaining({ themes: ["transfer", "replication"] }));
});
it("reviews the version the human opened even if a collaborator changes the extraction during review", async () => {
  mocks.evidence!.mockResolvedValue({ ...page, items: [item] }); await render(<ResearchEvidence projectId="p" readOnly={false} />); await click("Review extraction"); await fill("Review rationale", "I read the source");
  await act(async () => client.setQueryData(["project-research", "actor", "p", "evidence", "", "", 1], { ...page, items: [{ ...item, version: 2, claim: "Another person's interpretation" }] }));
  await click("Accept extraction"); expect(mocks.reviewEvidence).toHaveBeenCalledWith("p", "e1", expect.objectContaining({ expectedVersion: 1, state: "ACCEPTED" }));
});
it("keeps read-only evidence free of edit actions and renders research text safely", async () => {
  mocks.evidence!.mockResolvedValue({ ...page, items: [{ ...item, claim: "<script>untrusted()</script>", relatedQuestions: [{ id: "q", text: "Does it replicate?" }] }] }); await render(<ResearchEvidence projectId="p" readOnly />);
  expect(container.textContent).toContain("<script>untrusted()</script>"); expect(container.querySelector("script")).toBeNull(); expect(container.textContent).toContain("AI suggestion, preserved provenance"); expect(container.textContent).toContain("Awaiting human review"); expect(container.textContent).not.toContain("Review extraction"); expect(container.querySelector('a[href="/projects/p?tab=plan"]')?.textContent).toBe("Does it replicate?");
});
it("opens a linked extraction, shows its related gap and can return to the full matrix", async () => {
  mocks.evidence!.mockResolvedValue({ ...page, items: [{ ...item, relatedGaps: [{ id: "g", title: "The linked gap" }] }] });
  await render(<ResearchEvidence projectId="p" readOnly />, "/projects/p?tab=papers&view=evidence&evidence=e1");
  expect(mocks.evidence).toHaveBeenCalledWith("p", expect.objectContaining({ itemId: "e1", page: 1, q: "", state: undefined }));
  expect(container.querySelector('input[type="search"]')).toBeNull();
  expect(container.querySelector('a[href="/gaps/g"]')?.textContent).toBe("The linked gap");
  await click("Show all evidence");
  expect(mocks.evidence).toHaveBeenLastCalledWith("p", expect.objectContaining({ itemId: undefined }));
  expect(container.querySelector('input[type="search"]')).not.toBeNull();
});
it("routes old evidence records to their original gap instead of displaying an extraction empty state", async () => {
  mocks.evidence!.mockResolvedValue({ ...page, legacyGapId: "g" });
  await render(<ResearchEvidence projectId="p" readOnly />, "/projects/p?tab=papers&view=evidence&evidence=old");
  expect(container.querySelector('a[href="/gaps/g"]')?.textContent).toBe("View the original gap evidence record");
  expect(container.textContent).not.toContain("Start with an included source");
});
it("preserves an evidence artifact ID in the project matrix destination", async () => {
  await render(<WorkspaceArtifactLink projectId="p" link={{ kind: "EVIDENCE", id: "e1" }} />);
  expect(container.querySelector("a")?.getAttribute("href")).toBe("/projects/p?tab=papers&view=evidence&evidence=e1");
});
it("does not rebase a drafted team assessment onto a newer gap revision", async () => {
  await render(<ResearchGapEvaluation projectId="p" gapId="g" />); await fill("Assessment rationale", "A cautiously scoped direction");
  await act(async () => client.setQueryData(["project-research", "actor", "p", "gap", "g"], { ...gap, gap: { ...gap.gap, version: 4 } }));
  mocks.assessGap!.mockRejectedValue(new Error("Conflict")); await click("Save team assessment"); expect(mocks.assessGap).toHaveBeenCalledWith("p", "g", expect.objectContaining({ expectedVersion: 3 })); expect(container.textContent).toContain("A cautiously scoped direction");
});
it("shows source changes and counterevidence without presenting team support as scientific proof", async () => {
  mocks.gap!.mockResolvedValue({ ...gap, evidence: [{ id: "link", evidenceKind: "COUNTER", sourceTitle: "Contradictory study", explanation: "Different reported result", sourceChanged: true, reviewed: true }] }); await render(<ResearchGapEvaluation projectId="p" gapId="g" />);
  expect(container.textContent).toContain("not scientific proof"); expect(container.textContent).toContain("Contradictory study"); expect(container.textContent).toContain("The source or extraction changed");
});
it("opens scoped mentor feedback and preserves the revision the author started commenting on", async () => {
  await render(<ResearchGapEvaluation projectId="p" gapId="g" />);
  await click("Request mentor feedback");
  const textarea = [...container.querySelectorAll("label")].find(label => label.textContent?.startsWith("Feedback or request"))?.querySelector("textarea");
  expect(document.activeElement).toBe(textarea);
  expect(textarea?.closest("details")?.open).toBe(true);
  await fill("Feedback or request", "Can you challenge the population assumption?");
  await act(async () => client.setQueryData(["project-research", "actor", "p", "gap", "g"], { ...gap, gap: { ...gap.gap, version: 4 } }));
  mocks.guidance!.mockRejectedValue(new Error("The candidate changed"));
  await click("Send feedback or request");
  expect(mocks.guidance).toHaveBeenCalledWith("p", "g", expect.objectContaining({ expectedVersion: 3 }));
  expect(textarea?.value).toBe("Can you challenge the population assumption?");
});
it("lets mentors comment on the candidate without loading team-only edit resources", async () => {
  await render(<ResearchGapEvaluation projectId="p" gapId="g" mentor />);
  expect(mocks.plan).not.toHaveBeenCalled(); expect(mocks.evidence).not.toHaveBeenCalled();
  expect(container.textContent).toContain("A bounded gap");
  expect(container.textContent).toContain("Feedback or request");
  expect(container.textContent).not.toContain("Save team assessment");
  expect(container.textContent).not.toContain("Save candidate revision");
});
