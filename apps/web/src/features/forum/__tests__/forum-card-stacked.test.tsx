// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ForumPostView } from "../api/forum.api";
import { ForumCard } from "../components/forum-card";

vi.mock("@/i18n", () => ({
  useI18n: () => ({ t: (key: string, values?: Record<string, string | number>) => Object.entries(values ?? {}).reduce((text, [name, value]) => text.replace(`{{${name}}}`, String(value)), key), language: "en" }),
}));

const author = { id: "a", fullName: "Ada Lovelace" };
const post = { id: "p1", publicSlug: "p1", type: "QUESTION", title: "A long title about graph neural networks for citation analysis", content: "", tags: [], status: "active", voteScore: 0, commentCount: 0, replyCount: 2, helpfulCount: 5, viewCount: 1, participants: [author], viewerVote: 0, isFollowing: false, isPinned: false, canModerate: false, canReply: true, references: [], author, community: { id: "c", name: "Software Engineering", slug: "software-engineering" }, createdAt: "2026-10-01T00:00:00Z", lastActivityAt: "2026-10-02T00:00:00Z" } as unknown as ForumPostView;
const html = (value: ForumPostView, props: Partial<Parameters<typeof ForumCard>[0]> = {}) => renderToStaticMarkup(<StaticRouter location="/forum"><ForumCard post={value} locale="en" {...props} /></StaticRouter>);
const dom = (value: string) => new DOMParser().parseFromString(value, "text/html");

describe("ForumCard layout=stacked (P1)", () => {
  it("labels every number: '2 replies', '1 view' (singular), with the activity time, and has no bare metric columns", () => {
    const stacked = dom(html(post, { layout: "stacked" }));
    expect(stacked.querySelector("[data-testid='stacked-stats']")!.textContent).toMatch(/^2 replies·1 view·/);
    expect(stacked.querySelector(".forum-topic-metrics")).toBeNull();
    expect(stacked.querySelector(".forum-topic-row")).toBeNull();
    expect(stacked.querySelector("time")).not.toBeNull();
    expect(stacked.querySelector("[data-testid='stacked-stats']")!.textContent).not.toContain("Helpful");
  });

  it("uses singular and plural forms: 1 reply / 3 views, 0 replies", () => {
    const one = dom(html({ ...post, replyCount: 1, viewCount: 3 }, { layout: "stacked" })).querySelector("[data-testid='stacked-stats']")!.textContent!;
    expect(one).toMatch(/^1 reply·3 views·/);
    expect(dom(html({ ...post, replyCount: 0, viewCount: 0 }, { layout: "stacked" })).querySelector("[data-testid='stacked-stats']")!.textContent).toMatch(/^0 replies·0 views·/);
  });

  it("gives the title the full width on at most two lines, then author, category and type on one meta line", () => {
    const stacked = dom(html(post, { layout: "stacked" }));
    expect(stacked.querySelector("h2")!.className).toContain("line-clamp-2");
    const meta = stacked.querySelector("[data-testid='stacked-meta']")!;
    expect(meta.textContent).toContain("Ada Lovelace");
    expect(meta.textContent).toContain("Software Engineering");
    expect(meta.textContent).toContain("Question");
  });

  it("renders the kicker before the title link", () => {
    const stacked = dom(html(post, { layout: "stacked", kicker: <p data-testid="kicker">Because you follow NLP</p> }));
    const kicker = stacked.querySelector("[data-testid='kicker']")!;
    expect(kicker.compareDocumentPosition(stacked.querySelector("h2")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps the default row layout unchanged: the metric columns and no stacked markup", () => {
    const row = dom(html(post));
    expect(row.querySelector(".forum-topic-row")).not.toBeNull();
    expect(row.querySelector(".forum-topic-metrics")).not.toBeNull();
    expect(row.querySelector("[data-layout='stacked']")).toBeNull();
    expect(row.querySelector("[data-testid='stacked-stats']")).toBeNull();
  });
});
