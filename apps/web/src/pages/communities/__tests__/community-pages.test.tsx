// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommunityDetailPage } from "../community-detail";
import { CommunityListPage } from "../community-list";
import { CommunityManagePage } from "../community-manage";

const mutation = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, error: null };
const mocks = vi.hoisted(() => ({ community: vi.fn(), posts: vi.fn(), list: vi.fn() }));
vi.mock("@/features/forum", () => ({
  canProposeCommunity: () => false,
  useCommunity: mocks.community,
  useForumPosts: mocks.posts,
  useCommunityList: mocks.list,
  useCommunityFacets: () => ({ data: [] }),
  useCommunityRecommendations: () => ({ data: [] }),
  useCommunitySuggestions: () => ({ data: [] }),
  useJoinCommunity: () => mutation,
  useLeaveCommunity: () => mutation,
  useUpdateCommunity: () => mutation,
  useSetCommunityStatus: () => mutation,
  useTransferCommunityOwnership: () => mutation,
  useUpdateCommunityMember: () => mutation,
  useCommunityMembers: () => ({ data: [], isLoading: false, error: null }),
  useCommunityPublicMembers: () => ({ data: { pages: [] }, isLoading: false, error: null, hasNextPage: false }),
  useCommunityRelatedPapers: () => ({ data: [], isLoading: false }),
  useCommunityRelatedGaps: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/features/auth", () => ({ useCurrentUser: () => ({ data: undefined }) }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));

const base = {
  id: "community-1", slug: "machine-learning", name: "Machine Learning", description: "Learning from data.", visibility: "public", status: "ACTIVE",
  researchField: "Computer Science", researchTopics: ["Deep learning"], rules: ["Cite your sources"], memberCount: 12, threadCount: 3,
  contentRestricted: false, canManage: true, canEditCommunity: true, pendingRequestCount: 0, moderators: [{ id: "m1", fullName: "Ada Lovelace", avatarUrl: null }],
  viewerMembership: { status: "active", role: "member" },
};

let root: Root, container: HTMLDivElement, client: QueryClient;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.community.mockReset().mockReturnValue({ data: base, isLoading: false, error: null });
  mocks.posts.mockReset().mockReturnValue({ data: undefined, isLoading: false, error: new Error("404") });
  mocks.list.mockReset().mockReturnValue({ data: { pages: [{ items: [base], total: 1 }] }, isLoading: false, error: null, hasNextPage: false, isFetchingNextPage: false });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); });

async function render(path: string, element: React.ReactNode, route: string) {
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes><Route path={route} element={element} /></Routes></MemoryRouter></QueryClientProvider>));
}
const tabLabels = (name: string) => Array.from(container.querySelectorAll(`nav[aria-label="${name}"] button`)).map((button) => button.textContent?.trim());

describe("community detail page", () => {
  it("has no discussion feed, no forum links and starts on About", async () => {
    await render("/communities/machine-learning", <CommunityDetailPage />, "/communities/:slug");
    expect(mocks.posts).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("Unable to load community discussions");
    expect(container.textContent).not.toMatch(/New discussion|Start discussion/);
    expect(container.textContent).not.toMatch(/\d\s*discussions?/i);
    expect(container.querySelector('a[href^="/forum/new"]')).toBeNull();
    expect(tabLabels("Community views")).toEqual(["Members", "About"]);
    expect(container.querySelector('nav[aria-label="Community views"] button.text-blue-700')?.textContent).toBe("About");
    expect(container.textContent).toContain("About this community");
    expect(container.textContent).toContain("Featured papers");
    expect(container.textContent).toContain("Community rules");
    expect(container.textContent).not.toContain("Popular Topics");
  });

  it("shows only the private notice for a restricted community", async () => {
    mocks.community.mockReturnValue({ data: { ...base, visibility: "private", contentRestricted: true, canManage: false, canEditCommunity: false, researchTopics: [], rules: [], moderators: [], viewerMembership: undefined }, isLoading: false, error: null });
    await render("/communities/machine-learning", <CommunityDetailPage />, "/communities/:slug");
    expect(container.textContent).toContain("Learning from data.");
    expect(container.textContent).toContain("This community is private");
    expect(container.textContent).toContain("Request membership to see its members and related research.");
    expect(container.textContent).not.toContain("Community rules");
    expect(container.textContent).not.toContain("Research topics");
    expect(container.textContent).not.toContain("Featured papers");
    expect(container.textContent).not.toContain("Moderators");
    expect(mocks.posts).not.toHaveBeenCalled();
  });
});

describe("community list page", () => {
  it("shows member counts only and no discussions sort option", async () => {
    await render("/communities", <CommunityListPage />, "/communities");
    expect(container.textContent).toContain("Machine Learning");
    expect(container.textContent).toContain("12");
    expect(container.textContent).not.toMatch(/\d\s*discussions?/i);
    const options = Array.from(container.querySelectorAll("select option")).map((option) => option.textContent);
    expect(options).toEqual(["Recently active", "Newest", "Most members", "Name (A–Z)"]);
    expect(options).not.toContain("Most discussions");
  });
});

describe("community manage page", () => {
  it("offers Settings, Join requests and Members, without Moderation", async () => {
    await render("/communities/machine-learning/manage", <CommunityManagePage />, "/communities/:slug/manage");
    expect(tabLabels("Community management sections")).toEqual(["Settings and rules", "Join requests", "Members"]);
    expect(container.textContent).toContain("Manage membership and community settings within your permission scope.");
    expect(container.textContent).not.toContain("Moderation");
  });

  it("drops the Settings tab when the viewer cannot edit the community", async () => {
    mocks.community.mockReturnValue({ data: { ...base, canEditCommunity: false }, isLoading: false, error: null });
    await render("/communities/machine-learning/manage", <CommunityManagePage />, "/communities/:slug/manage");
    expect(tabLabels("Community management sections")).toEqual(["Join requests", "Members"]);
  });
});
