// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LibraryRelatedPapers } from "../components/library-related-papers";

const mocks = vi.hoisted(() => ({ get: vi.fn(), detail: vi.fn() }));
vi.mock("@/services/api-client", () => ({ api: { get: mocks.get } }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key, language: "vi" }) }));
vi.mock("../api/projects.api", () => ({ projectsApi: { detail: mocks.detail } }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (s: { user: { id: string } }) => unknown) => select({ user: { id: "actor" } }) }));
let root: Root, container: HTMLDivElement, client: QueryClient;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  mocks.detail.mockResolvedValue({ papers: [] });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); vi.unstubAllGlobals(); });
async function open() {
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><LibraryRelatedPapers projectId="project" paperId="paper" readOnly={false} /></MemoryRouter></QueryClientProvider>));
  await act(async () => { container.querySelector("details")!.open = true; container.querySelector("details")!.dispatchEvent(new Event("toggle")); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 40)); });
}
it("renders the real array API contract without inventing source totals", async () => {
  mocks.get.mockImplementation(async (url: string) => ({ data: { data: url.endsWith("/references") ? [{ id: "ref", title: "Verified reference", publicationYear: 2025 }] : [] } }));
  await open();
  expect(container.textContent).toContain("Verified reference");
  expect(container.textContent).toContain("1 tài liệu có trong hệ thống");
  expect(container.textContent).toContain("0 bài có trong hệ thống");
  expect(container.textContent).toContain("Chưa có tổng số trích dẫn từ nguồn");
  expect(container.textContent).not.toContain("undefined");
});
it("keeps the other relationship section usable when one response is malformed", async () => {
  mocks.get.mockImplementation(async (url: string) => ({ data: { data: url.endsWith("/references") ? {} : [{ id: "related", title: "Stored similarity", publicationYear: 2024 }] } }));
  await open();
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  expect(container.textContent).toContain("Stored similarity");
});
it("retains explicit coverage counts when returned by an enriched API", async () => {
  mocks.get.mockImplementation(async (url: string) => ({ data: { data: url.endsWith("/references") ? { references: [], totalReferenced: 20, inCorpus: 0 } : { relatedWorks: [], totalRelated: 8, inCorpus: 0 } } }));
  await open();
  expect(container.textContent).toContain("0/20 tài liệu có trong hệ thống");
  expect(container.textContent).toContain("0/8 bài có trong hệ thống");
});
