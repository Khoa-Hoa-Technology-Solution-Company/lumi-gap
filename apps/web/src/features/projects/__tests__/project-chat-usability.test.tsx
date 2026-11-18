// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProjectDiscussionPanel } from "../components/project-discussion-panel";
import { useChatScroll } from "../hooks/use-chat-scroll";

const api = vi.hoisted(() => ({ listMessages: vi.fn(), sendMessage: vi.fn(), markRead: vi.fn(), deleteMessage: vi.fn(), streamEvents: vi.fn(), references: vi.fn(), reference: vi.fn() }));
const ai = vi.hoisted(() => ({ listHistory: vi.fn(), sendMessage: vi.fn(), streamEvents: vi.fn() }));
vi.mock("../api/project-team-chat.api", () => ({ projectTeamChatApi: api }));
vi.mock("../api/project-chat.api", () => ({ projectChatApi: ai }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (state: unknown) => unknown) => select({ user: { id: "me", fullName: "Researcher", systemRole: "USER" } }) }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ language: "en", t: (key: string) => key }) }));
let root: Root, container: HTMLDivElement, client: QueryClient;
const sent = { id: "sent", sender: { id: "me" }, content: "Hello", createdAt: "2026-10-17T12:00:00Z", readBy: [], readCount: 1 };
async function render(node: ReactNode, initialEntry = "/projects/p?tab=chat") {
  await act(async () => { root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[initialEntry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{node}</MemoryRouter></QueryClientProvider>); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); });
}
async function fill(value: string) {
  const input = container.querySelector("textarea")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
}
async function key(key: string, options: KeyboardEventInit = {}) {
  await act(async () => { container.querySelector("textarea")!.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...options })); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); });
}
async function channel(label: string) {
  await act(async () => { [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(item => item.textContent === label)!.click(); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => { callback(); return 0; });
  vi.resetAllMocks();
  sessionStorage.clear();
  api.references.mockResolvedValue([]); api.reference.mockResolvedValue({ kind: "PAPER", id: "00000000-0000-4000-8000-000000000001", title: "Shared paper", href: "/projects/p?tab=papers&paper=paper" });
  api.listMessages.mockResolvedValue([]); api.sendMessage.mockResolvedValue(sent);
  api.streamEvents.mockImplementation(() => new Promise(() => {}));
  ai.listHistory.mockResolvedValue([]); ai.streamEvents.mockImplementation(() => new Promise(() => {}));
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); vi.unstubAllGlobals(); });

