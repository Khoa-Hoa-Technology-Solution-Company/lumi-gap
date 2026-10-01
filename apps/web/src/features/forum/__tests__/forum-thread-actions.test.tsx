import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ForumResponseItem } from "../components/forum-response-item";
import { ForumBodyEditor } from "../components/forum-body-editor";
import { ForumThreadTimeline } from "../components/forum-thread-timeline";
import { FORUM_FEEDS } from "../utils/forum-navigation";
import type { ForumCommentView } from "../api/forum.api";

vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key, language: "en" }) }));
const comment: ForumCommentView = { id: "response", postId: "topic", content: "A methodological response", createdAt: "2026-10-01T00:00:00Z", author: { id: "researcher", fullName: "Researcher" }, status: "active", isAccepted: true, helpfulCount: 2, voteScore: 2, viewerVote: 0, references: [] };
const defaults = { comment, isQuestion: true, isPostOwner: true, isCommentOwner: false, isAuthed: true, canReply: true, ordinal: 2, onReviewCitation: vi.fn(), onReply: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onReport: vi.fn(), onVote: vi.fn(), onAccept: vi.fn() };
const render = (props: Partial<typeof defaults & { readOnly: boolean; votePending: boolean; acceptancePending: boolean }> = {}) => renderToStaticMarkup(<ForumResponseItem {...defaults} {...props} />);

describe("Research thread actions and semantics", () => {
  it("only lets the question owner accept, and labels acceptance as author judgement", () => {
    expect(render()).toContain("Unaccept response");
    expect(render()).toContain("not scientific verification");
    expect(render({ isPostOwner: false })).not.toContain("Unaccept response");
    expect(render({ isQuestion: false })).not.toContain("Unaccept response");
    expect(render({ readOnly: true })).not.toContain("Unaccept response");
  });
  it("guards votes and acceptance while pending, retaining research safeguards", () => {
    const markup = render({ votePending: true, acceptancePending: true });
    const helpful = markup.match(/<button[^>]+aria-pressed="false"[^>]*>/)?.[0] ?? "";
    expect(helpful).toContain("disabled");
    expect(markup).toMatch(/<button[^>]*disabled[^>]*title="This marks the author/);
    expect(markup).toContain("Helpful reflects community usefulness, not scientific validation.");
    expect(markup).toContain('aria-label="More response actions"');
  });
  it("uses real chronological, unanswered, activity and follow semantics in both navigations", () => {
    expect(FORUM_FEEDS.map((feed) => feed.value)).toEqual(["latest", "unanswered", "popular", "following"]);
    expect(FORUM_FEEDS[1]!.description).toContain("no visible replies");
    expect(FORUM_FEEDS[2]!.description).toContain("not research validity");
    expect(FORUM_FEEDS[3]!.description).toContain("chose to follow");
    const source = readFileSync(new URL("../../../pages/forum/forum-list.tsx", import.meta.url), "utf8");
    expect(source).toContain("FORUM_FEEDS.map");
    expect(source).toContain('if (sort !== "latest") next.set("feed", sort)');
  });
  it("edits with the existing table dialog, formatting and preview instead of a plain textarea", () => {
    const markup = renderToStaticMarkup(<ForumBodyEditor value="An extracted-method discussion" onChange={vi.fn()} label="Discussion body" maxLength={20000} />);
    expect(markup).toContain('aria-label="Discussion body"');
    expect(markup).toContain('maxLength="20000"');
    expect(markup).toContain('aria-label="More formatting"');
    const editor = readFileSync(new URL("../components/forum-body-editor.tsx", import.meta.url), "utf8");
    expect(editor).toContain('onTableInsert={(table) => insert("table", table)}');
    // Display utilities must not override the textarea's native hidden state in Preview.
    const field = markup.match(/<textarea[^>]*>/)?.[0] ?? "";
    expect(field).not.toMatch(/class="[^"]*\b(?:block|inline-block|flex|grid)\b/);
    expect(editor).toContain("hidden={preview}");
    expect(markup).toContain("Preview");
    const composer = readFileSync(new URL("../components/forum-composer.tsx", import.meta.url), "utf8");
    expect(composer).not.toContain("window.confirm");
    expect(composer).toContain("<Dialog open={discardOpen}");
    expect(composer).toContain("Keep editing");
  });
  it("does not pretend the end of a partial reply page is the latest post", () => {
    const markup = renderToStaticMarkup(<ForumThreadTimeline postIds={["opening-post", "reply-1"]} total={30} createdAt={comment.createdAt} lastActivityAt={comment.createdAt} hasMore onLoadMore={vi.fn()} />);
    expect(markup).toContain("Load more replies");
    expect(markup).not.toContain("Jump to latest post");
  });
});
