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
const mocks = vi.hoisted(() => ({ community: vi.fn(), posts: vi.fn(), list: vi.fn(), members: vi.fn(), canPropose: vi.fn(), leave: vi.fn(), publicMembers: vi.fn(), restrict: vi.fn(), lift: vi.fn(), summary: vi.fn(), infinite: vi.fn(), authed: true }));
vi.mock("@/features/forum", () => ({
  canProposeCommunity: mocks.canPropose,
  proposalBlockReason: () => undefined,
  useCreateCommunity: () => mutation,
  useCommunity: mocks.community,
  useForumPosts: mocks.posts,
  // The discussions tab pages with "Load more"; by default adapt the single-page `posts` mock.
  useForumPostsInfinite: (params: unknown) => {
    const override = mocks.infinite(params);
    if (override) return override;
    const result = mocks.posts(params);
    return result?.data ? { ...result, data: { pages: [result.data] }, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn() } : result;
  },
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
  useCommunitySummary: () => mocks.summary(),
  useRequestCommunitySummary: () => mutation,
  useModerateForumContent: () => mutation,
  useRestrictCommunityMember: () => ({ ...mutation, mutateAsync: mocks.restrict }),
  useLiftCommunityRestriction: () => ({ ...mutation, mutateAsync: mocks.lift }),
  ForumModerationQueue: ({ communityId }: { communityId?: string }) => <div data-testid="moderation-queue" data-community={communityId} />,
  ForumCard: ({ post }: { post: { id: string; title: string } }) => <article data-post={post.id}>{post.title}</article>,
  useCommunityPublicMembers: mocks.publicMembers,
  useCommunityRelatedPapers: () => ({ data: [], isLoading: false }),
  useCommunityRelatedGaps: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/features/auth", () => ({ useCurrentUser: () => ({ data: { user: { systemRole: "USER" } }, isLoading: false }) }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (state: unknown) => unknown) => select({ tokens: mocks.authed ? { accessToken: "token" } : null }) }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));

const base = {
  id: "community-1", slug: "machine-learning", name: "Machine Learning", description: "Learning from data.", status: "ACTIVE",
  researchField: "Computer Science", researchTopics: ["Deep learning"], rules: ["Cite your sources"], memberCount: 12, threadCount: 3,
  canManage: true, canEditCommunity: true, moderators: [{ id: "m1", fullName: "Ada Lovelace", avatarUrl: null }],
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
  mocks.infinite.mockReset().mockReturnValue(undefined);
  mocks.summary.mockReset().mockReturnValue({ data: { status: "none", postCount: 0 } });
  mocks.restrict.mockReset().mockResolvedValue(undefined);
  mocks.lift.mockReset().mockResolvedValue(undefined);
  mutation.mutateAsync.mockReset().mockResolvedValue(undefined);
  mocks.authed = true;
  mocks.publicMembers.mockReset().mockReturnValue({ data: { pages: [] }, isLoading: false, error: null, hasNextPage: false });
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
    expect(mocks.posts).toHaveBeenCalledWith(expect.objectContaining({ researchCommunityId: "community-1" }));
    expect(tabLabels("Community views")).toEqual(["Discussions", "Members", "About"]);
    expect(container.querySelector('nav[aria-label="Community views"] button.text-blue-700')?.textContent).toBe("Discussions");
    expect(container.textContent).toContain("Is attention enough?");
    expect(container.textContent).toContain("3 discussions");
    expect(container.querySelector('a[href="/forum/new?community=machine-learning"]')?.textContent).toContain("New discussion");
    expect(container.textContent).toContain("Summarize recent discussions");
  });

  it("starts a signed-in non-member on About; the discussions are public and a thread can be started without joining", async () => {
    mocks.community.mockReturnValue({ data: { ...base, canManage: false, canEditCommunity: false, viewerMembership: undefined }, isLoading: false, error: null });
    await render("/communities/machine-learning", <CommunityDetailPage />, "/communities/:slug");
    expect(container.querySelector('nav[aria-label="Community views"] button.text-blue-700')?.textContent).toBe("About");
    await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>("nav button")).find((item) => item.textContent === "Discussions")!.click());
    expect(container.querySelector('a[href="/forum/new?community=machine-learning"]')?.textContent).toContain("New discussion");
    expect(container.textContent).not.toContain("Summarize recent discussions");
  });

  it("does not offer a composer link to anonymous viewers or banned members", async () => {
    mocks.authed = false;
    mocks.community.mockReturnValue({ data: { ...base, canManage: false, canEditCommunity: false, viewerMembership: undefined }, isLoading: false, error: null });
    await render("/communities/machine-learning", <CommunityDetailPage />, "/communities/:slug");
    await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>("nav button")).find((item) => item.textContent === "Discussions")!.click());
    expect(container.querySelector('a[href^="/forum/new"]')).toBeNull();
    await act(async () => root.unmount());
    root = createRoot(container);
    mocks.authed = true;
    mocks.community.mockReturnValue({ data: { ...base, canManage: false, canEditCommunity: false, viewerMembership: { status: "banned", role: "member" } }, isLoading: false, error: null });
    await render("/communities/machine-learning", <CommunityDetailPage />, "/communities/:slug");
    await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>("nav button")).find((item) => item.textContent === "Discussions")!.click());
    expect(container.querySelector('a[href^="/forum/new"]')).toBeNull();
  });

  it("shows the About content, rules and featured papers", async () => {
    await render("/communities/machine-learning", <CommunityDetailPage />, "/communities/:slug");
    await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>("nav button")).find((item) => item.textContent === "About")!.click());
    expect(container.textContent).toContain("About this community");
    expect(container.textContent).toContain("Featured papers");
    expect(container.textContent).toContain("Community rules");
    expect(container.textContent).not.toContain("Popular Topics");
  });

  it("shows topics, rules and moderators to an anonymous viewer, with no private or join-request wording", async () => {
    mocks.authed = false;
    mocks.community.mockReturnValue({ data: { ...base, canManage: false, canEditCommunity: false, viewerMembership: undefined }, isLoading: false, error: null });
    await render("/communities/machine-learning", <CommunityDetailPage />, "/communities/:slug");
    expect(container.textContent).toContain("Community rules");
    expect(container.textContent).toContain("Cite your sources");
    expect(container.textContent).toContain("Deep learning");
    expect(container.textContent).toContain("Moderators");
    expect(container.textContent).toContain("Ada Lovelace");
    expect(container.textContent).not.toMatch(/private|join request|cancel request/i);
    expect(container.textContent).toContain("Sign in to join");
    expect(tabLabels("Community views")).toEqual(["Discussions", "Members", "About"]);
  });

  it("asks anonymous viewers to sign in on the Members tab and sends no roster request", async () => {
    mocks.authed = false;
    mocks.community.mockReturnValue({ data: { ...base, canManage: false, canEditCommunity: false, viewerMembership: undefined }, isLoading: false, error: null });
    await render("/communities/machine-learning", <CommunityDetailPage />, "/communities/:slug");
    await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>("nav button")).find((item) => item.textContent === "Members")!.click());
    expect(container.textContent).toContain("Sign in to see members");
    expect(container.querySelector('a[href="/login"]')).not.toBeNull();
    expect(mocks.publicMembers).toHaveBeenCalledWith("community-1", false);
  });

  it("shows the Archived badge on an archived community", async () => {
    mocks.community.mockReturnValue({ data: { ...base, status: "ARCHIVED" }, isLoading: false, error: null });
    await render("/communities/machine-learning", <CommunityDetailPage />, "/communities/:slug");
    expect(container.querySelector("header")?.textContent).toContain("Archived");
  });
});

