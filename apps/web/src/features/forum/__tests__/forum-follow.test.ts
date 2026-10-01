import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/services/api-client";
import { forumApi } from "../api/forum.api";
import { useCommunities, useFollowThread, useForumPost, useForumPosts } from "../hooks/use-forum";

const mocks = vi.hoisted(() => ({ viewer: "user-a" as string | null, invalidate: vi.fn(), useMutation: vi.fn((options) => options), useQuery: vi.fn((options) => options) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: mocks.invalidate }), useMutation: mocks.useMutation, useQuery: mocks.useQuery, useInfiniteQuery: vi.fn() }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: mocks.viewer ? { id: mocks.viewer } : null, tokens: mocks.viewer ? { accessToken: "test-only" } : null }) }));
afterEach(() => { vi.restoreAllMocks(); mocks.viewer = "user-a"; mocks.invalidate.mockClear(); });

describe("Forum follow persistence and cache", () => {
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
    options.onSuccess(undefined, variables);
    expect(follow).toHaveBeenCalledWith("topic-id", following);
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["forum", "post", "topic-id"] });
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["forum", "posts"] });
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
});
