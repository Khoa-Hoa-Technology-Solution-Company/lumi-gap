// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TopicWatch, TopicWatchList } from "@trend/shared-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

const mocks = vi.hoisted(() => ({ list: vi.fn(), upsert: vi.fn(), update: vi.fn(), remove: vi.fn(), run: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/i18n", () => ({
  useI18n: () => ({
    language: "en",
    t: (key: string, values?: Record<string, string | number>) => key.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(values?.[name] ?? "")),
  }),
}));
vi.mock("../api/catalog.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/catalog.api")>()),
  topicWatchesApi: mocks,
}));

import { parseBacklogTarget, parseDailyMax, TopicWatchControl } from "../components/topic-watch-control";
import { TopicWatchesPanel } from "../components/topic-watches-panel";

const watch = (overrides: Partial<TopicWatch> = {}): TopicWatch => ({
  id: "w1", targetKind: "tag", targetId: "tag-1", targetName: "Machine learning", enabled: true, phase: "backlog",
  dailyMaxNewPapers: null, backlogTargetPapers: 500, backlogInserted: 120, insertedToday: 7, totalInserted: 120, totalSkipped: 3,
  lastWindowCompletedOn: null, lastRunAt: "2026-11-06T08:00:00Z", lastError: null, createdAt: "2026-11-01T08:00:00Z", ...overrides,
});
const list = (watches: TopicWatch[], overrides: Partial<TopicWatchList> = {}): TopicWatchList => ({ watches, dailyBudget: 1000, usedToday: 40, ...overrides });
const apiError = (status: number, code: string, message: string) => Object.assign(new Error(message), { response: { status, data: { error: { code, message } } } });

let root: Root, container: HTMLDivElement, client: QueryClient;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  for (const mock of Object.values(mocks)) mock.mockReset();
  vi.mocked(toast.success).mockReset();
  vi.mocked(toast.error).mockReset();
  mocks.list.mockResolvedValue(list([]));
  mocks.upsert.mockResolvedValue({ watch: watch(), created: true });
  mocks.update.mockResolvedValue(watch());
  mocks.run.mockResolvedValue({ queued: true });
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
});

const tick = (ms = 0) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
async function render(element: React.ReactNode) {
  await act(async () => root.render(
    <QueryClientProvider client={client}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{element}</MemoryRouter>
    </QueryClientProvider>,
  ));
  await tick();
}
const button = (text: string) => Array.from(document.querySelectorAll("button")).find((item) => item.textContent?.trim() === text) as HTMLButtonElement | undefined;
const click = async (element: Element | null | undefined) => { await act(async () => { (element as HTMLElement).click(); }); await tick(); };
const field = (suffix: string) => document.querySelector<HTMLInputElement>(`#topic-watch-w1-${suffix}`)!;
async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const switchEl = () => document.querySelector<HTMLInputElement>("input[role='switch']")!;

describe("watch input parsing", () => {
  it("accepts an empty daily cap as null and whole numbers of at least 1 only", () => {
    expect(["", "  ", "1", " 25 "].map(parseDailyMax)).toEqual([null, null, 1, 25]);
    expect(["0", "-1", "1.5", "abc", "1e3"].map(parseDailyMax)).toEqual(Array(5).fill(undefined));
  });

  it("accepts whole numbers of at least 0 for the backlog target", () => {
    expect(["0", "500"].map(parseBacklogTarget)).toEqual([0, 500]);
    expect(["", "-1", "2.5", "x"].map(parseBacklogTarget)).toEqual(Array(4).fill(undefined));
  });
});

