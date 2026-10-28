// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommunityDetailPage } from "../community-detail";
import { CommunityListPage } from "../community-list";
import { CommunityManagePage } from "../community-manage";
import { CommunityNewPage } from "../community-new";

const mutation = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, error: null };
const mocks = vi.hoisted(() => ({ community: vi.fn(), posts: vi.fn(), list: vi.fn(), members: vi.fn(), canPropose: vi.fn(), leave: vi.fn() }));
vi.mock("@/features/forum", () => ({
  canProposeCommunity: mocks.canPropose,
  proposalBlockReason: () => undefined,
  useCreateCommunity: () => mutation,
  useCommunity: mocks.community,
  useForumPosts: mocks.posts,
  useCommunityList: mocks.list,
  useCommunityFacets: () => ({ data: [] }),
  useCommunityRecommendations: () => ({ data: [] }),
  useCommunitySuggestions: () => ({ data: [] }),
  useJoinCommunity: () => mutation,
  useLeaveCommunity: () => ({ ...mutation, mutate: mocks.leave }),
  useUpdateCommunity: () => mutation,
  useSetCommunityStatus: () => mutation,
  useTransferCommunityOwnership: () => mutation,
  useUpdateCommunityMember: () => mutation,
  useCommunityMembers: mocks.members,
  useCommunitySummary: () => ({ data: { status: "none", postCount: 0 } }),
  useRequestCommunitySummary: () => mutation,
  useModerateForumContent: () => mutation,
  ForumCard: ({ post }: { post: { id: string; title: string } }) => <article data-post={post.id}>{post.title}</article>,
  useCommunityPublicMembers: () => ({ data: { pages: [] }, isLoading: false, error: null, hasNextPage: false }),
  useCommunityRelatedPapers: () => ({ data: [], isLoading: false }),
  useCommunityRelatedGaps: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/features/auth", () => ({ useCurrentUser: () => ({ data: { user: { systemRole: "USER" } }, isLoading: false }) }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (state: unknown) => unknown) => select({ tokens: { accessToken: "token" } }) }));
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
  mocks.members.mockReset().mockReturnValue({ data: [], isLoading: false, error: null });
  mocks.canPropose.mockReset().mockReturnValue(false);
  mocks.leave.mockReset();
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
  it("starts a member on the community's discussions and offers a scoped composer link", async () => {
    mocks.posts.mockReturnValue({ data: { data: [{ id: "p1", title: "Is attention enough?" }], meta: { total: 1 } }, isLoading: false, error: null });
    await render("/communities/machine-learning", <CommunityDetailPage />, "/communities/:slug");
    expect(mocks.posts).toHaveBeenCalledWith(expect.objectContaining({ researchCommunityId: "community-1" }), true);
    expect(tabLabels("Community views")).toEqual(["Discussions", "Members", "About"]);
    expect(container.querySelector('nav[aria-label="Community views"] button.text-blue-700')?.textContent).toBe("Discussions");
    expect(container.textContent).toContain("Is attention enough?");
    expect(container.textContent).toContain("3 discussions");
    expect(container.querySelector('a[href="/forum/new?community=machine-learning"]')?.textContent).toContain("New discussion");
    expect(container.textContent).toContain("Summarize recent discussions");
  });

  it("starts a non-member on About, still showing the public discussions tab but no composer link", async () => {
    mocks.community.mockReturnValue({ data: { ...base, canManage: false, canEditCommunity: false, viewerMembership: undefined }, isLoading: false, error: null });
    await render("/communities/machine-learning", <CommunityDetailPage />, "/communities/:slug");
    expect(container.querySelector('nav[aria-label="Community views"] button.text-blue-700')?.textContent).toBe("About");
    await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>("nav button")).find((item) => item.textContent === "Discussions")!.click());
    expect(container.querySelector('a[href^="/forum/new"]')).toBeNull();
    expect(container.textContent).not.toContain("Summarize recent discussions");
  });

  it("shows the About content, rules and featured papers", async () => {
    await render("/communities/machine-learning", <CommunityDetailPage />, "/communities/:slug");
    await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>("nav button")).find((item) => item.textContent === "About")!.click());
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
    expect(tabLabels("Community views")).toEqual(["Members", "About"]);
    expect(mocks.posts).not.toHaveBeenCalled();
  });
});

