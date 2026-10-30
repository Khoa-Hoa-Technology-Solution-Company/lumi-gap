// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TagCampaign, TagCampaignPreflight } from "@trend/shared-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

const mocks = vi.hoisted(() => ({ preflight: vi.fn(), plan: vi.fn(), list: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/i18n", () => ({
  useI18n: () => ({
    language: "en",
    t: (key: string, values?: Record<string, string | number>) => key.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(values?.[name] ?? "")),
  }),
}));
vi.mock("../api/catalog.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/catalog.api")>()),
  tagCampaignsApi: { preflight: mocks.preflight, plan: mocks.plan, list: mocks.list },
}));

import { TagCampaignDialog, embeddingDays, parseCampaignTarget } from "../components/tag-campaign-dialog";
import { TagCampaignsSection } from "../components/tag-campaigns-section";

const tag = { id: "tag-1", name: "Machine learning" };
const campaign = (overrides: Partial<TagCampaign> = {}): TagCampaign => ({
  id: "c1", campaignKey: "tag-machine-learning-20261030", state: "planned", targetUniqueWorks: 100, uniqueWorks: 0,
  plannedPartitions: 4, completedPartitions: 0, createdAt: "2026-10-30T08:00:00Z", startedAt: null, completedAt: null, ...overrides,
});
const preflight = (overrides: Partial<TagCampaignPreflight> = {}): TagCampaignPreflight => ({
  tag: { id: "tag-1", name: "Machine learning", paperCount: 42 },
  planningAsOf: "2026-10-30T08:00:00Z",
  queries: [
    { filterExpression: "topics.id:T10028", population: 4000 },
    { filterExpression: "title_and_abstract.search:\"deep learning\"", population: 1500 },
  ],
  population: 5500,
  keywordRulesSkipped: 0,
  excludeRuleCount: 0,
  maxTarget: 1000,
  openAlexKeyConfigured: true,
  ingestWorkerOnline: true,
  embeddingBacklog: { pendingPapers: 1000, papersPerDay: 500 },
  liveCampaign: null,
  ...overrides,
});
const apiError = (status: number, code: string, message: string) => Object.assign(new Error(message), { response: { status, data: { error: { code, message } } } });

let root: Root, container: HTMLDivElement, client: QueryClient;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  for (const mock of Object.values(mocks)) mock.mockReset();
  vi.mocked(toast.success).mockReset();
  vi.mocked(toast.error).mockReset();
  mocks.preflight.mockResolvedValue(preflight());
  mocks.list.mockResolvedValue([]);
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
const input = () => document.querySelector<HTMLInputElement>("#tag-campaign-target")!;
async function typeTarget(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input(), value);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const dialogText = () => document.querySelector("[role='dialog']")?.textContent ?? "";
const planButton = () => button("Plan campaign") as HTMLButtonElement;
const estimate = () => document.querySelector("[data-testid='campaign-estimate']")?.textContent;
const NOTICES = ["notice-live", "notice-key", "notice-worker", "notice-keywords", "notice-excludes"];
const shownNotices = () => NOTICES.filter((id) => document.querySelector(`[data-testid='${id}']`));

describe("campaign helpers", () => {
  it("accepts whole numbers from 1 to the maximum only", () => {
    expect(["1", " 50 ", "100"].map((value) => parseCampaignTarget(value, 100))).toEqual([1, 50, 100]);
    expect(["", "0", "101", "-5", "12.5", "1e2", "abc"].map((value) => parseCampaignTarget(value, 100))).toEqual(Array(7).fill(undefined));
  });

  it("rounds the embedding estimate up and ignores an unknown rate", () => {
    expect(embeddingDays({ pendingPapers: 0, papersPerDay: 500 }, 100)).toBe(1);
    expect(embeddingDays({ pendingPapers: 1000, papersPerDay: 500 }, 101)).toBe(3);
    expect(embeddingDays({ pendingPapers: 10, papersPerDay: 0 }, 100)).toBeUndefined();
  });
});

