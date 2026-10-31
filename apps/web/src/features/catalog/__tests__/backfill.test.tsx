// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TaxonomyLevel, TaxonomyNodeDetail, TopicBackfillRun } from "@trend/shared-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

const mocks = vi.hoisted(() => ({ adminRequest: vi.fn(), adminRuns: vi.fn(), getRun: vi.fn(), node: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/i18n", () => ({
  useI18n: () => ({
    language: "en",
    t: (key: string, values?: Record<string, string | number>) => key.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(values?.[name] ?? "")),
  }),
}));
vi.mock("@/features/topic-backfill/api/topic-backfill.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/topic-backfill/api/topic-backfill.api")>()),
  topicBackfillApi: { adminRequest: mocks.adminRequest, adminRuns: mocks.adminRuns, getRun: mocks.getRun },
}));
vi.mock("../hooks/use-taxonomy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hooks/use-taxonomy")>()),
  useTaxonomyNode: mocks.node,
  useUpdateTaxonomyNode: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { BackfillDialog, parseBackfillBudget } from "../components/backfill-dialog";
import { BackfillRunsSection } from "../components/backfill-runs-section";
import { NodeDetailSheet } from "../components/node-detail-sheet";

const run = (overrides: Partial<TopicBackfillRun> = {}): TopicBackfillRun => ({
  id: "run-1", targetKind: "tag", targetId: "tag-1", targetName: "Machine learning", state: "completed", trigger: "admin",
  maxNewPapers: 100, paperCountBefore: 10, fetchedCount: 160, insertedCount: 42, skippedCount: 118, rejectedCount: 0, pagesFetched: 4,
  errorMessage: null, startedAt: "2026-10-30T08:00:00Z", finishedAt: "2026-10-30T08:03:00Z", createdAt: "2026-10-30T07:59:00Z", ...overrides,
});
const page = (runs: TopicBackfillRun[]) => ({ data: runs, meta: { page: 1, pageSize: 5, total: runs.length, totalPages: 1 } });
const apiError = (status: number, code: string, message: string) => Object.assign(new Error(message), { response: { status, data: { error: { code, message } } } });

let root: Root, container: HTMLDivElement, client: QueryClient;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  for (const mock of Object.values(mocks)) mock.mockReset();
  vi.mocked(toast.success).mockReset();
  vi.mocked(toast.error).mockReset();
  mocks.adminRuns.mockResolvedValue(page([]));
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
  vi.useRealTimers();
});

