// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { ForumCitationPicker } from "../components/forum-citation-picker";
import { forumPaperApi } from "../api/forum-paper.api";
import { useAuthStore } from "@/stores/auth-store";

vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
const result = { openalexId: "W123", title: "OpenAlex study", authors: ["Author"], publicationYear: 2025, canAttach: true };
const paperId = "11111111-1111-4111-8111-111111111111";
const settle = async (check: () => void) => vi.waitFor(async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); check(); });

describe("Citation OpenAlex search", () => {
  it("debounces real search hook, imports only on insert, preserves selection after failure and inserts a local Paper ID", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const previous = useAuthStore.getState();
    useAuthStore.setState({ tokens: { accessToken: "fixture", refreshToken: "fixture", accessTokenExpiresAt: "2099-01-01T00:00:00Z" } });
    const search = vi.spyOn(forumPaperApi, "search").mockResolvedValue([result]);
    const attach = vi.spyOn(forumPaperApi, "attachOpenAlex").mockRejectedValueOnce(new Error("Unavailable")).mockResolvedValue({ ...result, paperId });
    const insert = vi.fn(() => true); const close = vi.fn();
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container); const client = new QueryClient();
    const button = () => [...document.querySelectorAll<HTMLButtonElement>("button")].find((node) => node.textContent === "Insert citation")!;
    try {
      await act(async () => { root.render(<QueryClientProvider client={client}><ForumCitationPicker onInsert={insert} onClose={close} /></QueryClientProvider>); });
      expect(search).not.toHaveBeenCalled();
      const input = document.querySelector<HTMLInputElement>('[aria-label="Search OpenAlex papers"]')!;
      await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "software engineering"); input.dispatchEvent(new Event("input", { bubbles: true })); });
      await settle(() => expect(document.querySelector('[role="option"]')).not.toBeNull());
      expect(search).toHaveBeenCalledWith("software engineering", expect.any(AbortSignal));
      await act(async () => { document.querySelector<HTMLButtonElement>('[role="option"]')!.click(); });
      expect(attach).not.toHaveBeenCalled();
      await act(async () => { button().click(); });
      await settle(() => expect(document.querySelector('[role="alert"]')).not.toBeNull());
      expect(input.value).toBe("software engineering"); expect(insert).not.toHaveBeenCalled();
      await act(async () => { button().click(); });
      await settle(() => expect(insert).toHaveBeenCalledWith({ paperId, title: result.title, authors: ["Author"], year: 2025, doi: undefined, venue: undefined }));
      expect(attach).toHaveBeenCalledWith("W123"); expect(close).toHaveBeenCalledOnce();
    } finally { await act(async () => root.unmount()); container.remove(); client.clear(); useAuthStore.setState(previous); vi.restoreAllMocks(); vi.unstubAllGlobals(); }
  });
});