describe("TopicWatchControl", () => {
  it("explains the follow and posts the entry when Follow is pressed", async () => {
    await render(<TopicWatchControl targetKind="tag" targetId="tag-1" />);
    expect(mocks.list).toHaveBeenCalledWith({ targetKind: "tag", targetId: "tag-1" });
    expect(container.textContent).toContain("older works first");
    mocks.list.mockResolvedValue(list([watch()]));
    await click(button("Follow"));
    expect(mocks.upsert).toHaveBeenCalledWith({ targetKind: "tag", targetId: "tag-1" });
    expect(toast.success).toHaveBeenCalledWith("Now following this entry.");
    expect(container.querySelector("[data-testid='topic-watch-progress']")?.textContent).toBe("120 / 500");
  });

  it("shows the API error when the entry cannot be followed", async () => {
    mocks.upsert.mockRejectedValue(apiError(409, "WATCH_TARGET_NOT_SEARCHABLE", "OpenAlex cannot be asked about this entry."));
    await render(<TopicWatchControl targetKind="tag" targetId="tag-1" />);
    await click(button("Follow"));
    expect(toast.error).toHaveBeenCalledWith("OpenAlex cannot be asked about this entry.");
  });

  it("shows phase, progress, totals and the last error of a followed entry", async () => {
    mocks.list.mockResolvedValue(list([watch({ lastError: "OpenAlex timed out" })]));
    await render(<TopicWatchControl targetKind="tag" targetId="tag-1" />);
    const text = container.textContent ?? "";
    expect(text).toContain("Reading older works");
    expect(text).toContain("120 / 500");
    expect(text).toContain("Inserted today7");
    expect(container.querySelector("[role='alert']")?.textContent).toBe("OpenAlex timed out");
    expect(switchEl().getAttribute("aria-label")).toBe("Follow Machine learning daily");
  });

  it("hides the backlog progress once the entry is tracking", async () => {
    mocks.list.mockResolvedValue(list([watch({ phase: "tracking" })]));
    await render(<TopicWatchControl targetKind="tag" targetId="tag-1" />);
    expect(container.textContent).toContain("Following new works");
    expect(container.querySelector("[data-testid='topic-watch-progress']")).toBeNull();
  });

  it("patches enabled when the switch is toggled", async () => {
    mocks.list.mockResolvedValue(list([watch()]));
    await render(<TopicWatchControl targetKind="tag" targetId="tag-1" />);
    expect(switchEl().checked).toBe(true);
    await click(switchEl());
    expect(mocks.update).toHaveBeenCalledWith("w1", { enabled: false });
  });

  it("enables Save only when the inputs changed and are valid", async () => {
    mocks.list.mockResolvedValue(list([watch()]));
    await render(<TopicWatchControl targetKind="tag" targetId="tag-1" />);
    expect(button("Save")!.disabled).toBe(true);

    await type(field("daily"), "0");
    expect(button("Save")!.disabled).toBe(true);
    expect(container.textContent).toContain("Enter a whole number of at least 1");

    await type(field("daily"), "25");
    await type(field("backlog"), "-3");
    expect(button("Save")!.disabled).toBe(true);
    expect(container.textContent).toContain("Enter a whole number of at least 0.");

    await type(field("backlog"), "800");
    expect(button("Save")!.disabled).toBe(false);
    await click(button("Save"));
    expect(mocks.update).toHaveBeenCalledWith("w1", { dailyMaxNewPapers: 25, backlogTargetPapers: 800 });
    expect(toast.success).toHaveBeenCalledWith("Follow settings saved.");
  });

  it("sends null when the daily cap is cleared", async () => {
    mocks.list.mockResolvedValue(list([watch({ dailyMaxNewPapers: 30 })]));
    await render(<TopicWatchControl targetKind="tag" targetId="tag-1" />);
    expect(field("daily").value).toBe("30");
    await type(field("daily"), "");
    await click(button("Save"));
    expect(mocks.update).toHaveBeenCalledWith("w1", { dailyMaxNewPapers: null, backlogTargetPapers: 500 });
  });

  it("removes the watch", async () => {
    mocks.list.mockResolvedValue(list([watch()]));
    mocks.remove.mockResolvedValue(undefined);
    await render(<TopicWatchControl targetKind="tag" targetId="tag-1" />);
    mocks.list.mockResolvedValue(list([]));
    await click(button("Remove"));
    expect(mocks.remove).toHaveBeenCalledWith("w1");
    expect(button("Follow")).toBeDefined();
  });
});

describe("TopicWatchesPanel", () => {
  it("shows the budget line and one row per watch", async () => {
    mocks.list.mockResolvedValue(list([watch(), watch({ id: "w2", targetName: "Deep learning", targetKind: "topic", phase: "tracking", enabled: false })]));
    await render(<TopicWatchesPanel />);
    expect(container.textContent).toContain("40 / 1,000 new papers today");
    expect(container.querySelectorAll("[data-testid='topic-watch-row']")).toHaveLength(2);
  });

  it("explains how to follow an entry and links to tags and taxonomy when empty", async () => {
    await render(<TopicWatchesPanel />);
    expect(container.textContent).toContain("Nothing is followed yet");
    expect(Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"))).toEqual(["/admin/tags", "/admin/taxonomy"]);
  });

  it("toasts that the job was queued", async () => {
    await render(<TopicWatchesPanel />);
    await click(button("Run now"));
    expect(mocks.run).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith("Daily follow job queued.");
  });

  it("toasts differently when a job is already waiting", async () => {
    mocks.run.mockResolvedValue({ queued: false });
    await render(<TopicWatchesPanel />);
    await click(button("Run now"));
    expect(toast.success).toHaveBeenCalledWith("A daily follow job is already waiting.");
  });

  it("shows the API error when nothing is enabled", async () => {
    mocks.run.mockRejectedValue(apiError(409, "NO_ENABLED_TOPIC_WATCHES", "No followed entry is turned on."));
    await render(<TopicWatchesPanel />);
    await click(button("Run now"));
    expect(toast.error).toHaveBeenCalledWith("No followed entry is turned on.");
  });
});
