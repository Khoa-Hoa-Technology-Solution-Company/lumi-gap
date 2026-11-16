// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TaxonomyNode } from "@trend/shared-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

const mocks = vi.hoisted(() => ({
  adminRequest: vi.fn(),
  upsert: vi.fn(),
  listNodes: vi.fn(),
  listKeywords: vi.fn(),
  listTags: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/i18n", () => ({
  useI18n: () => ({
    language: "en",
    t: (key: string, values?: Record<string, string | number>) => key.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(values?.[name] ?? "")),
  }),
}));
vi.mock("@/features/topic-backfill/api/topic-backfill.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/topic-backfill/api/topic-backfill.api")>()),
  topicBackfillApi: { adminRequest: mocks.adminRequest, adminRuns: vi.fn(), getRun: vi.fn() },
}));
vi.mock("../api/catalog.api", async (importOriginal) => {
  const original = await importOriginal<typeof import("../api/catalog.api")>();
  return {
    ...original,
    taxonomyApi: { ...original.taxonomyApi, listNodes: mocks.listNodes, listKeywords: mocks.listKeywords },
    tagsApi: { ...original.tagsApi, list: mocks.listTags },
    topicWatchesApi: { ...original.topicWatchesApi, upsert: mocks.upsert },
  };
});

import { CatalogImportDialog } from "../components/catalog-import-dialog";

const node = (overrides: Partial<TaxonomyNode>): TaxonomyNode => ({
  id: "n1", level: "topic", name: "Large language models", paperCount: 12, status: "active", aliases: [],
  ...overrides,
} as TaxonomyNode);
const page = <T,>(data: T[]) => ({ data, meta: { page: 1, pageSize: 6, total: data.length, totalPages: 1 } });

let root: Root, container: HTMLDivElement, client: QueryClient;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  for (const mock of Object.values(mocks)) mock.mockReset();
  vi.mocked(toast.success).mockReset();
  vi.mocked(toast.error).mockReset();
  // The backend filters by level; echo that, and also leak a domain and a field to prove the client drops them.
  mocks.listNodes.mockImplementation(async (params: { level?: string }) => page([
    node({ id: `${params.level}-1`, level: params.level as TaxonomyNode["level"], name: params.level === "topic" ? "Large language models" : "Artificial intelligence" }),
    node({ id: "dom-1", level: "domain", name: "Physical Sciences" }),
    node({ id: "fld-1", level: "field", name: "Computer Science" }),
  ]));
  mocks.listKeywords.mockResolvedValue(page([{ id: "k1", keywordName: "Deep learning", paperCount: 5 }]));
  mocks.listTags.mockResolvedValue(page([{ id: "t1", name: "Machine learning", paperCount: 9 }]));
  mocks.adminRequest.mockResolvedValue({ run: { id: "run-1" }, created: true });
  mocks.upsert.mockResolvedValue({ watch: { id: "w1" }, created: true });
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
const button = (text: string) => Array.from(document.querySelectorAll("button")).find((item) => item.textContent?.trim() === text) as HTMLButtonElement | undefined;
const click = async (element: Element | null | undefined) => { await act(async () => { (element as HTMLElement).click(); }); await tick(); };
const combobox = () => document.querySelector<HTMLInputElement>("input[role='combobox']")!;
const options = () => Array.from(document.querySelectorAll("[role='option']")).map((item) => item.textContent ?? "");

async function renderDialog(onOpenChange = vi.fn()) {
  await act(async () => root.render(
    <QueryClientProvider client={client}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <CatalogImportDialog open onOpenChange={onOpenChange} />
      </MemoryRouter>
    </QueryClientProvider>,
  ));
  await tick();
  return onOpenChange;
}
async function openList() {
  await act(async () => { combobox().focus(); });
  await tick(300);
}
async function pick(name: string) {
  await openList();
  const option = Array.from(document.querySelectorAll("[role='option']")).find((item) => item.textContent?.includes(name));
  await click(option);
}
async function typeBudget(value: string) {
  await act(async () => {
    const input = document.querySelector<HTMLInputElement>("#catalog-import-max-papers")!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("CatalogImportDialog", () => {
  it("offers topics, subfields, keywords and tags with paper counts, but never domains or fields", async () => {
    await renderDialog();
    await openList();
    const shown = options();
    expect(shown.some((text) => text.includes("Large language models") && text.includes("12 papers"))).toBe(true);
    expect(shown.some((text) => text.includes("Artificial intelligence"))).toBe(true);
    expect(shown.some((text) => text.includes("Deep learning") && text.includes("5 papers"))).toBe(true);
    expect(shown.some((text) => text.includes("Machine learning") && text.includes("9 papers"))).toBe(true);
    expect(shown.join("|")).not.toContain("Physical Sciences");
    expect(shown.join("|")).not.toContain("Computer Science");
    expect(mocks.listNodes).toHaveBeenCalledWith(expect.objectContaining({ level: "topic" }));
    expect(mocks.listNodes).toHaveBeenCalledWith(expect.objectContaining({ level: "subfield" }));
    expect(document.querySelector("a[href='/admin/tags']")).not.toBeNull();
  });

  it("disables both actions until an entry is picked", async () => {
    await renderDialog();
    expect(button("Import now")!.disabled).toBe(true);
    expect(button("Follow daily")!.disabled).toBe(true);
  });

  it("posts the picked entry and budget on Import now, then closes", async () => {
    const onOpenChange = await renderDialog();
    await pick("Deep learning");
    expect(document.querySelector("[role='dialog']")!.textContent).toContain("Keyword");
    await typeBudget("250");
    await click(button("Import now"));
    expect(mocks.adminRequest).toHaveBeenCalledWith({ targetKind: "keyword", targetId: "k1", maxNewPapers: 250 });
    expect(toast.success).toHaveBeenCalledWith("Import started for “Deep learning”. It runs in the background.");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("posts only the entry on Follow daily", async () => {
    await renderDialog();
    await pick("Large language models");
    await click(button("Follow daily"));
    expect(mocks.upsert).toHaveBeenCalledWith({ targetKind: "topic", targetId: "topic-1" });
    expect(mocks.adminRequest).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("“Large language models” is now followed daily.");
  });

  it("disables Import now for an invalid budget", async () => {
    await renderDialog();
    await pick("Machine learning");
    await typeBudget("0");
    expect(button("Import now")!.disabled).toBe(true);
    expect(document.querySelector("[role='alert']")!.textContent).toContain("Enter a whole number from 1 to 1000.");
    await typeBudget("1001");
    expect(button("Import now")!.disabled).toBe(true);
    await typeBudget("100");
    expect(button("Import now")!.disabled).toBe(false);
  });

  it("explains a tag without include rules", async () => {
    mocks.adminRequest.mockRejectedValue(Object.assign(new Error("x"), { response: { status: 409, data: { error: { code: "TAG_HAS_NO_INCLUDE_RULES", message: "x" } } } }));
    await renderDialog();
    await pick("Machine learning");
    await click(button("Import now"));
    expect(toast.error).toHaveBeenCalledWith("Add an include rule first.");
  });

  it("clears the picked entry", async () => {
    await renderDialog();
    await pick("Deep learning");
    await click(button("Clear"));
    expect(document.querySelector("#catalog-import-max-papers")).toBeNull();
  });
});
