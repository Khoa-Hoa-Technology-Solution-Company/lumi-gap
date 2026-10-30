// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogKeyword, Tag, TagDetail } from "@trend/shared-types";

const mocks = vi.hoisted(() => ({
  tags: vi.fn(),
  applyAll: vi.fn(),
  replaceRules: vi.fn(),
  nodes: vi.fn(),
  keywords: vi.fn(),
  merge: vi.fn(),
  listKeywords: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/i18n", () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, string | number>) =>
      key.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(values?.[name] ?? "")),
  }),
}));
vi.mock("@/features/catalog/hooks/use-tags", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/catalog/hooks/use-tags")>()),
  useAdminTags: mocks.tags,
  useApplyAllTags: () => ({ mutateAsync: mocks.applyAll, isPending: false }),
  useReplaceTagRules: () => ({ mutateAsync: mocks.replaceRules, isPending: false }),
  useDelayedTagRefresh: () => vi.fn(),
}));
vi.mock("@/features/catalog/hooks/use-taxonomy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/catalog/hooks/use-taxonomy")>()),
  useTaxonomyStats: () => ({ data: undefined, isLoading: true, isError: false }),
  useTaxonomyNodes: mocks.nodes,
  useTaxonomyNode: () => ({ data: undefined, isError: false }),
  useUpdateTaxonomyNode: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCatalogKeywords: mocks.keywords,
  useUpdateCatalogKeyword: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useMergeCatalogKeyword: () => ({ mutateAsync: mocks.merge, isPending: false }),
}));
vi.mock("@/features/catalog/api/catalog.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/catalog/api/catalog.api")>()),
  taxonomyApi: { listKeywords: mocks.listKeywords, listNodes: vi.fn() },
}));
// The rule picker is a network-backed combobox; replace it with a button that adds a known exclude rule.
vi.mock("@/features/catalog/components/rule-picker", () => ({
  RulePicker: ({ onAdd }: { onAdd: (rule: unknown) => void }) => (
    <button
      type="button"
      onClick={() => onAdd({ ruleKind: "keyword", targetId: "kw-new", effect: "exclude", name: "Noise" })}
    >
      stub add rule
    </button>
  ),
}));

import { AdminKeywordsPage } from "../keywords";
import { AdminTagsPage } from "../tags";
import { AdminTaxonomyPage } from "../taxonomy";
import { TagRulesSection } from "@/features/catalog/components/tag-rules-section";

const page = (data: unknown[]) => ({
  data: { data, meta: { page: 1, pageSize: 20, total: data.length, totalPages: 1 } },
  isLoading: false,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
});

const tag = (overrides: Partial<Tag> = {}): Tag => ({
  id: "t1", slug: "machine-learning", name: "Machine learning", description: null, status: "active",
  color: "#3b82f6", paperCount: 42, ruleCount: 2, createdById: null,
  createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z", ...overrides,
});

const keyword = (overrides: Partial<CatalogKeyword> = {}): CatalogKeyword => ({
  id: "k1", keywordName: "Deep learning", normalizedName: "deep learning", aliases: ["DL"], status: "active",
  mergedIntoId: null, paperCount: 12, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", ...overrides,
});

let root: Root, container: HTMLDivElement, client: QueryClient;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  HTMLElement.prototype.scrollIntoView = vi.fn();
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.nodes.mockReturnValue(page([]));
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
});

async function render(element: React.ReactNode) {
  await act(async () => root.render(
    <QueryClientProvider client={client}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{element}</MemoryRouter>
    </QueryClientProvider>,
  ));
}
const button = (text: string, scope: ParentNode = document) =>
  Array.from(scope.querySelectorAll("button")).find((item) => item.textContent?.trim().startsWith(text) || item.getAttribute("aria-label")?.startsWith(text));
const click = (element: Element | undefined) => act(async () => { (element as HTMLElement).click(); });
const wait = (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });

