import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/services/api-client";
import { forumApi } from "../api/forum.api";
import { formatForumActivityTime } from "../utils/forum-helpers";
import { vi as vietnamese } from "@/i18n/locales/vi";

afterEach(() => vi.restoreAllMocks());

describe("forum real-data contract", () => {
  const topic = {
    id: "topic-id", type: "QUESTION", title: "Evaluation methods", body: "Academic discussion",
    createdAt: "2026-09-01T00:00:00.000Z", lastActivityAt: "2026-09-30T00:00:00.000Z",
    commentCount: 99, replyCount: 3, voteScore: 7, helpfulCount: 2, viewCount: 248,
    authorId: { id: "author", fullName: "Researcher" },
    participants: [{ id: "author", fullName: "Researcher" }, { id: "reply-author", fullName: "Reviewer" }],
  };

  it("preserves backend metrics and participant identity rather than recounting locally", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: { data: [topic], meta: { page: 1, total: 1 } } });
    const result = await forumApi.posts({ sort: "latest" });
    expect(result.data[0]).toMatchObject({ replyCount: 3, commentCount: 3, helpfulCount: 2, viewCount: 248, lastActivityAt: topic.lastActivityAt });
    expect(result.data[0]!.participants.map((user) => user.id)).toEqual(["author", "reply-author"]);
  });

  it("opens a topic using a credentialed GET without accepting a client-set counter", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: { data: topic } });
    await forumApi.post(topic.id);
    expect(get).toHaveBeenCalledWith(expect.stringContaining(topic.id), { withCredentials: true });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("does not fabricate linked research contexts when the backend omits them", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: { data: topic } });
    const result = await forumApi.post(topic.id);
    expect(result.linkedPaper).toBeUndefined();
    expect(result.linkedResearchGap).toBeUndefined();
    expect(result.linkedProject).toBeUndefined();
    expect(result.canReply).toBe(false);
  });

  it("retains real pagination, response Helpful and parent-author context", async () => {
    const meta = { page: 2, pageSize: 25, total: 26, totalPages: 2 };
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: { data: [{ id: "reply", postId: "topic-id", body: "Follow-up", helpfulCount: 2, voteScore: 1, parentCommentId: "parent", parentComment: { id: "parent", status: "active", author: { id: "author", fullName: "Researcher" } } }], meta } });
    const result = await forumApi.commentsPage(topic.id, 2);
    expect(get).toHaveBeenCalledWith(expect.stringContaining(topic.id), { params: { page: 2, pageSize: 25 } });
    expect(result.meta).toEqual(meta);
    expect(result.data[0]).toMatchObject({ helpfulCount: 2, voteScore: 1, parentCommentId: "parent", parentComment: { author: { fullName: "Researcher" } } });
  });

  it("provides Vietnamese metric labels and compact non-wrapping recent activity", () => {
    expect(["Topic", "Replies", "Views", "Helpful", "Activity"].map((key) => vietnamese[key as keyof typeof vietnamese])).toEqual(["Chủ đề", "Trả lời", "Lượt xem", "Hữu ích", "Hoạt động"]);
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-09-30T12:00:00Z").getTime());
    expect(formatForumActivityTime("2026-09-30T10:00:00Z", "vi")).toBe("2h");
    expect(formatForumActivityTime("2026-09-28T12:00:00Z", "vi")).toBe("2d");
  });
});
