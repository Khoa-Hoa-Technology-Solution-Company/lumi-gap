import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ForumPostView } from "../api/forum.api";
import { ForumCard } from "../components/forum-card";

vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key, language: "en" }) }));

const author = { id: "a", fullName: "Ada Lovelace" };
const post = { id: "p1", publicSlug: "p1", type: "DISCUSSION", title: "Scoped topic", content: "", tags: [], status: "active", voteScore: 0, commentCount: 0, replyCount: 0, helpfulCount: 0, viewCount: 0, participants: [author], viewerVote: 0, isFollowing: false, isPinned: false, canModerate: false, canReply: true, references: [], author, community: { id: "c", name: "Software Engineering", slug: "software-engineering" }, createdAt: "2026-10-01T00:00:00Z" } as unknown as ForumPostView;
const render = (value: ForumPostView) => renderToStaticMarkup(<StaticRouter location="/forum"><ForumCard post={value} locale="en" /></StaticRouter>);

describe("forum card research community chip", () => {
  it("links a public research community without a lock", () => {
    const html = render({ ...post, researchCommunity: { id: "r", name: "SE Lab", slug: "se-lab", visibility: "public" } });
    expect(html).toContain('href="/communities/se-lab"');
    expect(html).toContain("SE Lab");
    expect(html).not.toContain('aria-label="Private community"');
  });
  it("marks a private research community with a lock", () => {
    const html = render({ ...post, researchCommunity: { id: "r", name: "Closed Lab", slug: "closed-lab", visibility: "private" } });
    expect(html).toContain("Closed Lab");
    expect(html).toContain('aria-label="Private community"');
  });
  it("shows no chip for a post without a research community", () => {
    expect(render(post)).not.toContain("research-community-chip");
  });
});
