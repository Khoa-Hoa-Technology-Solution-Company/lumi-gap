// @vitest-environment jsdom
import { act, createContext, useContext } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ScreeningAuditView, ScreeningRoundView } from "@trend/shared-types";
import { RoundHistory } from "../components/screening-round-history";

const api = vi.hoisted(() => ({ history: vi.fn(), action: vi.fn(), streamEvents: vi.fn() }));
vi.mock("../api/screening.api", () => ({ screeningApi: api }));
const ActorContext = createContext("a");
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (s: unknown) => unknown) => select({ user: { id: useContext(ActorContext) } }) }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
let root: Root, container: HTMLDivElement, clients: QueryClient[], messages: ScreeningAuditView[];
const message = (index: number): ScreeningAuditView => ({ id: `m${String(index).padStart(3, "0")}`, type: "DISCUSSION", actorId: index % 2 ? "b" : "a", actorName: index % 2 ? "Bình" : "Anh", createdAt: new Date(Date.UTC(2026, 10, 2, 7, 0, index)).toISOString(), details: { comment: `Nội dung ${index}` } });
const round = {
  id: "round", active: true, hiddenReviews: false, finalDecision: null, status: "NEEDS_RESOLUTION",
  settings: { reviewMode: "INDEPENDENT" }, assignments: [], finalizer: { id: "owner", name: "Owner" }, myAssignmentId: "assignment", myReview: { id: "review" },
} as unknown as ScreeningRoundView;
async function settle(ms = 20) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
async function render(actors = ["a"], value = round, readOnly = false) {
  await act(async () => root.render(<>{actors.map((actor, index) => <div key={index} data-view={index}><ActorContext.Provider value={actor}><QueryClientProvider client={clients[index]!}><RoundHistory projectId="project" round={value} people={[]} readOnly={readOnly} /></QueryClientProvider></ActorContext.Provider></div>)}</>));
  await settle();
}
function view(index = 0) { return container.querySelector(`[data-view="${index}"]`)!; }
function button(label: string, index = 0) { return [...view(index).querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === label)!; }
async function fill(text: string, index = 0) {
  await act(async () => {
    const input = view(index).querySelector("textarea")!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function key(options: KeyboardEventInit = {}) {
  await act(async () => view().querySelector("textarea")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, ...options })));
  await settle();
}
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks();
  api.streamEvents.mockImplementation(() => new Promise(() => {}));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("matchMedia", () => ({ matches: false }));
  messages = [message(0), message(1), message(2)];
  api.history.mockImplementation(async (_project, _round, page, kind) => {
    const items = kind === "DISCUSSION" ? [...messages].reverse() : [];
    return { items: items.slice((page - 1) * 20, page * 20), total: items.length, page, pageSize: 20, hasNext: page * 20 < items.length };
  });
  api.action.mockImplementation(async (_project, _round, _action, payload) => { messages.push({ ...message(messages.length), actorId: "a", details: { comment: payload.comment } }); return {}; });
  clients = [0, 1].map(() => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } }));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); clients.forEach(client => client.clear()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("shows the same ordered conversation to both reviewers and polls the other client after a send", async () => {
  await render(["a", "b"]);
  for (const index of [0, 1]) {
    expect(button("Trao đổi (3)", index)).toBeDefined();
    expect([...view(index).querySelectorAll("[data-message-id]")].map(node => node.getAttribute("data-message-id"))).toEqual(["m000", "m001", "m002"]);
  }
  expect(view(0).querySelector('[data-message-id="m000"] [data-own="true"]')).not.toBeNull();
  expect(view(1).querySelector('[data-message-id="m001"] [data-own="true"]')).not.toBeNull();
  await fill("Đối chiếu tiêu chí quần thể"); await key();
  expect(button("Trao đổi (4)", 0)).toBeDefined();
  expect(button("Trao đổi (3)", 1)).toBeDefined();
  await settle(2500);
  for (const index of [0, 1]) {
    expect(button("Trao đổi (4)", index)).toBeDefined();
    expect(view(index).querySelectorAll("[data-message-id]")).toHaveLength(4);
    expect(view(index).textContent).toContain("Đối chiếu tiêu chí quần thể");
  }
});

it("uses the total count, loads older messages and deduplicates overlapping pages after polling", async () => {
  messages = Array.from({ length: 25 }, (_, index) => message(index));
  await render();
  expect(button("Trao đổi (25)")).toBeDefined(); expect(view().querySelectorAll("[data-message-id]")).toHaveLength(20);
  await act(async () => button("Xem tin nhắn trước").click()); await settle();
  expect(view().querySelectorAll("[data-message-id]")).toHaveLength(25);
  messages.push(message(25)); await settle(2500);
  expect(view().querySelectorAll("[data-message-id]")).toHaveLength(26);
  const ids = [...view().querySelectorAll("[data-message-id]")].map(node => node.getAttribute("data-message-id"));
  expect(new Set(ids).size).toBe(26); expect(ids[0]).toBe("m000"); expect(ids.at(-1)).toBe("m025");
  expect(button("Trao đổi (26)")).toBeDefined();
});

it("keeps the draft on failure, reuses the retry key and respects multiline/IME/mobile input", async () => {
  api.action.mockRejectedValueOnce(new Error("offline"));
  await render(); await fill("Ý kiến riêng");
  await key({ shiftKey: true }); await key({ isComposing: true }); await key({ keyCode: 229 });
  vi.stubGlobal("matchMedia", () => ({ matches: true })); await key(); expect(api.action).not.toHaveBeenCalled();
  vi.stubGlobal("matchMedia", () => ({ matches: false })); await key();
  expect(view().querySelector("textarea")!.value).toBe("Ý kiến riêng"); expect(view().querySelector('[role="alert"]')).not.toBeNull();
  await key(); expect(api.action).toHaveBeenCalledTimes(2);
  expect(api.action.mock.calls[0]![3].clientKey).toBe(api.action.mock.calls[1]![3].clientKey);
  expect(view().querySelector("textarea")!.value).toBe("");
});

it("retains a draft across history tabs and separates drafts and cache when the account changes", async () => {
  await render(); await fill("Bản nháp của Anh");
  await act(async () => button("Lịch sử đánh giá").click()); await settle();
  await act(async () => button("Trao đổi (3)").click()); await settle();
  expect(view().querySelector("textarea")!.value).toBe("Bản nháp của Anh");
  await render(["b"]);
  expect(view().querySelector("textarea")!.value).toBe("");
  expect(clients[0]!.getQueryCache().findAll().some(query => query.queryKey.includes("b"))).toBe(true);
});

it.each(["case", "hidden", "final", "inactive", "observer", "readonly"])("does not offer a composer for %s", async condition => {
  const value = { ...round,
    ...(condition === "case" ? { adjudicationCase: { id: "case" } } : {}),
    ...(condition === "hidden" ? { hiddenReviews: true } : {}),
    ...(condition === "final" ? { finalDecision: { decision: "EXCLUDED" } } : {}),
    ...(condition === "inactive" ? { active: false } : {}),
    ...(condition === "observer" ? { myReview: null, myAssignmentId: null } : {}),
  } as ScreeningRoundView;
  await render(["a"], value, condition === "readonly"); expect(view().querySelector("textarea")).toBeNull();
  expect(api.action).not.toHaveBeenCalled();
});

it("renders redacted records and user content as safe text", async () => {
  messages = [{ ...message(0), details: null }, { ...message(1), details: { comment: '<img src=x onerror="alert(1)">' } }];
  await render();
  expect(view().textContent).toContain("Nội dung đang được ẩn"); expect(view().textContent).toContain('<img src=x onerror="alert(1)">');
  expect(view().querySelector(".project-chat-bubble img")).toBeNull();
});

it("identifies my messages by the server assignment when auth uses a migrated public ID", async () => {
  await render(["legacy-public-id"], { ...round, myReview: { ...round.myReview!, reviewerId: "a" } });
  expect(view().querySelector('[data-message-id="m000"] [data-own="true"]')).not.toBeNull();
  expect(view().querySelector('[data-message-id="m001"] [data-own="false"]')).not.toBeNull();
  expect(view().textContent).toContain("Anh (Bạn)");
});

it("refetches authorized history on stream events and releases the stream while history is selected", async () => {
  await render();
  const stream = api.streamEvents.mock.calls[0]![2];
  expect(view().textContent).toContain("Cập nhật tự động");
  await act(async () => stream.onOpen()); await settle();
  expect(view().textContent).toContain("Đang kết nối trực tiếp");
  messages.push(message(3));
  await act(async () => stream.onEvent({ type: "comment", comment: "Untrusted stream content" })); await settle();
  expect(button("Trao đổi (4)")).toBeDefined(); expect(view().textContent).not.toContain("Untrusted stream content");
  await act(async () => button("Lịch sử đánh giá").click()); await settle();
  expect(stream.signal.aborted).toBe(true);
});

it("falls back to polling after stream failure", async () => {
  api.streamEvents.mockRejectedValue(new Error("disconnected"));
  await render(); messages.push(message(3)); await settle(2500);
  expect(button("Trao đổi (4)")).toBeDefined();
  expect(view().textContent).toContain("Cập nhật tự động");
});
