// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), list: vi.fn(), addPaper: vi.fn(), success: vi.fn(), error: vi.fn(), language: "en" }));
vi.mock("@/services/api-client", () => ({ api: { get: mocks.get, post: mocks.post } }));
vi.mock("@/features/projects/api/projects.api", () => ({ projectsApi: { list: mocks.list, addPaper: mocks.addPaper } }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ language: mocks.language, t: (key: string, values?: Record<string, string | number>) => key.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(values?.[name] ?? "")) }) }));
import { AiEvaluation } from "../ai-evaluation";
import { PaperReadingContextCard } from "@/features/papers/components/paper-detail/paper-reading-context-card";
import { makeQualityEvaluation } from "./quality-evaluation.fixture";
import { makeProjectEvaluation, makeReadingContext, makeReadingEvaluation } from "./quality-reading-modes.fixture";

let container: HTMLDivElement; let root: Root;
const response = (data: unknown) => ({ data: { success: true, data } });
const project = (id: string, title: string, papers: unknown[] = []) => ({ _id: id, title, papers });
const click = async (label: string) => {
  const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.includes(label));
  expect(button, label).toBeDefined(); await act(async () => button!.click());
};
const selectProject = async (id: string) => {
  const select = container.querySelector("select")!;
  await act(async () => { select.value = id; select.dispatchEvent(new Event("change", { bubbles: true })); });
};
beforeEach(() => {
  vi.resetAllMocks(); mocks.language = "en"; vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  mocks.get.mockResolvedValue(response({ ratingSummary: { count: 0, avg: 0 } }));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const render = (props = {}, kind: "paper" | "report" = "paper") => act(async () => root.render(<MemoryRouter><AiEvaluation targetKind={kind} targetId="paper-a" {...props} /></MemoryRouter>));

describe("reference reading mode", () => {
  it("shows the reading card, purposes and caution above the criteria rows", async () => {
    mocks.get.mockResolvedValue(response({ evaluation: makeReadingEvaluation() })); await render();
    const text = container.textContent!;
    expect(container.querySelector('[aria-pressed="true"]')?.textContent).toBe("Reference reading");
    expect(text).toContain("Randomised comparison of two feedback methods");
    expect(text).toContain("Not stated in the abstract");
    expect(text).toContain("12% improvement in writing scores");
    expect(text).toContain("Read this paper to…"); expect(text).toContain("Learn the method"); expect(text).toContain("Suited for newcomers");
    expect(text).toContain("Group allocation is not described");
    expect(text.indexOf("Reading card")).toBeLessThan(text.indexOf("Clarity of the research problem"));
    expect(container.querySelectorAll("details blockquote").length).toBeGreaterThan(0);
    expect(text).not.toContain("has no reading card");
  });
  it("keeps the current view and prompts a re-evaluation for results without facts", async () => {
    mocks.get.mockResolvedValue(response({ evaluation: makeQualityEvaluation() })); await render();
    expect(container.textContent).toContain("has no reading card"); expect(container.textContent).not.toContain("Reading card");
    expect(container.textContent).toContain("Start with this step");
  });
  it("offers no mode switch for reports", async () => {
    mocks.get.mockResolvedValue(response({ evaluation: makeQualityEvaluation() })); await render({}, "report");
    expect(container.querySelector("[aria-pressed]")).toBeNull(); expect(container.textContent).not.toContain("has no reading card");
  });
});

describe("unverified facts and error codes", () => {
  it("shows an unverified fact with its value and a muted note, never as not stated", async () => {
    const evaluation = makeReadingEvaluation();
    evaluation.details!.facts!.setting = { status: "unverified", value: "A single urban university", evidence: null };
    mocks.get.mockResolvedValue(response({ evaluation })); await render();
    expect(container.textContent).toContain("A single urban university"); expect(container.textContent).toContain("Quote could not be verified");
    expect(container.textContent!.match(/Not stated in the abstract/g)).toHaveLength(2);
  });
  it("translates a failed saved task's error code in reference mode", async () => {
    mocks.get.mockResolvedValue(response({ evaluationTask: { status: "failed", error: "raw provider text", errorCode: "AI_EVALUATION_BUSY" } })); await render();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("The AI service is busy right now. Try again in a few minutes.");
  });
  it("translates the error envelope code of a rejected evaluate call and falls back for unknown codes", async () => {
    mocks.get.mockResolvedValue(response({ evaluation: makeReadingEvaluation() }));
    mocks.post.mockRejectedValueOnce({ response: { data: { error: { code: "AI_EVALUATION_QUOTA", message: "quota" } } } });
    await render(); await click("Re-evaluate");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("The AI quota is used up.");
    mocks.post.mockRejectedValueOnce({ response: { data: { error: { code: "SOMETHING_ELSE", message: "Server said no" } } } });
    await click("Re-evaluate");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Server said no");
  });
  it("translates a failed project job's error code", async () => {
    mocks.list.mockResolvedValue([project("project-1", "P")]);
    mocks.post.mockResolvedValue(response({ status: "queued", jobId: "job-x" }));
    mocks.get.mockImplementation(async (url: string) => url.startsWith("/quality/evaluation-jobs/") ? response({ status: "failed", errorCode: "AI_EVALUATION_INVALID_OUTPUT" }) : response({}));
    await render(); await click("For a project"); await selectProject("project-1"); await click("Evaluate for this project");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("could not be used");
  });
  it("keeps the badge and mode labels on one line", async () => {
    await render();
    expect(container.textContent).toContain("AI Advisory");
    expect([...container.querySelectorAll("span")].find((node) => node.textContent === "AI Advisory")?.className).toContain("whitespace-nowrap");
    expect([...container.querySelectorAll("[aria-pressed]")].every((node) => node.className.includes("whitespace-nowrap"))).toBe(true);
  });
});

describe("project mode", () => {
  it("explains and links to project creation when the reader has no project", async () => {
    mocks.list.mockResolvedValue([]); await render(); await click("For a project");
    expect(container.textContent).toContain("You have no project yet.");
    expect(container.querySelector('a[href="/projects"]')?.textContent).toBe("Create a project");
    expect(container.querySelector("select")).toBeNull();
  });
  it("posts the project id, polls the job and renders the project verdict", async () => {
    mocks.list.mockResolvedValue([project("project-1", "Feedback in writing classes")]);
    mocks.post.mockResolvedValue(response({ status: "queued", jobId: "job-p" }));
    mocks.get.mockImplementation(async (url: string) => url.startsWith("/quality/evaluation-jobs/") ? response({ status: "completed", projectEvaluation: makeProjectEvaluation() }) : response({ ratingSummary: { count: 0, avg: 0 } }));
    await render(); await click("For a project"); await selectProject("project-1");
    expect(mocks.get).toHaveBeenCalledWith("/quality/paper/paper-a", expect.objectContaining({ params: { language: "en", projectId: "project-1" } }));
    await click("Evaluate for this project");
    expect(mocks.post).toHaveBeenCalledWith("/quality/evaluate", expect.objectContaining({ targetKind: "paper", targetId: "paper-a", projectId: "project-1" }));
    expect(mocks.get).toHaveBeenCalledWith("/quality/evaluation-jobs/job-p", expect.any(Object));
    const text = container.textContent!;
    expect(text).toContain("Core paper"); expect(text).toContain("It tests the same feedback intervention");
    expect(text).toContain("Does guided feedback improve essay quality?"); expect(text).toContain("a 12% improvement");
    expect(text).toContain("Two-arm comparison"); expect(text).toContain("Only one university");
    expect(text).toContain("Suggest including"); expect(text).toContain("Studies an intervention on university writing");
  });
  it("adds the paper to the project through the projects API", async () => {
    mocks.list.mockResolvedValue([project("project-1", "Feedback in writing classes")]);
    mocks.addPaper.mockResolvedValue({});
    mocks.get.mockImplementation(async (url: string) => response(url === "/quality/paper/paper-a" ? { projectEvaluation: makeProjectEvaluation() } : {}));
    await render(); await click("For a project"); await selectProject("project-1");
    await click("Add to project");
    expect(mocks.addPaper).toHaveBeenCalledWith("project-1", { paperId: "paper-a" });
    expect(container.textContent).toContain("Added to project");
  });
  it("does not offer to add a paper that is already in the project", async () => {
    mocks.list.mockResolvedValue([project("project-1", "Feedback in writing classes", [{ targetId: "paper-a" }])]);
    mocks.get.mockImplementation(async (url: string) => response(url === "/quality/paper/paper-a" ? { projectEvaluation: makeProjectEvaluation({ verdict: "not_relevant", questionLinks: [], reusable: [], tensions: [] }) } : {}));
    await render(); await click("For a project"); await selectProject("project-1");
    expect(container.textContent).toContain("Not relevant to this project"); expect(container.textContent).toContain("Added to project");
    expect([...container.querySelectorAll("button")].some((button) => button.textContent === "Add to project")).toBe(false);
  });
});

describe("reading context card", () => {
  const renderCard = async (url = "/papers/paper-a?topic=writing%20feedback") => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[url]}><PaperReadingContextCard paperId="paper-a" /></MemoryRouter></QueryClientProvider>));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
  };
  it("loads on open with the arrival topic and lists what to read next", async () => {
    mocks.get.mockResolvedValue(response(makeReadingContext())); await renderCard();
    expect(mocks.get).toHaveBeenCalledWith("/quality/paper/paper-a/reading-context", expect.objectContaining({ params: { topic: "writing feedback" } }));
    const text = container.textContent!;
    expect(text).toContain("Topic: Writing feedback"); expect(text).toContain("1,240 papers");
    expect(text).toContain("Raw growth +14.2%"); expect(text).toContain("Not a trend test"); expect(text).toContain("3-year CAGR +9.5%"); expect(text).toContain("Paper published in 2022");
    expect(container.querySelector('[role="img"]')).not.toBeNull();
    expect(text).toContain("Newer work on the same topic"); expect(text).toContain("Most cited on the same topic");
    expect(container.querySelector('a[href="/papers/paper-b?topic=writing%20feedback"]')?.textContent).toBe("Automated feedback at scale");
  });
  it("sends the search query and renders nothing when there is no context", async () => {
    mocks.get.mockResolvedValue(response({ ...makeReadingContext(), trend: null, related: [] })); await renderCard("/papers/paper-a?q=essay");
    expect(mocks.get).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ params: { query: "essay" } }));
    expect(container.textContent).toBe("");
  });
  it("notes an incomplete year and hides a null CAGR", async () => {
    const context = makeReadingContext(); context.trend!.partialYear = 2024; context.trend!.cagr3yPct = null;
    mocks.get.mockResolvedValue(response(context)); await renderCard();
    expect(container.textContent).toContain("Data for 2024 is still incomplete"); expect(container.textContent).not.toContain("CAGR"); expect(container.textContent).toContain("Raw growth +14.2%");
  });
  it("hides itself when the request fails", async () => {
    mocks.get.mockRejectedValue(new Error("offline")); await renderCard(); expect(container.textContent).toBe("");
  });
});
