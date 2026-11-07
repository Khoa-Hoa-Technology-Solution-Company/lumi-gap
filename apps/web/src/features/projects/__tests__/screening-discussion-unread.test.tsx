// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import type { NotificationItem } from "@trend/shared-types";
import { ScreeningDiscussionUnread } from "../components/screening-discussion-unread";
import { useReadScreeningDiscussion } from "../hooks/use-screening-discussion-unread";

const mocks = vi.hoisted(() => ({ actor: "a", list: vi.fn(), read: vi.fn() }));
vi.mock("@/features/notifications/api/notifications.api", () => ({ notificationsApi: mocks }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (s: { user: { id: string } }) => unknown) => select({ user: { id: mocks.actor } }) }));
let root: Root, host: HTMLDivElement, client: QueryClient, items: NotificationItem[], documentVisible: boolean;
const notice = (id: string, extra: Partial<NotificationItem> = {}): NotificationItem => ({
  id, type: "SCREENING_DISCUSSION_MESSAGE", title: "Reviewer đã nhắn", message: "Mở trao đổi",
  targetKind: "project", targetId: "project", paperId: "paper", screeningRoundId: "round", screeningMessageId: id,
  isRead: false, createdAt: "2026-11-05T01:00:00Z", ...extra,
});
function Harness({ visible, loaded }: { visible: boolean; loaded: string[] }) {
  useReadScreeningDiscussion("round", loaded, visible);
  return <ScreeningDiscussionUnread roundId="round" />;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.clearAllMocks(); mocks.actor = "a";
  documentVisible = true;
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => documentVisible ? "visible" : "hidden");
  items = [notice("m1")];
  mocks.list.mockImplementation(async () => mocks.actor === "a" ? items : []);
  mocks.read.mockImplementation(async (id: string) => { items = items.map(item => item.id === id ? { ...item, isRead: true } : item); });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["notifications", "a"], items);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function render(visible = false, loaded: string[] = []) {
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><Harness visible={visible} loaded={loaded} /></MemoryRouter></QueryClientProvider>));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
}
it("shows only unread messages for this round with a working discussion link", async () => {
  items = [notice("m1"), notice("m2"), notice("read", { isRead: true }), notice("other", { screeningRoundId: "other" }), notice("decision", { type: "SCREENING_ACTION_REQUIRED" })];
  client.setQueryData(["notifications", "a"], items);
  await render();
  expect(host.textContent).toBe("2 tin nhắn mới");
  expect(host.querySelector("a")?.getAttribute("href")).toBe("/projects/project?tab=papers&view=my-work&paper=paper&round=round&section=discussion");
  expect(mocks.read).not.toHaveBeenCalled();
});
it("keeps unread state while the conversation or browser is hidden, then acknowledges only loaded messages", async () => {
  items = [notice("m1"), notice("m2")]; client.setQueryData(["notifications", "a"], items);
  await render(false, ["m1"]); expect(mocks.read).not.toHaveBeenCalled();
  documentVisible = false; await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  await render(true, ["m1"]); expect(mocks.read).not.toHaveBeenCalled();
  documentVisible = true; await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  await render(true, ["m1"]);
  expect(mocks.read.mock.calls).toEqual([["m1"]]); expect(host.textContent).toBe("1 tin nhắn mới");
  await render(true, ["m1", "m2"]);
  expect(mocks.read.mock.calls).toEqual([["m1"], ["m2"]]); expect(host.querySelector("a")).toBeNull();
});
it("does not dismiss new messages that have not arrived in the conversation yet", async () => {
  await render(true, []); expect(mocks.read).not.toHaveBeenCalled();
  await render(true, ["m1"]); expect(host.querySelector("a")).toBeNull();
  items = [...items, notice("m2")]; await act(async () => { client.setQueryData(["notifications", "a"], items); });
  await render(true, ["m1"]);
  expect(host.textContent).toBe("1 tin nhắn mới"); expect(mocks.read).toHaveBeenCalledTimes(1);
  await render(true, ["m1", "m2"]); expect(host.querySelector("a")).toBeNull();
});
it("keeps the indicator when marking as read fails without retrying in a loop", async () => {
  mocks.read.mockRejectedValue(new Error("Offline")); await render(true, ["m1"]);
  expect(host.textContent).toBe("1 tin nhắn mới"); expect(mocks.read).toHaveBeenCalledTimes(1);
});
it("does not reuse another account's cached unread messages", async () => {
  await render(); expect(host.textContent).toBe("1 tin nhắn mới");
  mocks.actor = "b"; await render(); expect(host.querySelector("a")).toBeNull();
});