describe("community detail UX", () => {
  const openJoinedMenu = async () => {
    const joined = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes("Joined"))!;
    await act(async () => { joined.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
  };
  const activeTab = () => container.querySelector('nav[aria-label="Community views"] button.text-blue-700')?.textContent;

  it("does not let the owner leave: the menu points to transferring ownership", async () => {
    mocks.community.mockReturnValue({ data: { ...base, isOwner: true, canManage: false }, isLoading: false, error: null });
    await render("/communities/machine-learning", <CommunityDetailPage />, "/communities/:slug");
    await openJoinedMenu();
    const items = Array.from(document.body.querySelectorAll('[role="menuitem"]')).map((item) => item.textContent);
    expect(items).toEqual(["Transfer ownership to leave"]);
    expect(document.body.querySelector('[role="menuitem"][href="/communities/machine-learning/manage?tab=settings"]')).not.toBeNull();
  });

  it("reads the tab from the URL and falls back for an unknown value", async () => {
    await render("/communities/machine-learning?tab=members", <CommunityDetailPage />, "/communities/:slug");
    expect(activeTab()).toBe("Members");
    await act(async () => root.unmount()); root = createRoot(container);
    await render("/communities/machine-learning?tab=bogus", <CommunityDetailPage />, "/communities/:slug");
    expect(activeTab()).toBe("Discussions"); // the default for a member
  });

  it("writes the tab to the URL when a tab is chosen", async () => {
    await render("/communities/machine-learning", <CommunityDetailPage />, "/communities/:slug");
    await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>("nav button")).find((item) => item.textContent === "About")!.click());
    expect(activeTab()).toBe("About");
  });

  it("turns [n] in the AI summary into links to its sources and lists them; an unknown n stays text", async () => {
    mocks.summary.mockReturnValue({ data: { status: "completed", postCount: 2, summary: "Authors disagree [1] and agree [2]; see [9].", sources: [{ n: 1, id: "p1", title: "First thread", publicSlug: "first-thread" }, { n: 2, id: "p2", title: "Second thread" }] } });
    await render("/communities/machine-learning", <CommunityDetailPage />, "/communities/:slug");
    const links = Array.from(container.querySelectorAll("section[aria-label='AI summary'] a")).map((item) => [item.textContent, item.getAttribute("href")]);
    expect(links).toEqual(expect.arrayContaining([["[1]", "/forum/first-thread"], ["[2]", "/forum/p2"]]));
    expect(container.querySelector("section[aria-label='AI summary']")?.textContent).toContain("see [9].");
    expect(links.some(([label]) => label === "[9]")).toBe(false);
    expect(container.textContent).toContain("Sources");
    expect(container.textContent).toContain("First thread");
  });

  it("states the 7-day summary window", async () => {
    await render("/communities/machine-learning", <CommunityDetailPage />, "/communities/:slug");
    expect(container.textContent).toContain("Generated on request from the last 7 days of discussions in this community.");
  });

  it("pages the discussions with Load more and shows how many of the total are loaded", async () => {
    const fetchNextPage = vi.fn();
    mocks.infinite.mockReturnValue({ data: { pages: [{ data: [{ id: "p1", title: "One" }, { id: "p2", title: "Two" }], meta: { total: 45, page: 1, totalPages: 3 } }] }, isLoading: false, error: null, hasNextPage: true, isFetchingNextPage: false, fetchNextPage });
    await render("/communities/machine-learning", <CommunityDetailPage />, "/communities/:slug");
    expect(container.textContent).toContain("2 / 45");
    await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((item) => item.textContent === "Load more")!.click());
    expect(fetchNextPage).toHaveBeenCalled();
  });
});

