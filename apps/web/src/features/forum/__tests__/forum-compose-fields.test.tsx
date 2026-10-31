// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { ForumDiscussionComposer } from "@/pages/forum/forum-new";
import { useAuthStore } from "@/stores/auth-store";
import { ForumTagInput } from "../components/forum-tag-input";

const mocks = vi.hoisted(() => ({
  create: vi.fn(async (_input: unknown) => ({ id: "posted", publicSlug: "posted" })),
  mine: [{ id: "cm1", slug: "se-lab", name: "SE Lab", status: "ACTIVE", researchField: "software  ENGINEERING", viewerMembership: { status: "active", role: "member" } }] as unknown[],
  requested: undefined as unknown,
  user: { emailVerifiedAt: "2026-10-01T00:00:00.000Z", systemRole: "USER" } as Record<string, unknown>,
}));
vi.mock("@/features/auth", () => ({ useCurrentUser: () => ({ data: { user: mocks.user } }) }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string, values?: Record<string, string>) => key.replace("{tag}", values?.tag ?? ""), language: "en" }) }));
vi.mock("@/features/forum/hooks/use-forum", () => ({
  useForumPaperSearch: () => ({ data: [], isLoading: false, isError: false }),
  useForumContext: () => ({ data: { papers: [{ id: "paper", title: "Study", publicationYear: 2026 }], gaps: [{ id: "gap", title: "Candidate", forumShareable: true }] }, isLoading: false, isError: false }),
  useCreateForumPost: () => ({ isPending: false, mutateAsync: mocks.create }),
  useShareForumGap: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useCommunityList: () => ({ data: { pages: [{ items: mocks.mine }] } }),
  useCommunity: (slug?: string) => ({ data: slug ? mocks.requested : undefined, isLoading: false }),
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
  it("lists only the user's communities and pre-fills the category from the community's research field", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    const client = new QueryClient();
    try {
      await act(async () => { root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/forum/new?community=se-lab"]}><ForumDiscussionComposer embedded /></MemoryRouter></QueryClientProvider>); });
      const community = container.querySelector<HTMLSelectElement>('select[aria-label="Post in community"]')!;
      expect(Array.from(community.options).map((option) => option.textContent)).toEqual(["Post in community (optional)", "SE Lab"]);
      // The URL names the community: it is selected and the category follows its research field (accent/case/space-insensitive).
      expect(community.value).toBe("cm1");
      expect(container.querySelector<HTMLSelectElement>('select[aria-label="Category"]')!.value).toBe("category");
      expect(container.textContent).toContain("Anyone can read this discussion.");
      expect(container.textContent).not.toContain("private community");
      expect(container.textContent).not.toContain("Publishing will also make you a member of this community.");
    } finally { await act(async () => root.unmount()); client.clear(); container.remove(); vi.unstubAllGlobals(); }
  });
  const renderComposer = async (url: string) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    useAuthStore.setState({ tokens: { accessToken: "token", refreshToken: "refresh" } as never });
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    const client = new QueryClient();
    await act(async () => { root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[url]}><ForumDiscussionComposer embedded /></MemoryRouter></QueryClientProvider>); });
    const cleanup = async () => { await act(async () => root.unmount()); client.clear(); container.remove(); vi.unstubAllGlobals(); useAuthStore.setState({ tokens: null }); mocks.requested = undefined; mocks.user = { emailVerifiedAt: "2026-10-01T00:00:00.000Z", systemRole: "USER" }; };
    return { container, cleanup };
  };
  it("offers an unjoined ?community= community and explains that publishing joins it", async () => {
    mocks.requested = { id: "cm2", slug: "graph-lab", name: "Graph Lab", status: "ACTIVE", researchField: "Software Engineering", viewerMembership: undefined };
    const { container, cleanup } = await renderComposer("/forum/new?community=graph-lab");
    try {
      const community = container.querySelector<HTMLSelectElement>('select[aria-label="Post in community"]')!;
      expect(Array.from(community.options).map((option) => option.textContent)).toEqual(["Post in community (optional)", "SE Lab", "Graph Lab"]);
      expect(community.value).toBe("cm2");
      expect(container.textContent).toContain("Publishing will also make you a member of this community.");
    } finally { await cleanup(); }
  });
  it("does not offer a banned or archived ?community= community", async () => {
    mocks.requested = { id: "cm3", slug: "closed-lab", name: "Closed Lab", status: "ARCHIVED", viewerMembership: undefined };
    const { container, cleanup } = await renderComposer("/forum/new?community=closed-lab");
    try {
      const community = container.querySelector<HTMLSelectElement>('select[aria-label="Post in community"]')!;
      expect(Array.from(community.options).map((option) => option.textContent)).toEqual(["Post in community (optional)", "SE Lab"]);
      expect(community.value).toBe("");
    } finally { await cleanup(); }
  });
  it("blocks publishing to a community until the email is verified, with a visible reason and a link", async () => {
    mocks.user = { emailVerifiedAt: null, systemRole: "USER" };
    const { container, cleanup } = await renderComposer("/forum/new?community=se-lab");
    try {
      const alert = container.querySelector('[role="alert"]');
      expect(alert?.textContent).toContain("Verify your email to start discussions in communities.");
      expect(alert?.querySelector('a[href="/verify-email"]')).not.toBeNull();
      expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
    } finally { await cleanup(); }
  });
  it("does not ask for email verification when no community is selected", async () => {
    mocks.user = { emailVerifiedAt: null, systemRole: "USER" };
    const { container, cleanup } = await renderComposer("/forum/new");
    try {
      expect(container.textContent).not.toContain("Verify your email to start discussions in communities.");
    } finally { await cleanup(); }
  });
  const failPublish = async (failure: unknown) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.create.mockReset().mockRejectedValueOnce(failure);
    const key = "lumigap:forum-draft:v1:all:QUESTION:none:none";
    localStorage.setItem(key, JSON.stringify({ type: "DISCUSSION", communityId: "category", title: "Academic question", content: "An academic discussion body.", tags: "methods" }));
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    const client = new QueryClient();
    try {
      await act(async () => { root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/forum/new"]}><ForumDiscussionComposer embedded /></MemoryRouter></QueryClientProvider>); });
      await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
      return container.querySelector("#discussion-error")?.textContent;
    } finally { await act(async () => root.unmount()); client.clear(); container.remove(); localStorage.removeItem(key); vi.unstubAllGlobals(); }
  };
  const apiFailure = (message: string) => Object.assign(new Error("Request failed"), { isAxiosError: true, response: { status: 403, data: { success: false, error: { code: "FORBIDDEN", message } } } });
  it("shows the API's reason next to Publish for unverified email, link limit, duplicate posts and restrictions", async () => {
    for (const message of ["Verify your email to start discussions in communities", "New accounts can include at most 2 links", "You already posted this discussion recently", "Your forum access is temporarily restricted"]) {
      expect(await failPublish(apiFailure(message))).toBe(message);
    }
  });
  it("falls back to the generic message when the failure has no API reason", async () => {
    expect(await failPublish(new Error("Network Error"))).toBe("Could not publish this discussion. Your draft has been kept. Please try again.");
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
