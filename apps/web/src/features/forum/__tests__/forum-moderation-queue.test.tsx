// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ForumModerationQueue } from "../components/forum-moderation-queue";

const mocks = vi.hoisted(() => ({ reports: vi.fn(), claim: vi.fn(), action: vi.fn(), success: vi.fn(), error: vi.fn(), history: vi.fn() }));
vi.mock("@/features/forum", () => ({ useForumReports: mocks.reports, useForumModerationActions: mocks.history }));
vi.mock("../api/forum.api", () => ({ forumApi: { claimReport: mocks.claim, reportAction: mocks.action } }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));

const report = { id: "report", postId: "topic", targetType: "comment", targetId: "response", reason: "OTHER", status: "open", version: 7, target: { excerpt: "Reported response", status: "active" }, reporter: { fullName: "Reporter" }, createdAt: "2026-10-01T00:00:00Z" };
let root: Root, container: HTMLDivElement, client: QueryClient;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.reports.mockReturnValue({ data: [report] });
  mocks.history.mockReturnValue({ data: [] });
  mocks.claim.mockReset().mockResolvedValue({ version: 8 });
  mocks.action.mockReset().mockResolvedValue(undefined);
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); vi.clearAllMocks(); });
async function render() {
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><ForumModerationQueue communityId="community" /></MemoryRouter></QueryClientProvider>));
}
async function escalate() {
  await act(async () => Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Escalate to Admin")!.click());
}

describe("community report escalation", () => {
  it("links to the response and escalates using the version returned by the claim", async () => {
    await render();
    expect(container.querySelector('a[href="/forum/topic#comment-response"]')).not.toBeNull();
    await escalate();
    expect(mocks.claim).toHaveBeenCalledWith("report", 7);
    expect(mocks.action).toHaveBeenCalledWith("report", "ESCALATE_REPORT", { expectedVersion: 8, reason: "OTHER" });
    expect(mocks.success).toHaveBeenCalledWith("Report forwarded for Admin review");
  });
  it("does not take a decision after the claim fails", async () => {
    mocks.claim.mockRejectedValue(new Error("Already claimed"));
    await render(); await escalate();
    expect(mocks.action).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith("Could not update this report.");
  });
  it("keeps reports requiring Admin review out of community decisions after they are claimed", async () => {
    mocks.reports.mockReturnValue({ data: [{ ...report, status: "claimed", requiresAdminReview: true }] });
    await render();
    expect(container.textContent).toContain("Moderation queue is clear");
    expect(container.querySelector("textarea")).toBeNull();
  });
});

describe("restricting the author from the queue", () => {
  it("asks for a duration in a dialog, then claims and restricts with that duration", async () => {
    await render();
    await act(async () => Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Restrict author")!.click());
    const dialog = document.body.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("Restrict the author?");
    expect(mocks.action).not.toHaveBeenCalled();
    const select = dialog.querySelector("select") as HTMLSelectElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, "30"); select.dispatchEvent(new Event("change", { bubbles: true })); });
    await act(async () => Array.from(dialog.querySelectorAll("button")).find((button) => button.textContent === "Restrict author")!.click());
    expect(mocks.claim).toHaveBeenCalledWith("report", 7);
    expect(mocks.action).toHaveBeenCalledWith("report", "RESTRICT_USER", { expectedVersion: 8, reason: "OTHER", durationDays: 30 });
    expect(mocks.success).toHaveBeenCalledWith("Author restricted and report resolved");
  });
});

describe("moderation history", () => {
  it("shows a system action as System with its own label, and a human action by name", async () => {
    mocks.history.mockReturnValue({ data: [
      { id: "a1", action: "AUTO_HIDDEN", reason: "Hidden automatically after 3 reports", actor: { id: "", fullName: "System", system: true }, targetType: "post", targetId: "p1", createdAt: "2026-10-30T10:00:00.000Z" },
      { id: "a2", action: "THREAD_HIDDEN", reason: "Off topic", actor: { id: "u1", fullName: "Ada Moderator" }, targetType: "post", targetId: "p2", createdAt: "2026-10-30T11:00:00.000Z" },
    ], isLoading: false, error: null });
    await render();
    await act(async () => Array.from(container.querySelectorAll("button")).find((button) => /history/i.test(button.textContent ?? ""))!.click());
    expect(container.textContent).toContain("Hidden automatically");
    expect(container.textContent).toContain("System");
    expect(container.textContent).not.toContain("AUTO_HIDDEN");
    expect(container.textContent).toContain("Ada Moderator");
  });
});
