// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { ForumDiscussionComposer } from "@/pages/forum/forum-new";
import { ForumTagInput } from "../components/forum-tag-input";

const mocks = vi.hoisted(() => ({ create: vi.fn(async (_input: unknown) => ({ id: "posted", publicSlug: "posted" })) }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string, values?: Record<string, string>) => key.replace("{tag}", values?.tag ?? ""), language: "en" }) }));
vi.mock("@/features/forum/hooks/use-forum", () => ({
  useForumPaperSearch: () => ({ data: [], isLoading: false, isError: false }),
  useForumContext: () => ({ data: { papers: [{ id: "paper", title: "Study", publicationYear: 2026 }], gaps: [{ id: "gap", title: "Candidate", forumShareable: true }] }, isLoading: false, isError: false }),
  useCreateForumPost: () => ({ isPending: false, mutateAsync: mocks.create }),
  useShareForumGap: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));
vi.mock("@/features/forum/hooks/use-forum-categories", () => ({
  useForumCategories: () => ({ data: [{ id: "category", name: "Software Engineering", status: "ACTIVE" }], isLoading: false, isError: false }),
  useForumTags: () => ({ data: [{ slug: "methods", name: "methods" }, { slug: "evidence", name: "evidence" }] }),
}));
const setInput = (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

describe("Discussion source and tag fields", () => {
  it("switches Paper/Gap controls and submits only the selected thread type's context from a legacy draft", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.create.mockClear();
    const key = "lumigap:forum-draft:v1:all:QUESTION:none:none";
    localStorage.setItem(key, JSON.stringify({ type: "PAPER_DISCUSSION", communityId: "category", title: "Academic question", content: "An academic discussion body.", tags: "methods", linkedPaperId: "paper", linkedPaperLabel: "Study", linkedGapId: "gap", linkedProjectId: "obsolete-project", references: [] }));
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    const client = new QueryClient();
    const published = vi.fn();
    const changeType = async (value: string) => act(async () => { const select = container.querySelector<HTMLSelectElement>('[aria-label="Thread type"]')!; select.value = value; select.dispatchEvent(new Event("change", { bubbles: true })); });
    try {
      await act(async () => { root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/forum/new"]}><ForumDiscussionComposer embedded onPublished={published} /></MemoryRouter></QueryClientProvider>); });
      expect(container.querySelector('[aria-label="Linked Paper"]')?.textContent).toContain("Study");
      expect(container.querySelector('[aria-label="Candidate Research Gap"]')).toBeNull();
      expect(container.textContent).not.toContain("Link research context");
      expect(container.textContent).not.toContain("Linked Project");
      await changeType("RESEARCH_GAP_DISCUSSION");
      expect(container.querySelector('[aria-label="Linked Paper"]')).toBeNull();
      expect(container.querySelector<HTMLSelectElement>('select[aria-label="Candidate Research Gap"]')?.value).toBe("gap");
      await changeType("DISCUSSION");
      expect(container.querySelector("#discussion-type-source")).toBeNull();
      expect(container.querySelector('[aria-label="More formatting"]')).not.toBeNull();
      await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
      const payload = mocks.create.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
      expect(payload).toMatchObject({ type: "DISCUSSION", content: "An academic discussion body.", tags: ["methods"] });
      expect(payload?.linkedPaperId).toBeUndefined();
      expect(payload?.linkedResearchGapId).toBeUndefined();
      expect(payload).not.toHaveProperty("linkedProjectId");
      expect(published).toHaveBeenCalledWith("posted");
    } finally { await act(async () => root.unmount()); client.clear(); container.remove(); localStorage.removeItem(key); vi.unstubAllGlobals(); }
  });
  it("autocompletes existing tags, prevents a sixth tag and lets the user remove a tag", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    const valid = vi.fn();
    function Tags() { const [value, setValue] = useState("methods, one, two, three"); return <ForumTagInput value={value} onChange={setValue} onValidityChange={valid} />; }
    try {
      await act(async () => { root.render(<Tags />); });
      const input = container.querySelector("input")!;
      expect(container.querySelectorAll("datalist option")).toHaveLength(1);
      expect(container.querySelector("datalist option")?.getAttribute("value")).toBe("evidence");
      await act(async () => { setInput(input, "evidence, sixth"); });
      expect(container.querySelector('[role="alert"]')?.textContent).toContain("Use up to 5 tags");
      expect(valid).toHaveBeenLastCalledWith(false);
      expect(container.querySelectorAll("button")).toHaveLength(4);
      await act(async () => { setInput(input, "evidence"); input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })); });
      expect(input.disabled).toBe(true);
      expect(container.querySelectorAll("button")).toHaveLength(5);
      expect(valid).toHaveBeenLastCalledWith(true);
      await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="Remove tag evidence"]')!.click(); });
      expect(input.disabled).toBe(false);
      expect(container.querySelectorAll("button")).toHaveLength(4);
    } finally { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); }
  });
});
