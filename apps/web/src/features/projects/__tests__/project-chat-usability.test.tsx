// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProjectDiscussionPanel } from "../components/project-discussion-panel";
import { useChatScroll } from "../hooks/use-chat-scroll";

const api = vi.hoisted(() => ({ listMessages: vi.fn(), sendMessage: vi.fn(), markRead: vi.fn(), deleteMessage: vi.fn(), streamEvents: vi.fn() }));
const ai = vi.hoisted(() => ({ listHistory: vi.fn(), sendMessage: vi.fn(), streamEvents: vi.fn() }));
vi.mock("../api/project-team-chat.api", () => ({ projectTeamChatApi: api }));
vi.mock("../api/project-chat.api", () => ({ projectChatApi: ai }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (state: unknown) => unknown) => select({ user: { id: "me", fullName: "Researcher", systemRole: "USER" } }) }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ language: "en", t: (key: string) => key }) }));
let root: Root, container: HTMLDivElement, client: QueryClient;
const sent = { id: "sent", sender: { id: "me" }, content: "Hello", createdAt: "2026-10-17T12:00:00Z", readBy: [], readCount: 1 };
async function render(node: ReactNode) {
  await act(async () => { root.render(<QueryClientProvider client={client}><MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{node}</MemoryRouter></QueryClientProvider>); });
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
it.each([["My AI", "private"], ["Team AI Room", "team"]])("loads over 50 %s messages with tied prompt-answer times without duplicates", async (label, scope) => {
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
  await render(<ProjectDiscussionPanel projectId="p" paperCount={2} />); await channel(label!);
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
  if (scope === "team") {
    messages[1] = { ...messages[1]!, content: "Updated historical answer" };
    const stream = ai.streamEvents.mock.calls[0]![1] as { onEvent: (event: unknown) => void };
    await act(async () => stream.onEvent({ type: "message.updated", message: messages[1] }));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); });
    checkMessages();
  }
  messages.push(...turn(27));
  await act(async () => { await client.invalidateQueries({ queryKey: ["project-chat", "p", scope, "me"] }); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); });
  checkMessages();
});
it("keeps separate drafts in team chat, private AI and team AI", async () => {
  await render(<ProjectDiscussionPanel projectId="p" paperCount={2} />); await fill("Team update");
  await channel("My AI"); expect(container.querySelector("textarea")!.value).toBe(""); await fill("Private question");
  await channel("Team AI Room"); expect(container.querySelector("textarea")!.value).toBe(""); await fill("Shared question");
  await channel("My AI"); expect(container.querySelector("textarea")!.value).toBe("Private question");
  await channel("Team Chat"); expect(container.querySelector("textarea")!.value).toBe("Team update");
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