it("sends with Enter, but keeps Shift+Enter and IME composition for writing", async () => {
  await render(<ProjectDiscussionPanel projectId="p" paperCount={2} />); await fill("Hello");
  await key("Enter", { shiftKey: true }); await key("Enter", { isComposing: true }); await key("Enter", { keyCode: 229 });
  expect(api.sendMessage).not.toHaveBeenCalled();
  await key("Enter"); expect(api.sendMessage).toHaveBeenCalledWith("p", "Hello", expect.any(String));
  expect(container.querySelector("textarea")!.value).toBe("");
  expect(document.activeElement).toBe(container.querySelector("textarea"));
});
it("preserves the message on send failure and allows retry", async () => {
  api.sendMessage.mockRejectedValueOnce(new Error("Disconnected"));
  await render(<ProjectDiscussionPanel projectId="p" paperCount={2} />); await fill("Hello"); await key("Enter");
  expect(container.querySelector("textarea")!.value).toBe("Hello"); expect(container.querySelector('[role="alert"]')).not.toBeNull();
  await key("Enter"); expect(api.sendMessage).toHaveBeenCalledTimes(2); expect(container.querySelector("textarea")!.value).toBe("");
  expect(api.sendMessage.mock.calls[1]![2]).toBe(api.sendMessage.mock.calls[0]![2]);
});
it("gives an edited failed team message a new receipt and blocks synchronous duplicate submits", async () => {
  api.sendMessage.mockRejectedValueOnce(new Error("Disconnected"));
  await render(<ProjectDiscussionPanel projectId="p" paperCount={2} />); await fill("First version"); await key("Enter");
  await fill("Revised version");
  await act(async () => { const form = container.querySelector("form")!; form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(api.sendMessage).toHaveBeenCalledTimes(2);
  expect(api.sendMessage.mock.calls[1]![2]).not.toBe(api.sendMessage.mock.calls[0]![2]);
});
it("loads older team history without dropping recent messages", async () => {
  const recent = Array.from({ length: 50 }, (_, index) => ({ ...sent, id: `recent-${index}`, content: `Recent ${index}`, createdAt: `2026-10-17T12:${String(index).padStart(2, "0")}:00Z` }));
  api.listMessages.mockImplementation(async (_project, params) => params ? [{ ...sent, id: "old", content: "Older retained conversation", createdAt: "2026-10-16T12:00:00Z" }] : recent);
  await render(<ProjectDiscussionPanel projectId="p" paperCount={2} />);
  await act(async () => [...container.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === "Load older messages")!.click());
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); });
  expect(api.listMessages).toHaveBeenLastCalledWith("p", { limit: 50, beforeId: "recent-0" });
  expect(container.textContent).toContain("Older retained conversation"); expect(container.textContent).toContain("Recent 49");
  expect([...container.querySelectorAll("button")].some(item => item.textContent === "Load older messages")).toBe(false);
});
it.each([false, true])("keeps rapid AI turns in server order when serialized timestamps coincide: %s", async sameMillisecond => {
  const timestamp = (second: number) => `2026-10-17T12:00:0${sameMillisecond ? 0 : second}Z`;
  ai.listHistory.mockResolvedValue([
    { id: "q1", role: "user", content: "First question", createdAt: timestamp(0), citedPaperIds: [] },
    { id: "a1", role: "assistant", content: "First answer", createdAt: timestamp(1), citedPaperIds: [] },
    { id: "q2", role: "user", content: "Second question", createdAt: timestamp(2), citedPaperIds: [] },
    { id: "a2", role: "assistant", content: "Second answer", createdAt: timestamp(3), citedPaperIds: [] },
  ]);
  await render(<ProjectDiscussionPanel projectId="p" paperCount={2} />); await channel("My AI");
  const text = container.textContent!;
  expect(text.indexOf("First answer")).toBeLessThan(text.indexOf("Second question"));
  expect([...container.querySelectorAll<HTMLAnchorElement>("a")].find(item => item.textContent?.includes("Open manuscripts"))?.getAttribute("href")).toBe("/projects/p?tab=manuscripts");
  expect([...container.querySelectorAll<HTMLAnchorElement>("a")].find(item => item.textContent?.includes("Explore gaps"))?.getAttribute("href")).toBe("/projects/p?tab=gaps");
});
it("loads over 50 My AI messages with tied prompt-answer times without duplicates", async () => {
  const label = "My AI";
  const scope = "private";
  const turn = (index: number) => {
    const createdAt = new Date(Date.UTC(2026, 9, 17, 12, 0, index)).toISOString();
    return [
      { id: `z-question-${index}`, role: "user", content: `Question ${index}`, createdAt, citedPaperIds: [] },
      { id: `a-answer-${index}`, role: "assistant", content: `Answer ${index}`, createdAt, citedPaperIds: [] },
    ];
  };
  const messages = Array.from({ length: 27 }, (_, index) => turn(index)).flat();
  ai.listHistory.mockImplementation(async (_project, _limit, _scope, beforeId) => {
    if (!beforeId) return messages.slice(-50);
    const index = messages.findIndex(item => item.id === beforeId);
    // Defend against overlapping cached pages while newer replies refresh.
    return messages.slice(Math.max(0, index - 50), index + 1);
  });
  await render(<ProjectDiscussionPanel projectId="p" paperCount={2} />); await channel(label);
  expect(container.textContent).not.toContain("Question 0");
  await act(async () => [...container.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === "Load older messages")!.click());
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); });
  expect(ai.listHistory).toHaveBeenLastCalledWith("p", 50, scope, "z-question-2");
  const checkMessages = () => {
    const paragraphs = [...container.querySelectorAll("p")];
    for (const item of messages) expect(paragraphs.filter(node => node.textContent === item.content), item.content).toHaveLength(1);
    const text = container.textContent!;
    for (let index = 0; index < messages.length / 2; index++) {
      const question = text.indexOf(messages[index * 2]!.content), answer = text.indexOf(messages[index * 2 + 1]!.content);
      expect(question).toBeLessThan(answer);
      if (index > 0) expect(text.indexOf(messages[index * 2 - 1]!.content)).toBeLessThan(question);
    }
  };
  checkMessages();
  expect([...container.querySelectorAll("button")].some(item => item.textContent === "Load older messages")).toBe(false);
  messages.push(...turn(27));
  await act(async () => { await client.invalidateQueries({ queryKey: ["project-chat", "p", scope, "me"] }); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); });
  checkMessages();
});
it("keeps separate drafts in team chat and private AI and removes Team AI Room", async () => {
  await render(<ProjectDiscussionPanel projectId="p" paperCount={2} />, "/projects/p?tab=chat&channel=team-ai");
  expect([...container.querySelectorAll('[role="tab"]')].map(item => item.textContent)).toEqual(["Team Chat", "My AI", "With mentors"]);
  expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Team Chat");
  await fill("Team update");
  await channel("My AI"); expect(container.querySelector("textarea")!.value).toBe(""); await fill("Private question");
  await channel("Team Chat"); expect(container.querySelector("textarea")!.value).toBe("Team update");
  await channel("My AI"); expect(container.querySelector("textarea")!.value).toBe("Private question");
  await render(<ProjectDiscussionPanel projectId="other" paperCount={2} />); expect(container.querySelector("textarea")!.value).toBe("");
});
it.each(["Team Chat", "My AI"])("retains a revised %s draft when an earlier send finishes after switching channels", async label => {
  let finish!: (result: unknown) => void;
  const send = label === "Team Chat" ? api.sendMessage : ai.sendMessage;
  send.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await render(<ProjectDiscussionPanel projectId="p" paperCount={2} />);
  if (label === "My AI") await channel(label);
  await fill("Earlier question"); await key("Enter");
  await channel(label === "Team Chat" ? "My AI" : "Team Chat"); await channel(label);
  await fill("Revised unsent question");
  await act(async () => finish(label === "Team Chat" ? sent : { answer: "Saved answer" }));
  expect(container.querySelector("textarea")?.value).toBe("Revised unsent question");
});
it("uses the Send button for touch devices, preserving Enter for new lines", async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  await render(<ProjectDiscussionPanel projectId="p" paperCount={2} />); await fill("Hello"); await key("Enter");
  expect(api.sendMessage).not.toHaveBeenCalled();
  await act(async () => { container.querySelector<HTMLButtonElement>('button[type="submit"]')!.click(); });
  expect(api.sendMessage).toHaveBeenCalledWith("p", "Hello", expect.any(String));
});
it("does not pull readers away from old messages and resumes following on request", async () => {
  function Feed({ latest }: { latest: string }) {
    const scroll = useChatScroll(latest);
    return <><div ref={scroll.containerRef} onScroll={scroll.onScroll} data-feed />{!scroll.atBottom && <button onClick={scroll.jumpToLatest}>{scroll.hasNewMessages ? "New messages" : "Jump to latest"}</button>}</>;
  }
  await render(<Feed latest="one" />);
  const feed = container.querySelector<HTMLElement>("[data-feed]")!;
  Object.defineProperties(feed, { scrollHeight: { value: 1000 }, clientHeight: { value: 200 } });
  await act(async () => { feed.scrollTop = 100; feed.dispatchEvent(new Event("scroll", { bubbles: true })); });
  await render(<Feed latest="two" />); expect(feed.scrollTop).toBe(100); expect(container.textContent).toBe("New messages");
  await act(async () => { container.querySelector("button")!.click(); }); expect(feed.scrollTop).toBe(1000); expect(container.querySelector("button")).toBeNull();
  await render(<Feed latest="three" />); expect(feed.scrollTop).toBe(1000);
});

