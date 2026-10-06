// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ForumDoiLookup } from "../components/forum-doi-lookup";
import { forumPaperApi } from "../api/forum-paper.api";

vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
const preview = { doi: "10.1234/example", title: "Paper metadata", authors: ["A. Researcher"], publicationYear: 2025, canAttach: true };
let root: Root; let container: HTMLDivElement; let client: QueryClient;
const attached = vi.fn();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  attached.mockReset();
  vi.spyOn(forumPaperApi, "preview").mockResolvedValue(preview);
  vi.spyOn(forumPaperApi, "attach").mockResolvedValue({ ...preview, paperId: "paper-id" });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); client.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const render = async (doi = preview.doi) => act(async () => root.render(<QueryClientProvider client={client}><ForumDoiLookup key={doi} doi={doi} onAttach={attached} /></QueryClientProvider>));
const click = async (label: string) => act(async () => {
  const button = [...container.querySelectorAll("button")].find((element) => element.textContent === label);
  if (!button) throw new Error(`Missing button: ${label}`);
  button.click();
});
const settle = async (assertion: () => void) => vi.waitFor(async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); assertion(); });

describe("Forum DOI preview actions", () => {
  it("requires separate resolve and attach actions and uses confirmed metadata", async () => {
    await render();
    expect(forumPaperApi.preview).not.toHaveBeenCalled();
    await click("Resolve DOI");
    await settle(() => expect(container.textContent).toContain("Paper metadata"));
    expect(container.textContent).toContain("A. Researcher");
    expect(forumPaperApi.attach).not.toHaveBeenCalled();
    await click("Attach paper");
    await settle(() => expect(attached).toHaveBeenCalledWith({ ...preview, paperId: "paper-id" }));
  });
  it("keeps the preview available after an attachment failure", async () => {
    vi.mocked(forumPaperApi.attach).mockRejectedValue(new Error("Unavailable"));
    await render(); await click("Resolve DOI");
    await settle(() => expect(container.textContent).toContain("Paper metadata"));
    await click("Attach paper");
    await settle(() => expect(container.querySelector('[role="alert"]')).not.toBeNull());
    expect(container.textContent).toContain("Paper metadata");
    expect(attached).not.toHaveBeenCalled();
  });
  it("shows incomplete citation metadata and prevents attachment", async () => {
    vi.mocked(forumPaperApi.preview).mockResolvedValue({ ...preview, canAttach: false });
    await render(); await click("Resolve DOI");
    await settle(() => expect(container.textContent).toContain("missing citation metadata"));
    expect(container.textContent).not.toContain("Attach paper");
    expect(forumPaperApi.attach).not.toHaveBeenCalled();
  });
  it("does not attach stale metadata after the DOI field changes", async () => {
    let resolve!: (paper: typeof preview & { paperId: string }) => void;
    vi.mocked(forumPaperApi.attach).mockReturnValue(new Promise((done) => { resolve = done; }));
    await render(); await click("Resolve DOI");
    await settle(() => expect(container.textContent).toContain("Paper metadata"));
    await click("Attach paper");
    await render("10.1234/changed");
    await act(async () => resolve({ ...preview, paperId: "old-paper" }));
    expect(attached).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Resolve DOI");
  });
});
