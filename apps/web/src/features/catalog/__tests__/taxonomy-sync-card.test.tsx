// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ syncStatus: vi.fn(), requestSync: vi.fn() }));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/i18n", () => ({
  useI18n: () => ({ t: (key: string, params?: Record<string, unknown>) => (params ? `${key} ${JSON.stringify(params)}` : key) }),
}));
vi.mock("../api/catalog.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/catalog.api")>()),
  taxonomyApi: { syncStatus: mocks.syncStatus, requestSync: mocks.requestSync },
}));

import { TaxonomySyncCard } from "../components/taxonomy-sync-card";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const EMPTY = { loaded: false, running: false, lastSyncedAt: null, lastError: null };
const LOADED = { ...EMPTY, loaded: true, lastSyncedAt: "2026-10-30T00:00:00.000Z" };

let container: HTMLDivElement;
let root: Root;

async function render(props: { onlyWhenEmpty?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(<QueryClientProvider client={client}><TaxonomySyncCard {...props} /></QueryClientProvider>);
  });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
}

const button = () => container.querySelector("button") as HTMLButtonElement;

beforeEach(() => {
  vi.resetAllMocks();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("TaxonomySyncCard", () => {
  it("warns about an empty catalogue and loads it on click", async () => {
    mocks.syncStatus.mockResolvedValue(EMPTY);
    mocks.requestSync.mockResolvedValue({ queued: true });
    await render();
    expect(container.textContent).toContain("The taxonomy is empty");
    await act(async () => { button().click(); });
    expect(mocks.requestSync).toHaveBeenCalledTimes(1);
  });

  it("disables the button while a load is running", async () => {
    mocks.syncStatus.mockResolvedValue({ ...EMPTY, running: true });
    await render();
    expect(button().disabled).toBe(true);
    expect(container.textContent).toContain("Loading the taxonomy");
  });

  it("shows the last failure", async () => {
    mocks.syncStatus.mockResolvedValue({ ...LOADED, lastError: "OpenAlex down" });
    await render();
    expect(container.querySelector("[role=alert]")?.textContent).toContain("OpenAlex down");
  });

  it("stays hidden on other pages once loaded", async () => {
    mocks.syncStatus.mockResolvedValue(LOADED);
    await render({ onlyWhenEmpty: true });
    expect(container.querySelector("[data-testid=taxonomy-sync-card]")).toBeNull();
  });

  it("warns on other pages while empty", async () => {
    mocks.syncStatus.mockResolvedValue(EMPTY);
    await render({ onlyWhenEmpty: true });
    expect(container.querySelector("[data-testid=taxonomy-sync-card]")).not.toBeNull();
  });
});
