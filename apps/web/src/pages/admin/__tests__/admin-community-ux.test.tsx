// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminCommunityPage } from "../community";
import { AdminTrustSafetyPage } from "../trust-safety";

const mutation = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, error: null };
const mocks = vi.hoisted(() => ({ communities: vi.fn(), posts: vi.fn(), queue: vi.fn(), appeals: vi.fn() }));
vi.mock("@/features/forum", () => ({
  useCommunities: mocks.communities,
  useForumPosts: mocks.posts,
  useModerateForumContent: () => mutation,
  useSetCommunityStatus: () => mutation,
}));
vi.mock("@/features/forum/api/forum.api", () => ({
  forumApi: { moderationQueue: mocks.queue, appeals: mocks.appeals, restrictions: vi.fn(), copyrightClaims: vi.fn() },
}));
vi.mock("@/features/admin/hooks/use-admin-users", () => ({ useAdminUsers: () => ({ data: { data: [] } }) }));
vi.mock("@/features/forum/hooks/use-forum-categories", () => ({ useForumCategories: () => ({ data: [] }) }));
vi.mock("../community-proposal-queue", () => ({ CommunityProposalQueue: () => <p>proposal queue</p> }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));

const community = (name: string, status: string, visibility = "public") => ({ id: name, slug: name.toLowerCase(), name, description: `${name} description`, status, visibility, memberCount: 4, researchField: null });
const communityRows = [community("Zeta", "ACTIVE", "private"), community("Alpha", "REJECTED"), community("Beta", "ACTIVE"), community("Gamma", "ARCHIVED")];
const report = { id: "r1", status: "open", reason: "SPAM", targetType: "THREAD", targetId: "t", postId: "p", version: 1, createdAt: "2026-10-01T00:00:00Z", contentSnapshot: { title: "Reported title", body: "body" } };

let root: Root, container: HTMLDivElement, client: QueryClient;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.communities.mockReset().mockReturnValue({ data: communityRows, isLoading: false, isSuccess: true });
  mocks.posts.mockReset().mockReturnValue({ data: { data: [], meta: { page: 1, pageSize: 30, total: 47, totalPages: 2 } }, isLoading: false, isError: false });
  mocks.queue.mockReset().mockResolvedValue([report, { ...report, id: "r2" }, { ...report, id: "r3" }]);
  mocks.appeals.mockReset().mockResolvedValue([]);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); });

async function render(path: string, element: React.ReactNode) {
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{element}</MemoryRouter></QueryClientProvider>));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}
const tabs = () => Array.from(container.querySelectorAll('[role="tab"]'));
const rowNames = () => Array.from(container.querySelectorAll("a")).filter((link) => /^\/communities\/(?!new$)[^/]+$/.test(link.getAttribute("href") ?? "")).map((link) => link.textContent);
const button = (text: string) => Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.trim().startsWith(text));

