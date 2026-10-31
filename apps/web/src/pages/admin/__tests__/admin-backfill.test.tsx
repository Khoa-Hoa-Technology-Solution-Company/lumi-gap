// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CatalogKeyword, TagDetail, TopicBackfillRun } from "@trend/shared-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

const mocks = vi.hoisted(() => ({ adminRequest: vi.fn(), adminRuns: vi.fn(), getRun: vi.fn(), keywords: vi.fn(), tag: vi.fn(), campaignPreflight: vi.fn(), campaignPlan: vi.fn(), campaignList: vi.fn() }));
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
vi.mock("@/features/catalog/api/catalog.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/catalog/api/catalog.api")>()),
  tagCampaignsApi: { preflight: mocks.campaignPreflight, plan: mocks.campaignPlan, list: mocks.campaignList },
}));
vi.mock("@/features/catalog/hooks/use-taxonomy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/catalog/hooks/use-taxonomy")>()),
  useCatalogKeywords: mocks.keywords,
}));
vi.mock("@/features/catalog/hooks/use-tags", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/catalog/hooks/use-tags")>()),
  useAdminTag: mocks.tag,
  useApplyTag: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useArchiveTag: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateTag: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDelayedTagRefresh: () => vi.fn(),
}));
// The tag sections have their own tests and hooks; the page only needs to place the runs section among them.
vi.mock("@/features/catalog/components/tag-rules-section", () => ({ TagRulesSection: () => <section>rules</section> }));
vi.mock("@/features/catalog/components/tag-preview-section", () => ({ TagPreviewSection: () => <section>preview</section> }));
vi.mock("@/features/catalog/components/tag-papers-section", () => ({ TagPapersSection: () => <section>papers</section> }));

import { AdminKeywordsPage } from "../keywords";
import { AdminTagDetailPage } from "../tag-detail";

const keyword = (overrides: Partial<CatalogKeyword> = {}): CatalogKeyword => ({
  id: "k1", keywordName: "Deep learning", normalizedName: "deep learning", aliases: [], status: "active",
  mergedIntoId: null, paperCount: 12, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", ...overrides,
});
const tag: TagDetail = {
  id: "t1", slug: "machine-learning", name: "Machine learning", description: null, status: "active", color: null,
  paperCount: 42, ruleCount: 0, createdById: null, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z", rules: [],
};
const run = (overrides: Partial<TopicBackfillRun> = {}): TopicBackfillRun => ({
  id: "run-1", targetKind: "keyword", targetId: "k1", targetName: "Deep learning", state: "queued", trigger: "admin",
  maxNewPapers: 100, paperCountBefore: 12, fetchedCount: 0, insertedCount: 0, skippedCount: 0, rejectedCount: 0, pagesFetched: 0,
  errorMessage: null, startedAt: null, finishedAt: null, createdAt: "2026-10-30T00:00:00Z", ...overrides,
});

let root: Root, container: HTMLDivElement, client: QueryClient;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  for (const mock of Object.values(mocks)) mock.mockReset();
  vi.mocked(toast.success).mockReset();
  vi.mocked(toast.error).mockReset();
  mocks.adminRuns.mockResolvedValue({ data: [], meta: { page: 1, pageSize: 5, total: 0, totalPages: 1 } });
  mocks.campaignList.mockResolvedValue([]);
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
async function render(element: React.ReactNode, route = "/") {
  await act(async () => root.render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{element}</MemoryRouter>
    </QueryClientProvider>,
  ));
  await tick();
}
const button = (text: string) => Array.from(document.querySelectorAll("button")).find((item) => item.textContent?.trim() === text || item.getAttribute("aria-label") === text);
const click = async (element: Element | undefined) => { await act(async () => { (element as HTMLElement).click(); }); await tick(); };

describe("keywords page fetch action", () => {
  const listing = (rows: CatalogKeyword[]) => ({
    data: { data: rows, meta: { page: 1, pageSize: 20, total: rows.length, totalPages: 1 } },
    isLoading: false, isError: false, isFetching: false, refetch: vi.fn(),
  });

  it("offers Fetch on active keywords only", async () => {
    mocks.keywords.mockReturnValue(listing([
      keyword(),
      keyword({ id: "k2", keywordName: "Old name", status: "hidden" }),
      keyword({ id: "k3", keywordName: "Duplicate", status: "merged", mergedIntoId: "k1" }),
    ]));
    await render(<AdminKeywordsPage />);
    expect(button("Fetch papers for keyword Deep learning")?.textContent).toContain("Fetch");
    expect(button("Fetch papers for keyword Old name")).toBeUndefined();
    expect(button("Fetch papers for keyword Duplicate")).toBeUndefined();
  });

  it("starts an import for the keyword and watches the run until it ends", async () => {
    mocks.keywords.mockReturnValue(listing([keyword()]));
    mocks.adminRequest.mockResolvedValue({ run: run(), created: true });
    mocks.getRun.mockResolvedValue(run({ state: "completed", insertedCount: 9 }));
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await render(<AdminKeywordsPage />);
    await click(button("Fetch papers for keyword Deep learning"));
    expect(document.querySelector("[role='dialog']")?.textContent).toContain("Deep learning");
    await click(button("Start import"));
    expect(mocks.adminRequest).toHaveBeenCalledWith({ targetKind: "keyword", targetId: "k1", maxNewPapers: 100 });
    expect(document.querySelector("[role='dialog']")).toBeNull();
    expect(mocks.getRun).toHaveBeenCalledWith("run-1", expect.anything());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin", "taxonomy"] });
    expect(toast.success).toHaveBeenCalledWith("Imported 9 new papers into “Deep learning”.");
  });
});

