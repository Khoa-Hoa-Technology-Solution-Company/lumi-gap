import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/services/api-client";
import { forumApi } from "../api/forum.api";
import { useCommunities, useCommunityMembers, useFollowThread, useForumContext, useForumDiscovery, useForumModerationActions, useForumNotificationLevel, useForumPost, useForumPosts, useForumReports, useUpdateForumPost } from "../hooks/use-forum";

const mocks = vi.hoisted(() => ({ viewer: "user-a" as string | null, setData: vi.fn(), getData: vi.fn(() => [] as Array<[unknown[], unknown]>), invalidate: vi.fn(), useMutation: vi.fn((options) => options), useQuery: vi.fn((options) => options) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: mocks.invalidate, setQueryData: mocks.setData, getQueriesData: mocks.getData }), useMutation: mocks.useMutation, useQuery: mocks.useQuery, useInfiniteQuery: vi.fn() }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: mocks.viewer ? { id: mocks.viewer } : null, tokens: mocks.viewer ? { accessToken: "test-only" } : null }) }));
afterEach(() => { vi.restoreAllMocks(); mocks.viewer = "user-a"; mocks.invalidate.mockClear(); mocks.setData.mockClear(); mocks.getData.mockReset().mockReturnValue([]); });

describe("Forum follow persistence and cache", () => {
  it("normalizes the persisted emoji mutation summary into the same shape as posts and replies", async () => {
    const request = vi.spyOn(api, "post").mockResolvedValue({ data: { data: {
      subjectKind: "comment", subjectId: "reply-id", reaction: "LOVE", active: true,
      counts: { LOVE: 1, LAUGH: 2 }, viewerReactions: ["LOVE", "unknown"],
      reactors: { LOVE: [{ id: "user-a", fullName: "A. Researcher" }] },
    } } });
    const result = await forumApi.react("comment", "reply-id", "LOVE", true);
    expect(request).toHaveBeenCalledWith(expect.stringContaining("/reply-id/reactions"), { reaction: "LOVE", active: true });
    expect(result).toMatchObject({ subjectKind: "comment", subjectId: "reply-id", active: true, reaction: "LOVE", reactionCounts: { LOVE: 1, LAUGH: 2, DISAGREE: 0 }, viewerReactions: ["LOVE"], reactionUsers: { LOVE: [{ id: "user-a", fullName: "A. Researcher" }] } });
    expect(Object.keys(result.reactionCounts)).toHaveLength(10);
  });

  it("scopes discovery by viewer and invalidates it on relevant forum updates", async () => {
    mocks.viewer = "user-a"; useForumDiscovery("topic-id");
    expect(mocks.useQuery.mock.calls.at(-1)![0].queryKey).toEqual(["forum", "discovery", "topic-id", "user-a"]);
    mocks.viewer = null; useForumDiscovery("topic-id");
    expect(mocks.useQuery.mock.calls.at(-1)![0].queryKey).toEqual(["forum", "discovery", "topic-id", "anonymous"]);
    useUpdateForumPost(); await mocks.useMutation.mock.calls.at(-1)![0].onSuccess();
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["forum", "discovery"] });
  });
  it("normalizes bounded discovery DTOs without creating fake metrics", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: { data: { suggested: [{ id: "other", publicSlug: "other-discussion", title: "Other", type: "DISCUSSION", replyCount: 0, viewCount: 3, reason: "SAME_COMMUNITY", community: { id: "community", name: "Community", slug: "community" } }], related: [] } } });
    const result = await forumApi.discovery("topic-id");
    expect(result.suggested[0]).toMatchObject({ id: "other", publicSlug: "other-discussion", replyCount: 0, viewCount: 3, reason: "SAME_COMMUNITY", community: { slug: "community" } });
    expect(result.related).toEqual([]);
  });
  it("uses existing persisted PUT/DELETE follow operations", async () => {
    const put = vi.spyOn(api, "put").mockResolvedValue({});
    const del = vi.spyOn(api, "delete").mockResolvedValue({});
    await forumApi.follow("topic-id", true);
    await forumApi.follow("topic-id", false);
    expect(put).toHaveBeenCalledWith(expect.stringContaining("/topic-id/follow"));
    expect(del).toHaveBeenCalledWith(expect.stringContaining("/topic-id/follow"));
  });
  it.each([true, false])("invalidates detail and all list filters after following=%s", async (following) => {
    const follow = vi.spyOn(forumApi, "follow").mockResolvedValue();
    useFollowThread();
    const options = mocks.useMutation.mock.calls.at(-1)![0];
    const variables = { postId: "topic-id", following };
    await options.mutationFn(variables);
    await options.onSuccess(undefined, variables);
    expect(follow).toHaveBeenCalledWith("topic-id", following);
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["forum", "post"] });
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["forum", "posts"] });
  });
  it("invalidates both UUID and slug detail families after a thread edit", async () => {
    useUpdateForumPost();
    const options = mocks.useMutation.mock.calls.at(-1)![0];
    await options.onSuccess();
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["forum", "post"] });
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["forum", "posts"] });
  });
  it("primes the canonical locator under the same viewer before redirecting", async () => {
    const topic = { id: "topic-id", publicSlug: "readable-topic" };
    vi.spyOn(forumApi, "post").mockResolvedValue(topic as Awaited<ReturnType<typeof forumApi.post>>);
    useForumPost("topic-id");
    const options = mocks.useQuery.mock.calls.at(-1)![0];
    expect(await options.queryFn({ signal: undefined })).toEqual(topic);
    expect(mocks.setData).toHaveBeenCalledWith(["forum", "post", "readable-topic", "user-a"], topic);
    expect(mocks.setData).toHaveBeenCalledTimes(1);
  });
  it("isolates private citation context, member emails and moderator data on account change", () => {
    const keys: unknown[][] = [];
    for (const viewer of ["user-a", "user-b", null]) {
      mocks.viewer = viewer;
      useForumContext(); useCommunityMembers("community"); useForumReports(); useForumModerationActions();
      keys.push(mocks.useQuery.mock.calls.slice(-4).map((call) => call[0].queryKey));
    }
    expect(keys[0]).not.toEqual(keys[1]); expect(keys[1]).not.toEqual(keys[2]);
    expect(mocks.useQuery.mock.calls.slice(-4).every((call) => !call[0].enabled)).toBe(true);
  });
  it("separates viewer-specific list/detail/community cache after account change or logout", () => {
    const keys: unknown[][] = [];
    for (const viewer of ["user-a", "user-b", null]) {
      mocks.viewer = viewer;
      useForumPosts({ sort: "following" }, Boolean(viewer));
      useForumPost("topic-id");
      useCommunities();
      keys.push(mocks.useQuery.mock.calls.slice(-3).map((call) => call[0].queryKey));
    }
    expect(keys[0]).not.toEqual(keys[1]);
    expect(keys[1]).not.toEqual(keys[2]);
    expect(mocks.useQuery.mock.calls.at(-3)![0].enabled).toBe(false);
  });
  it("retrieves every active community page from the real discovery endpoint", async () => {
    const get = vi.spyOn(api, "get")
      .mockResolvedValueOnce({ data: { data: [{ id: "a", name: "A", slug: "a" }], meta: { totalPages: 2 } } })
      .mockResolvedValueOnce({ data: { data: [{ id: "b", name: "B", slug: "b" }], meta: { totalPages: 2 } } });
    expect((await forumApi.communities()).map((row) => row.slug)).toEqual(["a", "b"]);
    expect(get).toHaveBeenNthCalledWith(1, expect.any(String), { params: { page: 1, pageSize: 100, activeOnly: true } });
    expect(get).toHaveBeenNthCalledWith(2, expect.any(String), { params: { page: 2, pageSize: 100, activeOnly: true } });
  });
  it("updates the current viewer cache immediately and restores it after a failed notification save", async () => {
    const post = { id: "topic-id", notificationLevel: "NORMAL", isFollowing: false };
    const list = { data: [post] };
    mocks.getData.mockReturnValue([
      [["forum", "post", "topic-id", "user-a"], post],
      [["forum", "posts", { page: 1 }, "user-a"], list],
      [["forum", "post", "topic-id", "user-b"], { ...post, notificationLevel: "WATCHING" }],
    ]);
    const request = vi.spyOn(forumApi, "notificationLevel").mockResolvedValue();
    useForumNotificationLevel();
    const options = mocks.useMutation.mock.calls.at(-1)![0];
    const variables = { postId: "topic-id", level: "WATCHING" as const };
    const snapshot = options.onMutate(variables);
    expect(mocks.setData).toHaveBeenCalledWith(["forum", "post", "topic-id", "user-a"], expect.objectContaining({ notificationLevel: "WATCHING", isFollowing: true }));
    expect(mocks.setData).toHaveBeenCalledWith(["forum", "posts", { page: 1 }, "user-a"], expect.objectContaining({ data: [expect.objectContaining({ notificationLevel: "WATCHING", isFollowing: true })] }));
    expect(mocks.setData).not.toHaveBeenCalledWith(["forum", "post", "topic-id", "user-b"], expect.anything());
    await options.mutationFn(variables);
    expect(request).toHaveBeenCalledWith("topic-id", "WATCHING");
    options.onError(new Error("offline"), variables, snapshot);
    expect(mocks.setData).toHaveBeenCalledWith(["forum", "post", "topic-id", "user-a"], post);
    expect(mocks.setData).toHaveBeenCalledWith(["forum", "posts", { page: 1 }, "user-a"], list);
  });
});