describe("admin communities page", () => {
  it("asks for at most 30 discussions per page and shows the total", async () => {
    await render("/admin/community?tab=discussions", <AdminCommunityPage />);
    expect(mocks.posts).toHaveBeenCalled();
    for (const [params] of mocks.posts.mock.calls) expect(params.pageSize).toBeLessThanOrEqual(30);
    expect(container.textContent).toContain("47");
    expect(container.textContent).toContain("Page 1 / 2");
  });

  it("has Communities, Pending proposals and Discussions tabs only, driven by ?tab=", async () => {
    await render("/admin/community", <AdminCommunityPage />);
    expect(tabs().map((tab) => tab.textContent)).toEqual(["Communities", "Pending proposals", "Discussions"]);
    expect(container.textContent).not.toContain("Moderation Queue");
    expect(tabs().find((tab) => tab.getAttribute("aria-selected") === "true")?.className).toContain("dark:text-blue-400");
    expect(tabs().find((tab) => tab.getAttribute("aria-selected") === "true")?.textContent).toBe("Communities");
    await act(async () => root.unmount()); root = createRoot(container);
    await render("/admin/community?tab=discussions", <AdminCommunityPage />);
    expect(tabs().find((tab) => tab.getAttribute("aria-selected") === "true")?.textContent).toBe("Discussions");
    await act(async () => root.unmount()); root = createRoot(container);
    await render("/admin/community?tab=moderation", <AdminCommunityPage />);
    expect(tabs().find((tab) => tab.getAttribute("aria-selected") === "true")?.textContent).toBe("Communities");
  });

  it("links the Open reports KPI to Trust & Safety with the count from the queue", async () => {
    await render("/admin/community", <AdminCommunityPage />);
    const link = container.querySelector('a[href="/admin/trust-safety?tab=reports&status=open"]');
    expect(link?.textContent).toContain("Open reports");
    expect(link?.textContent).toContain("3");
  });

  it("shows a dash, not zero, when the report queue cannot be loaded", async () => {
    mocks.queue.mockRejectedValue(new Error("network"));
    await render("/admin/community", <AdminCommunityPage />);
    const link = container.querySelector('a[href="/admin/trust-safety?tab=reports&status=open"]');
    expect(link?.textContent).toContain("—");
    expect(link?.textContent).not.toMatch(/Open reports\s*0/);
  });

  it("orders communities by status, filters by status and badges private ones", async () => {
    await render("/admin/community", <AdminCommunityPage />);
    expect(rowNames()).toEqual(["Beta", "Zeta", "Gamma", "Alpha"]);
    const zeta = Array.from(container.querySelectorAll(".divide-y > div")).find((row) => row.textContent?.includes("Zeta"));
    const beta = Array.from(container.querySelectorAll(".divide-y > div")).find((row) => row.textContent?.includes("Beta"));
    expect(zeta?.textContent).toContain("Private");
    expect(beta?.textContent).toContain("Public");
    await act(async () => button("Rejected")!.click());
    expect(rowNames()).toEqual(["Alpha"]);
  });

  it("keeps Archive out of the row and inside the More actions menu", async () => {
    await render("/admin/community", <AdminCommunityPage />);
    expect(Array.from(container.querySelectorAll("button")).some((item) => item.textContent?.trim() === "Archive")).toBe(false);
    const triggers = container.querySelectorAll('button[aria-label="More actions"]');
    expect(triggers.length).toBe(3);
    await act(async () => { triggers[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    expect(document.body.querySelector('[role="menuitem"]')?.textContent).toBe("Archive");
  });
});

describe("trust and safety page", () => {
  it("shows human labels, never the raw enum values", async () => {
    await render("/admin/trust-safety?tab=reports", <AdminTrustSafetyPage />);
    expect(container.textContent).toContain("Spam · Open · Discussion");
    expect(container.textContent).not.toMatch(/\bTHREAD\b|\bSPAM\b|· open ·/);
  });

  it("labels the original action of an appeal, including moderation actions", async () => {
    mocks.appeals.mockResolvedValue([{ id: "a1", reason: "Please reconsider", status: "SUBMITTED", submittedAt: "2026-10-01T00:00:00Z", appellant: { id: "u1", fullName: "Ann" }, action: { action: "RESTRICT_USER", reason: "Spam" } }]);
    await render("/admin/trust-safety?tab=appeals", <AdminTrustSafetyPage />);
    expect(container.textContent).toContain("Restrict author posting · Pending review");
    expect(container.textContent).not.toContain("RESTRICT_USER");
  });

  it("uses accessible tabs and marks the active one", async () => {
    await render("/admin/trust-safety?tab=appeals", <AdminTrustSafetyPage />);
    expect(tabs().map((tab) => tab.textContent)).toEqual(["Reports", "Appeals", "Restrictions", "Copyright claims"]);
    expect(tabs().filter((tab) => tab.getAttribute("aria-selected") === "true").map((tab) => tab.textContent)).toEqual(["Appeals"]);
  });
});
