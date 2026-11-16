// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ options: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/i18n", () => ({
  useI18n: () => ({
    language: "en",
    t: (key: string, values?: Record<string, string | number>) => key.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(values?.[name] ?? "")),
  }),
}));
vi.mock("@/features/auth", () => ({ useCurrentUser: () => ({ data: { user: { systemRole: "ADMIN" } } }) }));
vi.mock("@/features/admin", () => ({ useAdminStats: () => ({ data: undefined, isLoading: false, refetch: vi.fn() }) }));
vi.mock("@/features/admin/hooks/use-admin-sync", () => ({
  useSyncOptions: mocks.options,
  useSyncRuns: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
  useTriggerSync: () => ({ mutate: vi.fn(), isPending: false }),
  useEmbedStatus: () => ({ data: undefined, isLoading: false, refetch: vi.fn() }),
  useTriggerEmbedding: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/features/catalog/components/taxonomy-sync-card", () => ({ TaxonomySyncCard: () => null }));
vi.mock("@/features/catalog/components/topic-watches-panel", () => ({ TopicWatchesPanel: () => null }));
vi.mock("@/features/catalog/components/catalog-import-dialog", () => ({
  CatalogImportDialog: ({ open }: { open: boolean }) => (open ? <div role="dialog">catalogue import</div> : null),
}));

import { AdminSyncPage } from "../sync";

let root: Root, container: HTMLDivElement, client: QueryClient;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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

const button = (text: string) => Array.from(document.querySelectorAll("button")).find((item) => item.textContent?.trim() === text) as HTMLButtonElement | undefined;
async function render() {
  await act(async () => root.render(
    <QueryClientProvider client={client}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><AdminSyncPage /></MemoryRouter>
    </QueryClientProvider>,
  ));
}

describe("AdminSyncPage free-text sync", () => {
  it("hides the free-text button and dialog when the backend disables it", async () => {
    mocks.options.mockReturnValue({ data: { freeTextSyncEnabled: false } });
    await render();
    expect(button("Import from catalogue")).toBeDefined();
    expect(button("Free-text sync (debug)")).toBeUndefined();
    expect(document.body.textContent).not.toContain("Search Query Topic");
  });

  it("hides it while the options are still loading", async () => {
    mocks.options.mockReturnValue({ data: undefined });
    await render();
    expect(button("Free-text sync (debug)")).toBeUndefined();
  });

  it("shows it when the backend enables it, starting with an empty query", async () => {
    mocks.options.mockReturnValue({ data: { freeTextSyncEnabled: true } });
    await render();
    await act(async () => { button("Free-text sync (debug)")!.click(); });
    const input = document.querySelector<HTMLInputElement>("#searchText")!;
    expect(input.value).toBe("");
  });

  it("opens the catalogue import from the main button", async () => {
    mocks.options.mockReturnValue({ data: { freeTextSyncEnabled: false } });
    await render();
    await act(async () => { button("Import from catalogue")!.click(); });
    expect(document.body.textContent).toContain("catalogue import");
  });
});