async function button(label: string) {
  const target = [...document.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === label || item.getAttribute("aria-label") === label);
  expect(target, label).toBeDefined();
  await act(async () => target!.click());
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
}
it("preselects a paper from Library without sending and sends the original reference IDs", async () => {
  const id = "00000000-0000-4000-8000-000000000001";
  await render(<ProjectDiscussionPanel projectId="p" paperCount={2} />, `/projects/p?tab=chat&channel=team-chat&shareKind=PAPER&shareId=${id}`);
  expect(container.textContent).toContain("Shared paper"); expect(api.sendMessage).not.toHaveBeenCalled();
  await button("Send");
  expect(api.sendMessage).toHaveBeenCalledWith("p", "", expect.any(String), { reference: { kind: "PAPER", id }, replyToId: undefined });
});
it("removes a selected research reference and never shares it into personal AI", async () => {
  await render(<ProjectDiscussionPanel projectId="p" paperCount={2} />, "/projects/p?tab=chat&shareKind=PAPER&shareId=00000000-0000-4000-8000-000000000001");
  await channel("My AI"); expect(container.textContent).not.toContain("Shared paper");
  await channel("Team Chat"); expect(container.textContent).toContain("Shared paper");
  await button("chat.removeReference"); expect(container.textContent).not.toContain("Shared paper");
});
it("hides cached reference metadata after access revocation", async () => {
  const ref = { kind: "PAPER", id: "00000000-0000-4000-8000-000000000001" };
  api.listMessages.mockResolvedValue([{ ...sent, reference: ref }]);
  await render(<ProjectDiscussionPanel projectId="p" paperCount={2} />); await act(async () => { await new Promise(resolve => setTimeout(resolve, 40)); }); expect(container.textContent).toContain("Shared paper");
  api.reference.mockRejectedValue(new Error("Access revoked"));
  await act(async () => { await client.invalidateQueries({ queryKey: ["chat-reference"] }); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); }); expect(container.textContent).not.toContain("Shared paper"); expect(container.textContent).toContain("chat.referenceUnavailable");
});
it("searches server history with debounce and locates an old message outside the loaded page", async () => {
  const old = { ...sent, id: "old-source", content: "Old methodological decision" };
  api.listMessages.mockImplementation(async (_project, query) => query?.q ? [old] : query?.aroundId ? [old] : [sent]);
  await render(<ProjectDiscussionPanel projectId="p" paperCount={2} />); await button("chat.search");
  const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "method"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 300)); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  expect(api.listMessages).toHaveBeenCalledWith("p", { q: "method", limit: 30, beforeId: undefined });
  await act(async () => container.querySelector<HTMLButtonElement>(".research-chat-search-results > button")!.click());
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  expect(api.listMessages).toHaveBeenCalledWith("p", { aroundId: "old-source", limit: 50 }); expect(container.querySelector('[data-highlight="true"]')?.textContent).toContain(old.content);
});
it("renders deleted reply placeholders and treats dangerous text as text", async () => {
  api.listMessages.mockResolvedValue([{ ...sent, content: '<img src=x onerror="alert(1)"> 研究', replyTo: { id: "removed", content: "", sender: { id: "them" }, isDeleted: true } }]);
  await render(<ProjectDiscussionPanel projectId="p" paperCount={2} />);
  expect(container.textContent).toContain("This message was removed."); expect(container.textContent).toContain("<img"); expect(container.querySelector("img")).toBeNull();
});
it("fetches every missed page on reconnect rather than losing messages beyond the latest 50", async () => {
  const old = { ...sent, id: "old", createdAt: "2026-10-16T12:00:00Z" };
  api.listMessages.mockResolvedValueOnce([old]);
  await render(<ProjectDiscussionPanel projectId="p" paperCount={2} />);
  const missed = Array.from({ length: 100 }, (_, i) => ({ ...sent, id: `missed-${i}`, content: `Missed ${i}`, createdAt: `2026-10-17T12:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}Z` }));
  api.listMessages.mockImplementation(async (_project, query) => query?.afterId === "old" ? missed : query?.afterId ? [sent] : [sent]);
  await act(async () => { await client.invalidateQueries({ queryKey: ["project-team-chat"] }); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 40)); });
  expect(api.listMessages).toHaveBeenCalledWith("p", { afterId: "old", limit: 100 }); expect(container.textContent).toContain("Missed 0"); expect(container.textContent).toContain("Missed 99");
});
it("preserves the visual scroll anchor when older history is prepended", async () => {
  const rows = Array.from({ length: 50 }, (_, i) => ({ ...sent, id: `msg-${i}`, createdAt: `2026-10-17T12:${String(i).padStart(2, "0")}:00Z` }));
  api.listMessages.mockImplementation(async (_project, query) => query?.beforeId ? [{ ...sent, id: "older", createdAt: "2026-10-16T12:00:00Z" }] : rows);
  await render(<ProjectDiscussionPanel projectId="p" paperCount={2} />);
  const feed = container.querySelector<HTMLElement>('[role="log"]')!;
  Object.defineProperties(feed, { scrollHeight: { configurable: true, get: () => container.textContent?.includes("Yesterday source") ? 1500 : 1000 }, clientHeight: { value: 200 } });
  api.listMessages.mockImplementation(async (_project, query) => query?.beforeId ? [{ ...sent, id: "older", content: "Yesterday source", createdAt: "2026-10-16T12:00:00Z" }] : rows);
  await act(async () => { feed.scrollTop = 100; feed.dispatchEvent(new Event("scroll", { bubbles: true })); });
  await button("Load older messages"); expect(feed.scrollTop).toBe(600);
});

