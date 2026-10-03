// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Link, MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminTrustSafetyPage } from "@/pages/admin/trust-safety";
import { ForumModerationPage } from "@/pages/forum/forum-moderation";
import { ForumCopyrightPage } from "@/pages/forum/forum-copyright";
import { CopyrightVerifyPage } from "@/pages/copyright-verify";

const mocks = vi.hoisted(() => ({ queue: vi.fn(), actions: vi.fn(), reportAction: vi.fn(), submitAppeal: vi.fn(), submitCopyrightClaim: vi.fn(), verify: vi.fn() }));
vi.mock("@/services/api-client", () => ({ api: { post: mocks.verify } }));
vi.mock("@/features/forum/api/forum.api", () => ({ forumApi: { moderationQueue: mocks.queue, myModerationActions: mocks.actions, reportAction: mocks.reportAction, submitAppeal: mocks.submitAppeal, submitCopyrightClaim: mocks.submitCopyrightClaim, restrictions: async () => [], copyrightClaims: async () => [], appeals: async () => [] } }));
vi.mock("@/features/admin/hooks/use-admin-users", () => ({ useAdminUsers: () => ({ data: { data: [{ id: "admin", fullName: "Admin" }] } }) }));
vi.mock("@/features/forum/hooks/use-forum", () => ({ useCommunities: () => ({ data: [] }) }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: "admin" } }) }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));

let root: Root, container: HTMLDivElement, qc: QueryClient;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.queue.mockResolvedValue([{ id: "report", targetType: "RESPONSE", targetId: "response", commentId: "response", postId: "topic", status: "open", reason: "OFF_TOPIC", version: 7, createdAt: "2026-10-01T00:00:00Z", contentSnapshot: { title: "A discussion", body: "Reported response" } }]);
  mocks.actions.mockResolvedValue([]); mocks.reportAction.mockResolvedValue(undefined); mocks.submitAppeal.mockResolvedValue(undefined); mocks.verify.mockReset().mockResolvedValue({ data: { accepted: true } });
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); qc.clear(); container.remove(); vi.clearAllMocks(); });
async function render(page: React.ReactNode, route = "/") {
  await act(async () => { root.render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={[route]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{page}</MemoryRouter></QueryClientProvider>); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
}
async function fill(field: HTMLTextAreaElement | HTMLInputElement, value: string) {
  await act(async () => { Object.getOwnPropertyDescriptor(field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(field, value); field.dispatchEvent(new Event("input", { bubbles: true })); });
}

describe("forum moderation workflows", () => {
  it("links a response report to its discussion and only offers response actions", async () => {
    await render(<AdminTrustSafetyPage />);
    expect(container.querySelector('a[href="/forum/topic#comment-response"]')).not.toBeNull();
    const options = Array.from(container.querySelectorAll("option")).map((item) => item.value);
    expect(options).not.toContain("LOCK_THREAD"); expect(options).not.toContain("MOVE_THREAD");
    expect(options).toContain("HIDE_CONTENT");
    const apply = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Apply decision")!;
    expect(container.querySelector("textarea")!.maxLength).toBe(2000);
    expect(apply.disabled).toBe(true);
    await fill(container.querySelector("textarea")!, "Reviewed the complete context");
    await act(async () => apply.click());
    expect(mocks.reportAction).toHaveBeenCalledWith("report", "DISMISS_REPORT", { expectedVersion: 7, reason: "Reviewed the complete context" });
  });
  it("preserves the appeal reason and sends it for the affected decision", async () => {
    mocks.actions.mockResolvedValue([{ id: "decision", action: "HIDE_CONTENT", reason: "Original reason", createdAt: "2026-10-01T00:00:00Z", postId: "topic", canAppeal: true, deadline: "2026-11-01T00:00:00Z" }]);
    await render(<ForumModerationPage />);
    await fill(container.querySelector("textarea")!, "Please consider the source context");
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(mocks.submitAppeal).toHaveBeenCalledWith("decision", "Please consider the source context");
  });
  it("does not offer another appeal after one has been submitted", async () => {
    mocks.actions.mockResolvedValue([{ id: "decision", action: "HIDE_CONTENT", createdAt: "2026-10-01T00:00:00Z", canAppeal: false, deadline: "2026-11-01T00:00:00Z", appeal: { id: "appeal", status: "SUBMITTED", reason: "Context to review", submittedAt: "2026-10-02T00:00:00Z" } }]);
    await render(<ForumModerationPage />);
    expect(container.querySelector("textarea")).toBeNull();
    expect(container.textContent).toContain("Context to review");
    expect(container.textContent).toContain("SUBMITTED");
  });
  it("carries the exact response identifier into copyright intake", async () => {
    await render(<ForumCopyrightPage />, "/forum/copyright?type=RESPONSE&id=12345678-1234-1234-1234-123456789abc");
    expect(container.querySelector<HTMLSelectElement>("select")?.value).toBe("RESPONSE");
    expect(Array.from(container.querySelectorAll("input")).some((field) => field.value === "12345678-1234-1234-1234-123456789abc")).toBe(true);
    expect(mocks.submitCopyrightClaim).not.toHaveBeenCalled();
  });
  it("verifies once in StrictMode and keeps the successful result after remount", async () => {
    await render(<StrictMode><CopyrightVerifyPage /></StrictMode>, "/copyright/verify?token=one-time-token");
    expect(mocks.verify).toHaveBeenCalledTimes(1);
    expect(mocks.verify).toHaveBeenCalledWith("/forum/copyright-claims/verify", { token: "one-time-token" });
    expect(container.textContent).toContain("Your claim was received and is ready for review.");
    await act(async () => root.render(null));
    await render(<CopyrightVerifyPage />, "/copyright/verify?token=one-time-token");
    expect(mocks.verify).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Your claim was received and is ready for review.");
  });
  it("shows an invalid link without sending a verification request when the token is missing", async () => {
    await render(<CopyrightVerifyPage />, "/copyright/verify");
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("invalid or expired");
  });
  it("does not let a stale success overwrite the result of a different token", async () => {
    let finishFirst!: () => void;
    mocks.verify.mockImplementation((_path: string, { token }: { token: string }) => token === "first" ? new Promise<void>((resolve) => { finishFirst = resolve; }) : Promise.reject(new Error("Invalid token")));
    await render(<><CopyrightVerifyPage /><Link to="?token=second">Change link</Link></>, "/copyright/verify?token=first");
    await act(async () => container.querySelector<HTMLAnchorElement>('a[href="/copyright/verify?token=second"]')!.click());
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    await act(async () => { finishFirst(); await new Promise((resolve) => setTimeout(resolve, 10)); });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("invalid or expired");
    expect(mocks.verify).toHaveBeenCalledTimes(2);
  });
});