describe("tag detail fetch action", () => {
  const renderTag = () => render(
    <Routes><Route path="/admin/tags/:id" element={<AdminTagDetailPage />} /></Routes>,
    "/admin/tags/t1",
  );

  it("puts the button next to Re-tag now and shows the import history among the sections", async () => {
    mocks.tag.mockReturnValue({ data: tag, isError: false, refetch: vi.fn() });
    await renderTag();
    const labels = Array.from(container.querySelectorAll("header button, header a")).map((item) => item.textContent?.trim());
    expect(labels.indexOf("Fetch from OpenAlex")).toBe(labels.indexOf("Re-tag now") + 1);
    expect(mocks.adminRuns).toHaveBeenCalledWith({ targetKind: "tag", targetId: "t1", page: 1, pageSize: 5 }, expect.anything());
    const sections = Array.from(container.querySelectorAll("main > section")).map((item) => item.textContent);
    expect(sections[0]).toBe("rules");
    expect(sections[1]).toBe("preview");
    expect(sections[2]).toContain("OpenAlex imports");
    expect(sections[3]).toContain("OpenAlex campaigns");
    expect(sections[4]).toBe("papers");
    expect(mocks.campaignList).toHaveBeenCalledWith("t1");
  });

  it("asks for the budget and reports a tag without include rules", async () => {
    mocks.tag.mockReturnValue({ data: tag, isError: false, refetch: vi.fn() });
    mocks.adminRequest.mockRejectedValue(Object.assign(new Error("x"), {
      response: { status: 409, data: { error: { code: "TAG_HAS_NO_INCLUDE_RULES", message: "Tag has no include rules" } } },
    }));
    await renderTag();
    await click(button("Fetch from OpenAlex"));
    expect(document.querySelector("[role='dialog']")?.textContent).toContain("Machine learning");
    await click(button("Start import"));
    expect(mocks.adminRequest).toHaveBeenCalledWith({ targetKind: "tag", targetId: "t1", maxNewPapers: 100 });
    expect(toast.error).toHaveBeenCalledWith("Add an include rule first.");
  });

  it("is disabled for an archived tag", async () => {
    mocks.tag.mockReturnValue({ data: { ...tag, status: "archived" }, isError: false, refetch: vi.fn() });
    await renderTag();
    expect((Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.trim() === "Fetch from OpenAlex") as HTMLButtonElement).disabled).toBe(true);
  });

  it("puts Plan campaign next to Fetch from OpenAlex and opens the dialog with a preflight", async () => {
    mocks.tag.mockReturnValue({ data: tag, isError: false, refetch: vi.fn() });
    mocks.campaignPreflight.mockResolvedValue({
      tag: { id: "t1", name: "Machine learning", paperCount: 42 }, planningAsOf: "2026-10-30T00:00:00Z",
      queries: [{ filterExpression: "topics.id:T1", population: 900 }], population: 900, keywordRulesSkipped: 0, excludeRuleCount: 0,
      maxTarget: 1000, openAlexKeyConfigured: true, ingestWorkerOnline: true,
      embeddingBacklog: { pendingPapers: 0, papersPerDay: 500 }, liveCampaign: null,
    });
    await renderTag();
    const labels = Array.from(container.querySelectorAll("header button, header a")).map((item) => item.textContent?.trim());
    expect(labels.indexOf("Plan campaign")).toBe(labels.indexOf("Fetch from OpenAlex") + 1);
    expect(mocks.campaignPreflight).not.toHaveBeenCalled();
    await click(button("Plan campaign"));
    expect(mocks.campaignPreflight).toHaveBeenCalledWith("t1");
    const dialog = document.querySelector("[role='dialog']")!;
    expect(dialog.textContent).toContain("Plan an OpenAlex campaign");
    expect(dialog.textContent).toContain("topics.id:T1");
    expect(dialog.querySelector<HTMLInputElement>("#tag-campaign-target")?.value).toBe("100");
  });

  it("disables Plan campaign for an archived tag", async () => {
    mocks.tag.mockReturnValue({ data: { ...tag, status: "archived" }, isError: false, refetch: vi.fn() });
    await renderTag();
    expect((Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.trim() === "Plan campaign") as HTMLButtonElement).disabled).toBe(true);
  });
});