it("does not duplicate a pending bubble when SSE arrives before the HTTP acknowledgement", async () => {
  let emit!: (event: unknown) => void, finish!: (message: unknown) => void;
  api.streamEvents.mockImplementation((_project, options) => { emit = options.onEvent; return new Promise(() => {}); });
  api.sendMessage.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await render(<ProjectDiscussionPanel projectId="p" paperCount={2} />); await fill("One logical message"); await key("Enter");
  const echoed = { ...sent, content: "One logical message", clientKey: api.sendMessage.mock.calls[0]![2] };
  await act(async () => emit({ type: "message.created", message: echoed }));
  expect([...container.querySelectorAll(".project-chat-bubble > p")].filter(p => p.textContent === "One logical message")).toHaveLength(1);
  await act(async () => finish(echoed));
});
it("redacts reply text when the deleted original was outside the loaded page", async () => {
  let emit!: (event: unknown) => void;
  api.streamEvents.mockImplementation((_project, options) => { emit = options.onEvent; return new Promise(() => {}); });
  api.listMessages.mockResolvedValue([{ ...sent, replyTo: { id: "old", sender: { id: "them" }, content: "Original removed content", isDeleted: false } }]);
  await render(<ProjectDiscussionPanel projectId="p" paperCount={2} />); expect(container.textContent).toContain("Original removed content");
  await act(async () => emit({ type: "message.deleted", message: { ...sent, id: "old", content: "", isDeleted: true } }));
  expect(container.textContent).not.toContain("Original removed content"); expect(container.textContent).toContain("This message was removed.");
});
it("keeps following resized content only while the reader stays at the bottom", async () => {
  let notify!: () => void;
  vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { notify = callback; } observe() {} disconnect() {} });
  function Feed() { const scroll = useChatScroll("latest"); return <div ref={scroll.containerRef} onScroll={scroll.onScroll} data-feed />; }
  await render(<Feed />); const feed = container.querySelector<HTMLElement>("[data-feed]")!;
  Object.defineProperties(feed, { scrollHeight: { value: 1000 }, clientHeight: { value: 200 } });
  await act(async () => notify()); expect(feed.scrollTop).toBe(1000);
  await act(async () => { feed.scrollTop = 100; feed.dispatchEvent(new Event("scroll", { bubbles: true })); notify(); }); expect(feed.scrollTop).toBe(100);
});