async function render(element: React.ReactNode) {
  await act(async () => root.render(
    <QueryClientProvider client={client}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{element}</MemoryRouter>
    </QueryClientProvider>,
  ));
  await tick(0);
}
const tick = (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
const button = (text: string) => Array.from(document.querySelectorAll("button")).find((item) => item.textContent?.trim() === text);
const click = async (element: Element | undefined) => { await act(async () => { (element as HTMLElement).click(); }); await tick(0); };
async function typeBudget(value: string) {
  await act(async () => {
    const input = document.querySelector<HTMLInputElement>("#backfill-max-papers")!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const input = () => document.querySelector<HTMLInputElement>("#backfill-max-papers")!;

describe("parseBackfillBudget", () => {
  it("accepts whole numbers from 1 to 1000 only", () => {
    expect(["1", "100", " 1000 "].map(parseBackfillBudget)).toEqual([1, 100, 1000]);
    expect(["", "0", "1001", "-5", "12.5", "1e2", "abc"].map(parseBackfillBudget)).toEqual(Array(7).fill(undefined));
  });
});

describe("BackfillDialog", () => {
  const target = { kind: "tag" as const, id: "tag-1", name: "Machine learning" };

  it("opens with 100 papers and names the target", async () => {
    await render(<BackfillDialog target={target} onClose={vi.fn()} />);
    expect(input().value).toBe("100");
    const dialog = document.querySelector("[role='dialog']")!;
    expect(dialog.textContent).toContain("Fetch from OpenAlex");
    expect(dialog.textContent).toContain("Machine learning");
    expect(dialog.textContent).toContain("may take a few minutes");
    expect(dialog.textContent).toContain("New papers to import");
    expect((button("Start import") as HTMLButtonElement).disabled).toBe(false);
  });

  it.each(["0", "1001", "", "7.5"])("blocks the value %j and explains the range", async (value) => {
    await render(<BackfillDialog target={target} onClose={vi.fn()} />);
    await typeBudget(value);
    expect((button("Start import") as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelector("[role='alert']")?.textContent).toBe("Enter a whole number from 1 to 1000.");
    await act(async () => { document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(mocks.adminRequest).not.toHaveBeenCalled();
  });

  it("sends the chosen budget, reports the run and closes", async () => {
    const started = run({ state: "queued" });
    mocks.adminRequest.mockResolvedValue({ run: started, created: true });
    const onClose = vi.fn();
    const onStarted = vi.fn();
    await render(<BackfillDialog target={target} onClose={onClose} onStarted={onStarted} />);
    await typeBudget("250");
    await click(button("Start import"));
    expect(mocks.adminRequest).toHaveBeenCalledWith({ targetKind: "tag", targetId: "tag-1", maxNewPapers: 250 });
    expect(onStarted).toHaveBeenCalledWith(started, true);
    expect(onClose).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Import started for “Machine learning”. It runs in the background.");
  });

  it("tells the admin when the request attached to a running import", async () => {
    mocks.adminRequest.mockResolvedValue({ run: run({ state: "running" }), created: false });
    await render(<BackfillDialog target={target} onClose={vi.fn()} />);
    await click(button("Start import"));
    expect(toast.success).toHaveBeenCalledWith("An import for “Machine learning” is already running.");
  });

  it("shows a clear toast for a tag without include rules and stays open", async () => {
    mocks.adminRequest.mockRejectedValue(apiError(409, "TAG_HAS_NO_INCLUDE_RULES", "Tag has no include rules"));
    const onClose = vi.fn();
    await render(<BackfillDialog target={target} onClose={onClose} />);
    await click(button("Start import"));
    expect(toast.error).toHaveBeenCalledWith("Add an include rule first.");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows the server message for other errors", async () => {
    mocks.adminRequest.mockRejectedValue(apiError(429, "TOPIC_BACKFILL_DAILY_LIMIT", "Daily limit reached"));
    await render(<BackfillDialog target={{ kind: "keyword", id: "k1", name: "Deep learning" }} onClose={vi.fn()} />);
    await click(button("Start import"));
    expect(toast.error).toHaveBeenCalledWith("Daily limit reached");
    expect(mocks.adminRequest).toHaveBeenCalledWith({ targetKind: "keyword", targetId: "k1", maxNewPapers: 100 });
  });

  it("renders nothing without a target", async () => {
    await render(<BackfillDialog target={undefined} onClose={vi.fn()} />);
    expect(document.querySelector("[role='dialog']")).toBeNull();
  });
});

describe("BackfillRunsSection", () => {
  it("queries the latest five runs of the target and says when there are none", async () => {
    await render(<BackfillRunsSection targetKind="tag" targetId="tag-1" />);
    expect(mocks.adminRuns).toHaveBeenCalledWith({ targetKind: "tag", targetId: "tag-1", page: 1, pageSize: 5 }, expect.anything());
    expect(container.textContent).toContain("OpenAlex imports");
    expect(container.textContent).toContain("No imports yet.");
  });

  it("shows state, dates, counters, budget, trigger and the error of a failed run", async () => {
    mocks.adminRuns.mockResolvedValue(page([
      run(),
      run({ id: "run-2", state: "failed", trigger: "search", insertedCount: 3, errorMessage: "OpenAlex returned 503", finishedAt: null }),
      run({ id: "run-3", state: "running", startedAt: null, finishedAt: null, insertedCount: 0, maxNewPapers: 1000 }),
    ]));
    await render(<BackfillRunsSection targetKind="tag" targetId="tag-1" />);
    const items = Array.from(container.querySelectorAll("[data-testid='backfill-run']"));
    expect(items).toHaveLength(3);
    expect(items[0]!.textContent).toContain("Completed");
    expect(items[0]!.textContent).toContain("Started by an admin");
    expect(items[0]!.textContent).toMatch(/New papers42/);
    expect(items[0]!.textContent).toMatch(/Skipped118/);
    expect(items[0]!.textContent).toMatch(/Pages4/);
    expect(items[0]!.textContent).toMatch(/Budget100/);
    expect(items[0]!.textContent).toMatch(/Started[A-Z][a-z]{2} 30, 2026/);
    expect(items[0]!.querySelector("[role='alert']")).toBeNull();
    expect(items[1]!.textContent).toContain("Failed");
    expect(items[1]!.textContent).toContain("Requested from search");
    expect(items[1]!.querySelector("[role='alert']")?.textContent).toBe("OpenAlex returned 503");
    expect(items[2]!.textContent).toContain("Running");
    expect(items[2]!.textContent).toMatch(/Budget1,000/);
    expect(items[2]!.textContent).toMatch(/Started-/);
  });

  it("never lists more than five runs", async () => {
    mocks.adminRuns.mockResolvedValue(page(Array.from({ length: 7 }, (_, index) => run({ id: `run-${index}` }))));
    await render(<BackfillRunsSection targetKind="topic" targetId="n1" embedded />);
    expect(container.querySelectorAll("[data-testid='backfill-run']")).toHaveLength(5);
    expect(container.querySelector("h3")?.textContent).toBe("OpenAlex imports");
  });

  it("offers a retry when the history cannot be loaded", async () => {
    mocks.adminRuns.mockRejectedValueOnce(new Error("down")).mockResolvedValue(page([run()]));
    await render(<BackfillRunsSection targetKind="tag" targetId="tag-1" />);
    expect(container.querySelector("[role='alert']")).not.toBeNull();
    await click(button("Retry"));
    expect(container.querySelectorAll("[data-testid='backfill-run']")).toHaveLength(1);
  });

  it("polls while a run is live, then refreshes the tag and taxonomy queries once it ends", async () => {
    vi.useFakeTimers();
    mocks.adminRuns
      .mockResolvedValueOnce(page([run({ state: "running", insertedCount: 5, finishedAt: null })]))
      .mockResolvedValue(page([run({ state: "completed", insertedCount: 20 })]));
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await act(async () => root.render(
      <QueryClientProvider client={client}><MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><BackfillRunsSection targetKind="tag" targetId="tag-1" /></MemoryRouter></QueryClientProvider>,
    ));
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(container.textContent).toContain("Running");
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ["admin", "tags"] });

    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(container.textContent).toContain("Completed");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin", "tags"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin", "taxonomy"] });
    const calls = mocks.adminRuns.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(mocks.adminRuns.mock.calls.length).toBe(calls);
  });
});

describe("NodeDetailSheet fetch action", () => {
  const node = (level: TaxonomyLevel): TaxonomyNodeDetail => ({
    id: `${level}-1`, level, name: `The ${level}`, description: null, openalexId: "T1", parentId: null, aliases: [],
    worksCount: 5000, paperCount: 2, status: "active", childCount: 0, syncedAt: null,
    ancestors: [], children: [], openalexKeywords: [],
  });
  async function open(level: TaxonomyLevel) {
    mocks.node.mockReturnValue({ data: node(level), isError: false });
    await render(<NodeDetailSheet nodeId={`${level}-1`} onSelectNode={vi.fn()} onBrowseChildren={vi.fn()} onClose={vi.fn()} />);
  }

  it.each(["topic", "subfield"] as const)("shows the button and the import history for a %s", async (level) => {
    await open(level);
    expect(button("Fetch from OpenAlex")).toBeDefined();
    expect(mocks.adminRuns).toHaveBeenCalledWith({ targetKind: level, targetId: `${level}-1`, page: 1, pageSize: 5 }, expect.anything());
    expect(document.body.textContent).toContain("OpenAlex imports");
    await click(button("Fetch from OpenAlex"));
    const dialog = document.querySelector("[role='dialog'][data-state='open'] #backfill-max-papers");
    expect(dialog).not.toBeNull();
    mocks.adminRequest.mockResolvedValue({ run: run({ state: "queued", targetKind: level }), created: true });
    await click(button("Start import"));
    expect(mocks.adminRequest).toHaveBeenCalledWith({ targetKind: level, targetId: `${level}-1`, maxNewPapers: 100 });
  });

  it.each(["domain", "field"] as const)("has neither the button nor the history for a %s", async (level) => {
    await open(level);
    expect(document.body.textContent).toContain(`The ${level}`);
    expect(button("Fetch from OpenAlex")).toBeUndefined();
    expect(mocks.adminRuns).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("OpenAlex imports");
  });
});
