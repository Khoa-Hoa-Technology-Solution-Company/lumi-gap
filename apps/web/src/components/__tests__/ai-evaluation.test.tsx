// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), success: vi.fn(), language: "en" }));
vi.mock("@/services/api-client", () => ({ api: { get: mocks.get, post: mocks.post } }));
vi.mock("sonner", () => ({ toast: { success: mocks.success } }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ language: mocks.language, t: (key: string, values?: Record<string, string | number>) => key.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(values?.[name] ?? "")) }) }));
import { AiEvaluation } from "../ai-evaluation";
import { makeQualityEvaluation } from "./quality-evaluation.fixture";

let container: HTMLDivElement; let root: Root;
const response = (data: unknown) => ({ data: { success: true, data } });
const click = async (label: string, scope: ParentNode = document) => {
  const button = [...scope.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.includes(label));
  expect(button, label).toBeDefined();
  await act(async () => button!.click());
};
beforeEach(() => {
  vi.resetAllMocks(); mocks.language = "en";
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  HTMLElement.prototype.scrollIntoView = vi.fn();
  mocks.get.mockResolvedValue(response({ ratingSummary: { count: 0, avg: 0 } }));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const render = (props = {}) => act(async () => root.render(<AiEvaluation targetKind="paper" targetId="paper-a" {...props} />));

describe("AI quality assessment reading flow", () => {
  it("lets a reader inspect target-specific questions and anchors before starting AI", async () => {
    await render(); await click("View criteria and scoring scale");
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("Clarity of the research problem");
    expect(dialog.textContent).toContain("Does the abstract connect its claims");
    expect(dialog.querySelectorAll("details")).toHaveLength(3);
    expect(mocks.post).not.toHaveBeenCalled();
  });
  it("opens evidence, missing information, next steps, questions and the score explanation", async () => {
    mocks.get.mockResolvedValue(response({ evaluation: makeQualityEvaluation() }));
    await render(); await click("View detailed assessment");
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("Why this assessment");
    expect(dialog.querySelector("blockquote")?.textContent).toContain("120 students");
    expect(dialog.textContent).toContain("Group assignment and baseline comparability");
    expect(dialog.textContent).toContain("An evidence table with allocation");
    expect(dialog.textContent).toContain("Does guided feedback transfer");
    expect(dialog.textContent).toContain("3.3/5");
  });
  it("does not invent detailed evidence for legacy scores", async () => {
    const legacy = makeQualityEvaluation(); delete legacy.details; legacy.freshness = "legacy";
    mocks.get.mockResolvedValue(response({ evaluation: legacy }));
    await render(); expect(container.textContent).toContain("This older evaluation");
    await click("View detailed assessment");
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Older evaluation");
    expect(document.querySelectorAll("blockquote")).toHaveLength(0);
  });
  it("resumes an existing task and shows the completed assessment", async () => {
    mocks.get.mockResolvedValueOnce(response({ evaluationTask: { status: "queued", jobId: "task" } })).mockResolvedValueOnce(response({ status: "completed", evaluation: makeQualityEvaluation() }));
    await render();
    expect(mocks.get).toHaveBeenCalledWith("/quality/evaluation-jobs/task", expect.any(Object));
    expect(container.textContent).toContain("Check group assignment");
    expect(mocks.success).toHaveBeenCalledOnce();
    expect(mocks.post).not.toHaveBeenCalled();
  });
  it("keeps the saved assessment visible if a new evaluation fails", async () => {
    mocks.get.mockResolvedValueOnce(response({ evaluation: makeQualityEvaluation() })).mockResolvedValueOnce(response({ status: "failed", error: "Quota exhausted" }));
    mocks.post.mockResolvedValue(response({ status: "queued", jobId: "new-task" }));
    await render(); await click("Re-evaluate");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Quota exhausted");
    expect(container.textContent).toContain("The abstract describes a comparison");
  });
  it("shows insufficient evidence without turning it into a zero score", async () => {
    const evaluation = makeQualityEvaluation(); evaluation.overall = null; evaluation.groundedness = null;
    evaluation.details!.criteria[1]!.score = null; evaluation.details!.criteria[1]!.status = "insufficient_evidence";
    mocks.get.mockResolvedValue(response({ evaluation })); await render();
    expect(container.textContent).toContain("Insufficient evidence");
    expect(container.textContent).toContain("No overall score");
    expect(container.textContent).not.toContain("0/5");
  });
  it("ignores a late response after switching targets", async () => {
    let resolveOld!: (value: unknown) => void;
    mocks.get.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; })).mockResolvedValue(response({}));
    await render(); await render({ targetId: "paper-b" });
    await act(async () => resolveOld(response({ evaluation: makeQualityEvaluation() })));
    expect(container.textContent).not.toContain("The abstract describes a comparison");
  });
  it("keeps lazy list cards from requesting data and sends the selected evaluation language", async () => {
    mocks.language = "vi"; mocks.post.mockResolvedValue(response({ status: "completed", evaluation: makeQualityEvaluation() }));
    await render({ lazy: true }); expect(mocks.get).not.toHaveBeenCalled();
    await click("Evaluate Quality");
    expect(mocks.post).toHaveBeenCalledWith("/quality/evaluate", expect.objectContaining({ language: "vi" }), expect.any(Object));
  });
  it("reports load errors and respects a disabled target", async () => {
    mocks.get.mockRejectedValue(new Error("offline")); await render();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Unable to load");
    await render({ targetId: "paper-disabled", enabled: false, disabledHint: "No abstract" });
    expect(container.textContent).toContain("No abstract");
    const evaluate = [...container.querySelectorAll("button")].find((button) => button.textContent === "Evaluate Quality");
    expect(evaluate?.disabled).toBe(true);
  });
});
