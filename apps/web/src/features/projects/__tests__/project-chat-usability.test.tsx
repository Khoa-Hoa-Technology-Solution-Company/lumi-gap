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
  await key("Enter"); expect(api.sendMessage).toHaveBeenCalledWith("p", "Hello");
  expect(container.querySelector("textarea")!.value).toBe("");
  expect(document.activeElement).toBe(container.querySelector("textarea"));
});
it("preserves the message on send failure and allows retry", async () => {
  api.sendMessage.mockRejectedValueOnce(new Error("Disconnected"));
  await render(<ProjectDiscussionPanel projectId="p" paperCount={2} />); await fill("Hello"); await key("Enter");
  expect(container.querySelector("textarea")!.value).toBe("Hello"); expect(container.querySelector('[role="alert"]')).not.toBeNull();
  await key("Enter"); expect(api.sendMessage).toHaveBeenCalledTimes(2); expect(container.querySelector("textarea")!.value).toBe("");
});
it("keeps separate drafts in team chat, private AI and team AI", async () => {
  await render(<ProjectDiscussionPanel projectId="p" paperCount={2} />); await fill("Team update");
  await channel("My AI"); expect(container.querySelector("textarea")!.value).toBe(""); await fill("Private question");
  await channel("Team AI Room"); expect(container.querySelector("textarea")!.value).toBe(""); await fill("Shared question");
  await channel("My AI"); expect(container.querySelector("textarea")!.value).toBe("Private question");
  await channel("Team Chat"); expect(container.querySelector("textarea")!.value).toBe("Team update");
  await render(<ProjectDiscussionPanel projectId="other" paperCount={2} />); expect(container.querySelector("textarea")!.value).toBe("");
});
it("uses the Send button for touch devices, preserving Enter for new lines", async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  await render(<ProjectDiscussionPanel projectId="p" paperCount={2} />); await fill("Hello"); await key("Enter");
  expect(api.sendMessage).not.toHaveBeenCalled();
  await act(async () => { container.querySelector<HTMLButtonElement>('button[type="submit"]')!.click(); });
  expect(api.sendMessage).toHaveBeenCalledWith("p", "Hello");
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
