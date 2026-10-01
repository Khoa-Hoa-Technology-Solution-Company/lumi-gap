import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ForumPostView } from "../api/forum.api";
import { ForumCard } from "../components/forum-card";
import { ForumSidebar } from "../components/forum-sidebar";
import { ForumMarkdown } from "../components/forum-markdown";

vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key, language: "en" }) }));

const topic: ForumPostView = {
  id: "readable-topic", type: "QUESTION", title: "How should a long academic evaluation question be presented without hiding its final words?",
  content: "A readable excerpt for the topic list.", tags: ["methodology"], status: "active",
  voteScore: 3, commentCount: 6, replyCount: 6, helpfulCount: 3, viewCount: 1200,
  participants: [{ id: "author", fullName: "Researcher" }], author: { id: "author", fullName: "Researcher", academicProfileType: "student", institution: "FPT University", affiliationVerified: true },
  viewerVote: 0, isFollowing: false, isPinned: false, acceptedCommentId: "accepted", canModerate: false, canReply: true,
  linkedResearchGap: { id: "gap-1", title: "Limited longitudinal evidence for AI-assisted review" },
  references: [], community: { id: "community", name: "Research Methodology", slug: "research-methodology" },
  createdAt: "2026-10-01T00:00:00.000Z",
};
const renderTopic = (post = topic) => renderToStaticMarkup(<StaticRouter location="/forum"><ForumCard post={post} locale="en" /></StaticRouter>);

describe("Forum typography hierarchy", () => {
  it("leads with a larger, fully visible title before secondary community metadata", () => {
    const markup = renderTopic();
    const heading = markup.match(/<h2[^>]+>/)?.[0];
    expect(heading).toContain("forum-topic-title");
    const css = readFileSync(new URL("../../../theme/globals.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.forum-topic-title\s*\{\s*font-size: 1\.25rem;/);
    expect(css).toMatch(/@container forum-topics \(min-width: 45rem\)\s*\{\s*\.forum-topic-title\s*\{\s*font-size: 1\.375rem;/);
    expect(heading).not.toContain("line-clamp");
    expect(heading).toContain("break-words");
    expect(markup.indexOf(topic.title)).toBeLessThan(markup.indexOf(topic.community!.name));
    expect(markup).toContain("line-clamp-2 text-base leading-6");
    expect(markup).toContain("flex-wrap items-center gap-x-2 gap-y-1 text-sm");
  });

  it("retains real metrics and reply anchors with the shared table geometry", () => {
    const markup = renderTopic();
    expect(markup).toContain("forum-topic-row");
    expect(markup).toContain("forum-topic-metrics");
    expect(markup).toContain('href="/forum/readable-topic#responses-section"');
    expect(markup).toContain('title="6 Replies"');
    expect(markup).toContain('title="1,200 Views"');
    expect(markup).toContain('title="3 Helpful. Helpful reflects community usefulness, not scientific validation."');
  });

  it("keeps academic identity, research provenance and accepted-answer meaning visible", () => {
    const markup = renderTopic();
    expect(markup).toContain("Researcher");
    expect(markup).toContain("Student · FPT University");
    expect(markup).toContain("Limited longitudinal evidence for AI-assisted review");
    expect(markup).toContain('href="/research-gaps?gapId=gap-1"');
    expect(markup).toContain("Accepted by question author");
    expect(markup).toContain("not scientific verification");
  });

  it("uses readable navigation and prose without changing the global app font scale", () => {
    const sidebar = renderToStaticMarkup(<StaticRouter location="/forum"><ForumSidebar /></StaticRouter>);
    expect(sidebar).toContain("text-base leading-6");
    expect(sidebar).toContain("w-[var(--forum-sidebar-width)]");
    const prose = renderToStaticMarkup(<ForumMarkdown content="An academic paragraph." />);
    expect(prose).toContain("text-base leading-[1.7] sm:text-lg");
    expect(prose).toContain("max-w-[70ch]");
    const css = readFileSync(new URL("../../../theme/globals.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.forum-workspace\s*\{[^}]*--forum-sidebar-width: 14rem;[^}]*font-size: 1rem;/);
  });

  it("reserves the exact width of the enlarged metric columns and their four gaps", () => {
    const css = readFileSync(new URL("../../../theme/globals.css", import.meta.url), "utf8");
    const width = Number(css.match(/--forum-metrics-width: ([\d.]+)rem/)?.[1]);
    const columns = css.match(/--forum-metrics-columns: ([^;]+)/)?.[1] ?? "";
    const sizes = [...columns.matchAll(/([\d.]+)rem/g)].map((match) => Number(match[1]));
    expect(sizes).toHaveLength(5);
    expect(width).toBe(sizes.reduce((sum, size) => sum + size, 0) + 4 * 0.5);
    const list = readFileSync(new URL("../../../pages/forum/forum-list.tsx", import.meta.url), "utf8");
    expect(list).toContain("forum-topic-head items-center gap-4");
    expect(list).toContain("forum-topic-head-metrics grid items-center gap-2");
    expect(css).toMatch(/\.forum-topic-row,\s*\.forum-topic-head\s*\{\s*--forum-row-metrics-width: var\(--forum-metrics-width\);\s*--forum-row-metrics-columns: var\(--forum-metrics-columns\);/);
  });

  it("continues escaping topic titles and excerpts after the hierarchy change", () => {
    const markup = renderTopic({ ...topic, title: "<script>alert(1)</script>", content: "<img src=x onerror=alert(1)>" });
    expect(markup).not.toContain("<script>");
    expect(markup).not.toContain("<img src=x");
    expect(markup).toContain("&lt;script&gt;");
  });
});