describe("archived community", () => {
  const archived = { ...base, status: "ARCHIVED" };
  const buttons = () => Array.from(container.querySelectorAll("button, a")).map((item) => item.textContent?.trim());

  it("shows a read-only banner and no Join button to a non-member", async () => {
    mocks.community.mockReturnValue({ data: { ...archived, canManage: false, canEditCommunity: false, viewerMembership: undefined }, isLoading: false, error: null });
    await render("/communities/machine-learning", <CommunityDetailPage />, "/communities/:slug");
    expect(container.textContent).toContain("This community is archived. Content is read-only and it no longer accepts members.");
    expect(buttons().some((label) => /^(Join community|Sign in to join)$/.test(label ?? ""))).toBe(false);
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
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain("Leave this community?");
    expect(mocks.leave).not.toHaveBeenCalled();
    await act(async () => Array.from(document.body.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).find((item) => item.textContent === "Leave community")!.click());
    expect(mocks.leave).toHaveBeenCalledWith("community-1", expect.anything());
  });

  it("still offers Join on an active community", async () => {
    mocks.community.mockReturnValue({ data: { ...base, canManage: false, viewerMembership: undefined }, isLoading: false, error: null });
    await render("/communities/machine-learning", <CommunityDetailPage />, "/communities/:slug");
    expect(buttons()).toContain("Join community");
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
  it("offers Settings, Members and Moderation, without join requests", async () => {
    await render("/communities/machine-learning/manage", <CommunityManagePage />, "/communities/:slug/manage");
    expect(tabLabels("Community management sections")).toEqual(["Settings and rules", "Members", "Moderation"]);
    expect(container.textContent).not.toMatch(/Join requests|Visibility/);
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
    expect(tabLabels("Community management sections")).toEqual(["Members", "Moderation"]);
  });

  it("opens on Members for a moderator and on Settings for an owner", async () => {
    mocks.community.mockReturnValue({ data: { ...base, canEditCommunity: false }, isLoading: false, error: null });
    await render("/communities/machine-learning/manage", <CommunityManagePage />, "/communities/:slug/manage");
    expect(container.querySelector('nav[aria-label="Community management sections"] button.text-blue-700')?.textContent?.trim()).toBe("Members");
    await act(async () => root.unmount());
    root = createRoot(container);
    mocks.community.mockReturnValue({ data: base, isLoading: false, error: null });
    await render("/communities/machine-learning/manage", <CommunityManagePage />, "/communities/:slug/manage");
    expect(container.querySelector('nav[aria-label="Community management sections"] button.text-blue-700')?.textContent?.trim()).toBe("Settings and rules");
  });

  const dialogText = () => document.body.querySelector('[role="dialog"]')?.textContent ?? "";
  const dialogButton = (label: string) => Array.from(document.body.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).find((item) => item.textContent?.trim() === label)!;
  const ada = { id: "mem-ada", role: "member", status: "active", user: { id: "u-ada", fullName: "Ada Member", email: "ada@example.test" }, restrictions: [] as Array<{ id: string; type: string; expiresAt?: string }> };

  it("opens the tab named in the URL and falls back to the default for an unknown or unavailable one", async () => {
    const active = () => container.querySelector('nav[aria-label="Community management sections"] button.text-blue-700')?.textContent?.trim();
    await render("/communities/machine-learning/manage?tab=moderation", <CommunityManagePage />, "/communities/:slug/manage");
    expect(active()).toBe("Moderation");
    await act(async () => root.unmount()); root = createRoot(container);
    await render("/communities/machine-learning/manage?tab=bogus", <CommunityManagePage />, "/communities/:slug/manage");
    expect(active()).toBe("Settings and rules");
    await act(async () => root.unmount()); root = createRoot(container);
    mocks.community.mockReturnValue({ data: { ...base, canEditCommunity: false }, isLoading: false, error: null });
    await render("/communities/machine-learning/manage?tab=settings", <CommunityManagePage />, "/communities/:slug/manage");
    expect(active()).toBe("Members");
  });

  it("mounts the report queue in the Moderation tab for this community", async () => {
    await render("/communities/machine-learning/manage", <CommunityManagePage />, "/communities/:slug/manage");
    await act(async () => tabButton("Moderation").click());
    expect(container.querySelector('[data-testid="moderation-queue"]')?.getAttribute("data-community")).toBe("community-1");
  });

  it("asks for confirmation before banning and only then changes the member", async () => {
    mocks.members.mockReturnValue({ data: [ada], isLoading: false, error: null });
    await render("/communities/machine-learning/manage", <CommunityManagePage />, "/communities/:slug/manage");
    await act(async () => tabButton("Members").click());
    await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((item) => item.textContent === "Ban member")!.click());
    expect(dialogText()).toContain("Ban this member?");
    expect(dialogText()).toContain("Ada Member");
    expect(mutation.mutateAsync).not.toHaveBeenCalled();
    await act(async () => dialogButton("Ban member").click());
    expect(mutation.mutateAsync).toHaveBeenCalledWith({ id: "community-1", userId: "u-ada", input: { status: "banned" } });
  });

  it("shows a failed ban inside the dialog, disables the confirm button while it runs, and keeps the dialog open", async () => {
    mocks.members.mockReturnValue({ data: [ada], isLoading: false, error: null });
    mutation.mutateAsync.mockRejectedValueOnce({ response: { data: { error: { message: "You cannot ban this member" } } } });
    await render("/communities/machine-learning/manage", <CommunityManagePage />, "/communities/:slug/manage");
    await act(async () => tabButton("Members").click());
    await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((item) => item.textContent === "Ban member")!.click());
    await act(async () => dialogButton("Ban member").click());
    expect(document.body.querySelector('[role="dialog"] [role="alert"]')?.textContent).toBe("You cannot ban this member");
    expect(dialogText()).toContain("Ban this member?");
  });

  it("restricts a member through a dialog that needs a reason, and sends type, duration and reason", async () => {
    mocks.members.mockReturnValue({ data: [ada], isLoading: false, error: null });
    await render("/communities/machine-learning/manage", <CommunityManagePage />, "/communities/:slug/manage");
    await act(async () => tabButton("Members").click());
    await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((item) => item.textContent === "Restrict")!.click());
    expect(dialogText()).toContain("Restrict this member");
    const confirm = dialogButton("Restrict member");
    expect(confirm.disabled).toBe(true);
    expect(dialogText()).toContain("Enter a reason of at least 3 characters to continue.");
    const set = (element: HTMLInputElement | HTMLSelectElement, value: string) => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")!.set!.call(element, value); element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true })); };
    const selects = document.body.querySelectorAll<HTMLSelectElement>('[role="dialog"] select');
    await act(async () => { set(selects[0]!, "REPLY"); set(selects[1]!, "30"); set(document.body.querySelector<HTMLInputElement>('[role="dialog"] input')!, "Posting links"); });
    expect(dialogButton("Restrict member").disabled).toBe(false);
    await act(async () => dialogButton("Restrict member").click());
    expect(mocks.restrict).toHaveBeenCalledWith({ id: "community-1", userId: "u-ada", input: { type: "REPLY", durationDays: 30, reason: "Posting links" } });
  });

  it("shows an active restriction with its end date and lifts it after confirmation", async () => {
    mocks.members.mockReturnValue({ data: [{ ...ada, restrictions: [{ id: "res-1", type: "REPLY", expiresAt: "2026-11-10T12:00:00.000Z" }] }], isLoading: false, error: null });
    await render("/communities/machine-learning/manage", <CommunityManagePage />, "/communities/:slug/manage");
    await act(async () => tabButton("Members").click());
    expect(container.textContent).toContain("Reply to discussions");
    expect(container.textContent).toContain("Restricted until");
    await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((item) => item.textContent === "Lift")!.click());
    expect(dialogText()).toContain("Lift this restriction?");
    expect(mocks.lift).not.toHaveBeenCalled();
    await act(async () => dialogButton("Lift restriction").click());
    expect(mocks.lift).toHaveBeenCalledWith({ id: "community-1", userId: "u-ada", restrictionId: "res-1" });
  });

  it("hides what a moderator cannot do: no actions on the owner or a peer moderator, full actions on regular members", async () => {
    mocks.community.mockReturnValue({ data: { ...base, isOwner: false, isAdmin: false, canEditCommunity: false }, isLoading: false, error: null });
    mocks.members.mockReturnValue({ data: [
      { id: "own", role: "owner", status: "active", user: { id: "u-own", fullName: "Olga Owner", email: "o@example.test" } },
      { id: "mod", role: "moderator", status: "active", user: { id: "u-mod", fullName: "Peer Moderator", email: "p@example.test" } },
      ada,
    ], isLoading: false, error: null });
    await render("/communities/machine-learning/manage", <CommunityManagePage />, "/communities/:slug/manage");
    const rowOf = (name: string) => Array.from(container.querySelectorAll("div.py-4")).find((row) => row.textContent?.includes(name))!;
    const actionsOf = (name: string) => Array.from(rowOf(name).querySelectorAll("button")).map((item) => item.textContent?.trim());
    expect(actionsOf("Olga Owner")).toEqual([]);
    expect(actionsOf("Peer Moderator")).toEqual([]);
    expect(actionsOf("Ada Member")).toEqual(["Ban member", "Restrict"]);
  });

  it("lets the owner restrict and demote a moderator", async () => {
    mocks.members.mockReturnValue({ data: [{ id: "mod", role: "moderator", status: "active", user: { id: "u-mod", fullName: "Peer Moderator", email: "p@example.test" } }], isLoading: false, error: null });
    mocks.community.mockReturnValue({ data: { ...base, isOwner: true }, isLoading: false, error: null });
    await render("/communities/machine-learning/manage", <CommunityManagePage />, "/communities/:slug/manage");
    await act(async () => tabButton("Members").click());
    expect(Array.from(container.querySelectorAll<HTMLButtonElement>("button")).map((item) => item.textContent?.trim())).toEqual(expect.arrayContaining(["Ban member", "Restrict", "Remove moderator"]));
  });

  it("labels a banned member's action Restore access and an active member's Ban member", async () => {
    mocks.members.mockReturnValue({ data: [{ id: "a", role: "member", status: "active", user: { id: "u1", fullName: "Grace Hopper", email: "g@example.test" } }, { id: "b", role: "member", status: "banned", user: { id: "u2", fullName: "Alan Turing", email: "a@example.test" } }], isLoading: false, error: null });
    await render("/communities/machine-learning/manage", <CommunityManagePage />, "/communities/:slug/manage");
    await act(async () => tabButton("Members").click());
    const labels = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).map((item) => item.textContent?.trim());
    expect(labels).toContain("Ban member");
    expect(labels).toContain("Restore access");
    expect(labels).not.toContain("Approve");
    expect(labels).not.toContain("Decline");
  });
});

describe("create community form rules", () => {
  it("splits rules by line only, so a comma stays inside one rule", async () => {
    mocks.canPropose.mockReturnValue(true);
    await render("/communities/new", <CommunityNewPage />, "/communities/new");
    const set = (element: HTMLInputElement | HTMLTextAreaElement, value: string) => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")!.set!.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); };
    const textareas = container.querySelectorAll("textarea");
    await act(async () => {
      set(container.querySelector<HTMLInputElement>("input")!, "Graph Lab");
      set(textareas[0]!, "A lab");
      set(textareas[1]!, "Cite sources, always\nBe kind\n\nBe kind");
    });
    await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(mutation.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ rules: ["Cite sources, always", "Be kind"] }));
  });
});

describe("create community form", () => {
  it("has no visibility choice: every research community is public", async () => {
    mocks.canPropose.mockReturnValue(true);
    await render("/communities/new", <CommunityNewPage />, "/communities/new");
    expect(container.textContent).not.toContain("Visibility");
    expect(container.textContent).not.toMatch(/Private community|Public community/);
    expect(container.querySelector('input[name="visibility"]')).toBeNull();
  });
});