describe("admin tags list", () => {
  it("shows an empty state with a create action when there are no tags", async () => {
    mocks.tags.mockReturnValue(page([]));
    await render(<AdminTagsPage />);
    expect(container.textContent).toContain("No tags yet. Create the first one to start grouping papers.");
    expect(container.querySelector("a[href^='/admin/tags/']")).toBeNull();
  });

  it("lists tags with links to their detail page, counts and status", async () => {
    mocks.tags.mockReturnValue(page([tag(), tag({ id: "t2", name: "Graphs", slug: "graphs", paperCount: 0, ruleCount: 0 })]));
    await render(<AdminTagsPage />);
    const link = container.querySelector("a[href='/admin/tags/t1']");
    expect(link?.textContent).toContain("Machine learning");
    expect(container.textContent).toContain("machine-learning");
    expect(container.textContent).toContain("42");
    expect(container.querySelector("a[href='/admin/tags/t2']")).not.toBeNull();
  });

  it("starts re-tagging of every tag", async () => {
    mocks.tags.mockReturnValue(page([tag()]));
    mocks.applyAll.mockResolvedValue({ jobId: "j", tagId: null });
    await render(<AdminTagsPage />);
    await click(button("Re-tag all"));
    expect(mocks.applyAll).toHaveBeenCalledTimes(1);
  });
});

describe("tag rules section", () => {
  const detail = (): TagDetail => ({
    ...tag(),
    rules: [{
      id: "r1", tagId: "t1", ruleKind: "topic", effect: "include", researchTopicId: "n1", keywordId: null,
      target: { id: "n1", name: "Machine learning topic", level: "topic" }, createdAt: "2026-10-01T00:00:00Z",
    }],
  });

  it("removes a rule, adds another and saves the whole list", async () => {
    mocks.replaceRules.mockResolvedValue(undefined);
    await render(<TagRulesSection tag={detail()} />);

    const save = button("Save rules") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(container.querySelector("[data-testid='rules-include']")?.textContent).toContain("Machine learning topic");

    await click(button("stub add rule"));
    expect(container.querySelector("[data-testid='rules-exclude']")?.textContent).toContain("Noise");
    expect(container.textContent).toContain("Unsaved changes");

    await click(button("Remove rule Machine learning topic"));
    expect(container.querySelector("[data-testid='rules-include']")?.textContent).not.toContain("Machine learning topic");

    expect((button("Save rules") as HTMLButtonElement).disabled).toBe(false);
    await click(button("Save rules"));
    expect(mocks.replaceRules).toHaveBeenCalledWith({
      id: "t1",
      rules: [{ ruleKind: "keyword", keywordId: "kw-new", effect: "exclude" }],
    });
  });
});

describe("admin keywords merge dialog", () => {
  it("merges the keyword into the picked target", async () => {
    mocks.keywords.mockReturnValue(page([keyword()]));
    mocks.listKeywords.mockResolvedValue({
      data: [keyword(), keyword({ id: "k2", keywordName: "Neural networks", paperCount: 30 })],
      meta: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
    });
    mocks.merge.mockResolvedValue({});
    await render(<AdminKeywordsPage />);

    await click(button("Merge keyword Deep learning"));
    const input = document.querySelector<HTMLInputElement>("[role='dialog'] [role='combobox']")!;
    await act(async () => input.focus());
    await wait(400);

    const options = Array.from(document.querySelectorAll("[role='option']"));
    // The source keyword itself is never offered as a target.
    expect(options.map((option) => option.textContent)).toEqual([expect.stringContaining("Neural networks")]);
    await click(options[0]);

    expect(document.querySelector("[role='dialog']")?.textContent).toContain("Merge “Deep learning” (12 papers) into “Neural networks”");
    await click(button("Merge keywords"));
    expect(mocks.merge).toHaveBeenCalledWith({ id: "k1", targetId: "k2" });
  });
});

describe("admin taxonomy browser", () => {
  it("queries the level that was switched to and resets the parent filter", async () => {
    await render(<AdminTaxonomyPage />);
    expect(mocks.nodes.mock.lastCall?.[0]).toMatchObject({ level: "domain", sort: "paperCount", page: 1 });

    await click(button("Fields"));
    expect(mocks.nodes.mock.lastCall?.[0]).toMatchObject({ level: "field" });
    expect(mocks.nodes.mock.lastCall?.[0]).not.toHaveProperty("parentId");

    await click(button("Topics"));
    expect(mocks.nodes.mock.lastCall?.[0]).toMatchObject({ level: "topic" });
  });
});