describe("TagCampaignDialog", () => {
  it("renders nothing and calls nothing without a tag", async () => {
    await render(<TagCampaignDialog tag={undefined} onClose={vi.fn()} />);
    expect(document.querySelector("[role='dialog']")).toBeNull();
    expect(mocks.preflight).not.toHaveBeenCalled();
  });

  it("runs the preflight once on open and shows the numbers and queries", async () => {
    await render(<TagCampaignDialog tag={tag} onClose={vi.fn()} />);
    expect(mocks.preflight).toHaveBeenCalledTimes(1);
    expect(mocks.preflight).toHaveBeenCalledWith("tag-1");
    const text = dialogText();
    expect(text).toContain("Plan an OpenAlex campaign");
    expect(text).toContain("Machine learning");
    expect(text).toMatch(/Works in OpenAlex \(upper bound\)5,500/);
    expect(text).toMatch(/Local papers42/);
    const rows = Array.from(document.querySelectorAll("[data-testid='campaign-query']"));
    expect(rows.map((row) => row.querySelector("code")?.textContent)).toEqual(["topics.id:T10028", "title_and_abstract.search:\"deep learning\""]);
    expect(rows.map((row) => row.querySelector("span")?.textContent)).toEqual(["4,000", "1,500"]);
    expect(text).toContain("random sample");
    expect(text).toContain("most cited works");
    expect(text).toContain("nothing is downloaded until you start it");
  });

  it("shows the result under StrictMode, as the app renders it", async () => {
    await render(<StrictMode><TagCampaignDialog tag={tag} onClose={vi.fn()} /></StrictMode>);
    expect(dialogText()).toMatch(/Works in OpenAlex \(upper bound\)5,500/);
    expect(mocks.preflight).toHaveBeenCalledTimes(1);
  });

  it("shows a spinner line while the preflight is running and no form yet", async () => {
    mocks.preflight.mockReturnValue(new Promise(() => undefined));
    await render(<TagCampaignDialog tag={tag} onClose={vi.fn()} />);
    expect(document.querySelector("[role='status']")?.textContent).toBe("Checking OpenAlex…");
    expect(input()).toBeNull();
    expect(button("Plan campaign")).toBeUndefined();
  });

  it("shows the server message when the preflight fails and retries on demand", async () => {
    mocks.preflight.mockRejectedValueOnce(apiError(502, "OPENALEX_UNAVAILABLE", "OpenAlex did not answer")).mockResolvedValue(preflight());
    await render(<TagCampaignDialog tag={tag} onClose={vi.fn()} />);
    expect(document.querySelector("[role='alert']")?.textContent).toBe("OpenAlex did not answer");
    expect(input()).toBeNull();
    await click(button("Retry"));
    expect(mocks.preflight).toHaveBeenCalledTimes(2);
    expect(input().value).toBe("100");
  });

  it.each([
    ["100 when the population and the limit are larger", { population: 5500, maxTarget: 1000 }, "100", "1,000"],
    ["the population when it is below 100", { population: 40, maxTarget: 1000 }, "40", "40"],
    ["the server limit when it is below 100", { population: 5500, maxTarget: 30 }, "30", "30"],
  ])("defaults to %s", async (_label, overrides, expected, max) => {
    mocks.preflight.mockResolvedValue(preflight(overrides));
    await render(<TagCampaignDialog tag={tag} onClose={vi.fn()} />);
    expect(input().value).toBe(expected);
    expect(input().max).toBe(max.replace(",", ""));
    await typeTarget(String(Number(max.replace(",", "")) + 1));
    expect(document.querySelector("[role='alert']")?.textContent).toBe(`Enter a whole number from 1 to ${max}.`);
  });

  it.each(["0", "", "1.5", "5501", "abc"])("blocks the target %j and does not plan", async (value) => {
    await render(<TagCampaignDialog tag={tag} onClose={vi.fn()} />);
    await typeTarget(value);
    expect(planButton().disabled).toBe(true);
    expect(estimate()).toBeUndefined();
    await act(async () => { document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(mocks.plan).not.toHaveBeenCalled();
  });

  it("clamps to the smaller of the server limit and the population", async () => {
    mocks.preflight.mockResolvedValue(preflight({ population: 5500, maxTarget: 300 }));
    await render(<TagCampaignDialog tag={tag} onClose={vi.fn()} />);
    await typeTarget("300");
    expect(planButton().disabled).toBe(false);
    await typeTarget("301");
    expect(planButton().disabled).toBe(true);
  });

  it("blocks planning when OpenAlex has no works", async () => {
    mocks.preflight.mockResolvedValue(preflight({ population: 0, queries: [] }));
    await render(<TagCampaignDialog tag={tag} onClose={vi.fn()} />);
    expect(input()).toBeNull();
    expect(dialogText()).toContain("OpenAlex has no works for the include rules of this tag.");
    expect(planButton().disabled).toBe(true);
  });

  it("updates the embedding estimate with the target", async () => {
    await render(<TagCampaignDialog tag={tag} onClose={vi.fn()} />);
    expect(estimate()).toBe("Embedding these papers takes about 3 days at 500 papers per night, with 1,000 papers already waiting.");
    await typeTarget("600");
    expect(estimate()).toContain("about 4 days");
    await typeTarget("2");
    expect(estimate()).toContain("about 3 days");
  });

  it("says 1 day, not 1 days", async () => {
    mocks.preflight.mockResolvedValue(preflight({ embeddingBacklog: { pendingPapers: 0, papersPerDay: 500 } }));
    await render(<TagCampaignDialog tag={tag} onClose={vi.fn()} />);
    expect(estimate()).toBe("Embedding these papers takes about 1 day at 500 papers per night, with 0 papers already waiting.");
  });

  it("shows no notice when nothing applies", async () => {
    await render(<TagCampaignDialog tag={tag} onClose={vi.fn()} />);
    expect(shownNotices()).toEqual([]);
    expect(planButton().disabled).toBe(false);
  });

  it.each([
    ["notice-keywords", { keywordRulesSkipped: 3 }, "3 include rules on keywords are not used"],
    ["notice-excludes", { excludeRuleCount: 2 }, "OpenAlex cannot apply 2 exclude rules. Works they exclude may be imported, and are left untagged."],
    ["notice-worker", { ingestWorkerOnline: false }, "You can plan the campaign now, but it cannot start until the worker runs."],
  ] as const)("shows only %s when it applies and still allows planning", async (id, overrides, text) => {
    mocks.preflight.mockResolvedValue(preflight(overrides));
    await render(<TagCampaignDialog tag={tag} onClose={vi.fn()} />);
    expect(shownNotices()).toEqual([id]);
    expect(document.querySelector(`[data-testid='${id}']`)?.textContent).toContain(text);
    expect(planButton().disabled).toBe(false);
  });

  it("blocks planning without an OpenAlex key", async () => {
    mocks.preflight.mockResolvedValue(preflight({ openAlexKeyConfigured: false }));
    await render(<TagCampaignDialog tag={tag} onClose={vi.fn()} />);
    expect(shownNotices()).toEqual(["notice-key"]);
    expect(planButton().disabled).toBe(true);
    await act(async () => { document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(mocks.plan).not.toHaveBeenCalled();
  });

  it("blocks planning while a campaign is live and shows its state", async () => {
    mocks.preflight.mockResolvedValue(preflight({ liveCampaign: campaign({ state: "running" }) }));
    await render(<TagCampaignDialog tag={tag} onClose={vi.fn()} />);
    expect(shownNotices()).toEqual(["notice-live"]);
    expect(document.querySelector("[data-testid='notice-live']")?.textContent).toContain("Running");
    expect(planButton().disabled).toBe(true);
    await act(async () => { document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(mocks.plan).not.toHaveBeenCalled();
  });

  it("plans with the tag and target, reports where to start it and closes", async () => {
    mocks.plan.mockResolvedValue(campaign());
    const onClose = vi.fn();
    await render(<TagCampaignDialog tag={tag} onClose={onClose} />);
    await typeTarget("250");
    await click(planButton());
    expect(mocks.plan).toHaveBeenCalledWith("tag-1", 250);
    expect(toast.success).toHaveBeenCalledWith("Campaign planned for “Machine learning”. Start it on the pipeline page: nothing is downloaded until then.");
    expect(onClose).toHaveBeenCalled();
  });

  it("refreshes the campaign list after planning", async () => {
    mocks.plan.mockResolvedValue(campaign());
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await render(<TagCampaignDialog tag={tag} onClose={vi.fn()} />);
    await click(planButton());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin", "tags", "campaigns", "tag-1"] });
  });

  it("stays open and shows the server error", async () => {
    mocks.plan.mockRejectedValue(apiError(409, "TAG_CAMPAIGN_ACTIVE", "A campaign for this tag is already active"));
    const onClose = vi.fn();
    await render(<TagCampaignDialog tag={tag} onClose={onClose} />);
    await click(planButton());
    expect(mocks.plan).toHaveBeenCalledWith("tag-1", 100);
    expect(toast.error).toHaveBeenCalledWith("A campaign for this tag is already active");
    expect(toast.success).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(planButton().disabled).toBe(false);
  });
});

describe("TagCampaignsSection", () => {
  it("queries the campaigns of the tag and says when there are none", async () => {
    await render(<TagCampaignsSection tagId="tag-1" />);
    expect(mocks.list).toHaveBeenCalledWith("tag-1");
    expect(container.textContent).toContain("OpenAlex campaigns");
    expect(container.textContent).toContain("No campaigns yet.");
    expect(container.querySelector("a")).toBeNull();
  });

  it("lists state, progress, partitions and date, with a link to the pipeline", async () => {
    mocks.list.mockResolvedValue([
      campaign({ id: "c2", state: "running", uniqueWorks: 40, targetUniqueWorks: 1200, completedPartitions: 1, plannedPartitions: 6 }),
      campaign({ id: "c1", state: "completed", uniqueWorks: 100, targetUniqueWorks: 100, completedPartitions: 4, plannedPartitions: 4 }),
    ]);
    await render(<TagCampaignsSection tagId="tag-1" />);
    const items = Array.from(container.querySelectorAll("[data-testid='tag-campaign']"));
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toContain("Running");
    expect(items[0]!.textContent).toMatch(/Works40 \/ 1,200/);
    expect(items[0]!.textContent).toMatch(/Partitions1 \/ 6/);
    expect(items[0]!.textContent).toMatch(/Planned on[A-Z][a-z]{2} 30, 2026/);
    expect(items[1]!.textContent).toContain("Completed");
    expect(items[1]!.textContent).toMatch(/Works100 \/ 100/);
    const link = Array.from(container.querySelectorAll("a")).find((item) => item.textContent === "Open pipeline");
    expect(link?.getAttribute("href")).toBe("/admin/pipeline");
  });

  it("offers a retry when the list cannot be loaded", async () => {
    mocks.list.mockRejectedValueOnce(new Error("down")).mockResolvedValue([campaign()]);
    await render(<TagCampaignsSection tagId="tag-1" />);
    expect(container.querySelector("[role='alert']")).not.toBeNull();
    await click(button("Retry"));
    expect(container.querySelectorAll("[data-testid='tag-campaign']")).toHaveLength(1);
  });

  it("polls while a campaign is live and stops once none is", async () => {
    vi.useFakeTimers();
    mocks.list
      .mockResolvedValueOnce([campaign({ state: "running", uniqueWorks: 10 })])
      .mockResolvedValue([campaign({ state: "completed", uniqueWorks: 100 })]);
    await act(async () => root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><TagCampaignsSection tagId="tag-1" /></MemoryRouter>
      </QueryClientProvider>,
    ));
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(container.textContent).toContain("Running");
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(container.textContent).toContain("Completed");
    const calls = mocks.list.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(mocks.list.mock.calls.length).toBe(calls);
  });
});