describe("archived community", () => {
  const archived = { ...base, status: "ARCHIVED" };
  const buttons = () => Array.from(container.querySelectorAll("button, a")).map((item) => item.textContent?.trim());

  it("shows a read-only banner and no Join button to a non-member", async () => {
    mocks.community.mockReturnValue({ data: { ...archived, canManage: false, canEditCommunity: false, viewerMembership: undefined }, isLoading: false, error: null });
    await render("/communities/machine-learning", <CommunityDetailPage />, "/communities/:slug");
    expect(container.textContent).toContain("This community is archived. Content is read-only and it no longer accepts members.");
    expect(buttons().some((label) => /^(Join Community|Request to join|Sign in to join)$/.test(label ?? ""))).toBe(false);
  });

  it("keeps Leave community available to an active member", async () => {
    mocks.community.mockReturnValue({ data: { ...archived, canManage: false, canEditCommunity: false }, isLoading: false, error: null });
    await render("/communities/machine-learning", <CommunityDetailPage />, "/communities/:slug");
    const joined = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes("Joined"))!;
    expect(joined.disabled).toBe(false);
    await act(async () => { joined.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    const leave = Array.from(document.body.querySelectorAll('[role="menuitem"]')).find((item) => item.textContent === "Leave community") as HTMLElement;
    expect(leave).toBeTruthy();
    await act(async () => leave.click());
    expect(mocks.leave).toHaveBeenCalledWith("community-1");
  });

  it("still offers Join on an active community", async () => {
    mocks.community.mockReturnValue({ data: { ...base, canManage: false, viewerMembership: undefined }, isLoading: false, error: null });
    await render("/communities/machine-learning", <CommunityDetailPage />, "/communities/:slug");
    expect(buttons()).toContain("Join Community");
    expect(container.textContent).not.toContain("This community is archived");
  });
});

describe("community list page", () => {
  it("shows member and discussion counts and the Most discussions sort", async () => {
    await render("/communities", <CommunityListPage />, "/communities");
    expect(container.textContent).toContain("Machine Learning");
    expect(container.textContent).toContain("12");
    expect(container.textContent).toContain("3");
    expect(container.textContent).toMatch(/3\s*discussions/i);
    const options = Array.from(container.querySelectorAll("select option")).map((option) => option.textContent);
    expect(options).toEqual(["Recently active", "Newest", "Most members", "Most discussions", "Name (A–Z)"]);
  });
});

describe("community manage page", () => {
  it("offers Settings, Join requests, Members and Moderation", async () => {
    await render("/communities/machine-learning/manage", <CommunityManagePage />, "/communities/:slug/manage");
    expect(tabLabels("Community management sections")).toEqual(["Settings and rules", "Join requests", "Members", "Moderation"]);
    expect(container.textContent).toContain("Manage membership and community settings within your permission scope.");
  });

  it("moderates the community's own posts and freezes the buttons when archived", async () => {
    const post = { id: "p1", title: "Needs a look", status: "active", isPinned: false, publicSlug: "needs-a-look", author: { fullName: "Ada" } };
    mocks.posts.mockReturnValue({ data: { data: [post], meta: { total: 1 } }, isLoading: false, error: null });
    await render("/communities/machine-learning/manage", <CommunityManagePage />, "/communities/:slug/manage");
    await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>("nav button")).find((item) => item.textContent?.includes("Moderation"))!.click());
    expect(mocks.posts).toHaveBeenCalledWith(expect.objectContaining({ researchCommunityId: "community-1", includeModerated: true }));
    const buttons = () => Array.from(container.querySelectorAll<HTMLButtonElement>("section button")).filter((item) => /Pin|Lock|Hide/.test(item.textContent ?? ""));
    expect(buttons().map((item) => item.textContent?.trim())).toEqual(["Pin", "Lock", "Hide"]);
    expect(buttons().every((item) => !item.disabled)).toBe(true);
    await act(async () => { buttons()[0]!.click(); });
    expect(mutation.mutateAsync).toHaveBeenCalledWith({ targetType: "post", targetId: "p1", action: "THREAD_PINNED", reason: undefined });
  });

  it("disables community moderation on an archived community for a non-admin", async () => {
    mocks.posts.mockReturnValue({ data: { data: [{ id: "p1", title: "Needs a look", status: "active", isPinned: false, author: { fullName: "Ada" } }], meta: { total: 1 } }, isLoading: false, error: null });
    mocks.community.mockReturnValue({ data: { ...base, status: "ARCHIVED", isAdmin: false }, isLoading: false, error: null });
    await render("/communities/machine-learning/manage", <CommunityManagePage />, "/communities/:slug/manage");
    await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>("nav button")).find((item) => item.textContent?.includes("Moderation"))!.click());
    expect(container.textContent).toContain("can no longer be moderated here");
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>("section button")).filter((item) => /Pin|Lock|Hide/.test(item.textContent ?? ""));
    expect(buttons.length).toBe(3);
    expect(buttons.every((item) => item.disabled)).toBe(true);
  });

  const member = { id: "mem-1", role: "member", status: "active", user: { id: "u1", fullName: "Grace Hopper", email: "g@example.test" } };
  const tabButton = (label: string) => Array.from(container.querySelectorAll<HTMLButtonElement>("nav button")).find((item) => item.textContent?.includes(label))!;

  it("disables settings and member actions on an archived community for a non-admin", async () => {
    mocks.members.mockReturnValue({ data: [member], isLoading: false, error: null });
    mocks.community.mockReturnValue({ data: { ...base, status: "ARCHIVED", isOwner: true, isAdmin: false }, isLoading: false, error: null });
    await render("/communities/machine-learning/manage", <CommunityManagePage />, "/communities/:slug/manage");
    await act(async () => tabButton("Settings").click());
    expect(container.textContent).toContain("This community is archived, so its settings are read-only.");
    const controls = Array.from(container.querySelectorAll<HTMLInputElement>("fieldset input, fieldset textarea, fieldset select, fieldset button"));
    expect(controls.length).toBeGreaterThan(4);
    expect(controls.every((control) => control.matches(":disabled"))).toBe(true);
    await act(async () => tabButton("Members").click());
    expect(container.textContent).toContain("membership can no longer be changed");
    const actions = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).filter((item) => /Ban member|Make moderator/.test(item.textContent ?? ""));
    expect(actions).toHaveLength(2);
    expect(actions.every((item) => item.disabled)).toBe(true);
  });

  it("keeps everything enabled for an admin on an archived community", async () => {
    mocks.members.mockReturnValue({ data: [member], isLoading: false, error: null });
    mocks.community.mockReturnValue({ data: { ...base, status: "ARCHIVED", isOwner: false, isAdmin: true }, isLoading: false, error: null });
    await render("/communities/machine-learning/manage", <CommunityManagePage />, "/communities/:slug/manage");
    await act(async () => tabButton("Settings").click());
    expect(container.textContent).not.toContain("its settings are read-only");
    expect(container.querySelector<HTMLInputElement>("fieldset input")!.disabled).toBe(false);
    await act(async () => tabButton("Members").click());
    expect(Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((item) => item.textContent?.includes("Ban member"))!.disabled).toBe(false);
  });

  it("drops the Settings tab when the viewer cannot edit the community", async () => {
    mocks.community.mockReturnValue({ data: { ...base, canEditCommunity: false }, isLoading: false, error: null });
    await render("/communities/machine-learning/manage", <CommunityManagePage />, "/communities/:slug/manage");
    expect(tabLabels("Community management sections")).toEqual(["Join requests", "Members", "Moderation"]);
  });
});

describe("create community form", () => {
  it("describes both visibilities without mentioning discussions", async () => {
    mocks.canPropose.mockReturnValue(true);
    await render("/communities/new", <CommunityNewPage />, "/communities/new");
    expect(container.textContent).toContain("Anyone can see the members, rules and related research. Members join immediately.");
    expect(container.textContent).toContain("Anyone can find the community and read its description. Members, rules and related research are visible after a moderator approves the request.");
    expect(container.textContent).not.toMatch(/discussions/i);
  });
});
