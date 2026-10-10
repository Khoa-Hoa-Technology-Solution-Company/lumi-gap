import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { parseForumListParams, updateForumListParam, forumPageNumbers } from "../utils/forum-pagination";
import { formatForumCompactNumber, formatForumNumber } from "../utils/forum-helpers";
import { ForumPagination } from "../components/forum-pagination";
import { ForumAuthorByline } from "../components/forum-author-byline";
import { ForumMarkdown } from "../components/forum-markdown";
import { vi as vietnamese } from "@/i18n/locales/vi";
import { readFileSync } from "node:fs";

vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key, language: "en" }) }));

describe("Forum list URL pagination", () => {
  it("defaults to 20 and restores every valid URL value", () => {
    expect(parseForumListParams(new URLSearchParams())).toMatchObject({ page: 1, pageSize: 20, sort: "latest", type: "", query: "" });
    expect(parseForumListParams(new URLSearchParams("page=2&pageSize=30&sort=following&type=QUESTION&q=screening"))).toEqual({ page: 2, pageSize: 30, sort: "following", type: "QUESTION", query: "screening", category: "" });
  });
  it.each(["0", "-1", "1.5", "Infinity", "NaN", "9007199254740992", "1000001", "x"])("normalizes invalid page %s", (value) => {
    expect(parseForumListParams(new URLSearchParams({ page: value })).page).toBe(1);
  });
  it.each(["0", "-1", "15", "100", "999999", "Infinity"])("rejects unsupported page size %s", (value) => {
    expect(parseForumListParams(new URLSearchParams({ pageSize: value })).pageSize).toBe(20);
  });
  it("validates sort/type and bounds search input", () => {
    expect(parseForumListParams(new URLSearchParams({ sort: "unknown", type: "unknown", q: "x".repeat(300) }))).toMatchObject({ sort: "latest", type: "", query: "x".repeat(240) });
    expect(parseForumListParams(new URLSearchParams("feed=invalid&sort=popular"))).toMatchObject({ sort: "popular" });
    expect(parseForumListParams(new URLSearchParams("feed=unanswered&sort=popular"))).toMatchObject({ sort: "unanswered" });
  });
  it("preserves filters on page changes, and resets pages on every filter edit", () => {
    const params = new URLSearchParams("page=3&pageSize=10&community=community-id&type=QUESTION&sort=popular&q=review&linkedResearchGapId=gap-id&tag=methods");
    const page = updateForumListParam(params, "page", "2");
    expect(page.get("q")).toBe("review");
    expect(page.get("linkedResearchGapId")).toBe("gap-id");
    expect(page.get("pageSize")).toBe("10");
    expect(params.get("page")).toBe("3");
    for (const key of ["community", "type", "sort", "q", "linkedResearchGapId", "tag", "pageSize"]) expect(updateForumListParam(params, key, "new-value").has("page")).toBe(false);
    expect(updateForumListParam(params, "page", "1").has("page")).toBe(false);
  });
  it("keeps numbered navigation bounded for large result sets", () => {
    expect(forumPageNumbers(1, 2)).toEqual([1, 2]);
    expect(forumPageNumbers(6, 12)).toEqual([1, "ellipsis-start", 5, 6, 7, "ellipsis-end", 12]);
    expect(forumPageNumbers(12, 12)).toEqual([1, "ellipsis-start", 8, 9, 10, 11, 12]);
    expect(forumPageNumbers(500, 1000)).toHaveLength(7);
    const markup = renderToStaticMarkup(<ForumPagination page={2} pageSize={20} total={240} totalPages={12} onPageChange={() => {}} onPageSizeChange={() => {}} />);
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('aria-label="Topic pagination"');
    expect(markup).toContain("max-w-full flex-wrap");
    expect(markup).not.toContain('aria-label="Page 10"');
  });
});

describe("Forum readability and locale", () => {
  it("translates the literal UI labels on list, thread and reading components", () => {
    const paths = ["../../../pages/forum/forum-list.tsx", "../../../pages/forum/forum-detail.tsx", "../components/forum-author-byline.tsx", "../components/forum-response-item.tsx", "../components/forum-composer.tsx", "../components/forum-thread-timeline.tsx", "../components/forum-thread-discovery.tsx", "../components/forum-context-card.tsx"];
    const keys = new Set<string>();
    for (const path of paths) for (const match of readFileSync(new URL(path, import.meta.url), "utf8").matchAll(/\bt\("([^"]+)"\)/g)) keys.add(match[1]!);
    const missing = [...keys].filter((key) => !vietnamese[key as keyof typeof vietnamese] || vietnamese[key as keyof typeof vietnamese] === key);
    expect(missing).toEqual([]);
  });
  it("uses stable compact suffixes and local decimal/group separators", () => {
    expect(formatForumCompactNumber(1024, "vi")).toBe("1K");
    expect(formatForumCompactNumber(1200, "vi")).toBe("1,2K");
    expect(formatForumCompactNumber(1200, "en")).toBe("1.2K");
    expect(formatForumCompactNumber(1200000, "vi")).toBe("1,2M");
    expect(formatForumCompactNumber(999, "vi")).toBe("999");
    expect(formatForumNumber(1034, "vi")).toBe("1.034");
  });
  it("keeps the role and institution compact with details behind an accessible profile control", () => {
    const markup = renderToStaticMarkup(<ForumAuthorByline author={{ id: "author", fullName: "Researcher", academicRole: "LECTURER", institution: "FPT University", positionTitle: "Senior Lecturer", affiliationVerified: true, positionVerified: true }} />);
    expect(markup.match(/FPT University/g)).toHaveLength(1);
    expect(markup.match(/Lecturer/g)).toHaveLength(1);
    expect(markup).not.toContain("Senior Lecturer");
    expect(markup).toContain('aria-label="View author profile"');
    expect(markup).toContain('aria-haspopup="dialog"');
    expect(markup).toContain('href="/academics/author"');
    expect(markup).not.toContain('aria-label="FPT Education affiliation verified"');
  });
  it("shows the FPT affiliation label only when that affiliation is explicitly verified", () => {
    const markup = renderToStaticMarkup(<ForumAuthorByline author={{ id: "author", fullName: "Researcher", academicRole: "LECTURER", institution: "FPT University", fptAffiliationVerified: true }} />);
    expect(markup).toContain('aria-label="FPT Education affiliation verified"');
  });
  it("caps prose measure without allowing raw HTML execution", () => {
    const markup = renderToStaticMarkup(<ForumMarkdown content={'A readable paragraph.\n\n<script>alert(1)</script>\n\n[link](javascript:alert(1))'} />);
    expect(markup).toContain("max-w-[70ch]");
    expect(markup).toContain("text-base leading-6");
    expect(markup).not.toContain("<script>");
    expect(markup).not.toContain('href="javascript:');
  });
  it("localizes the entire thread metric and composer vocabulary", () => {
    for (const key of ["References", "replies", "views", "helpful", "active", "Reply to discussion", "Position verified", "Load more replies", "Topic pagination", "Add citation", "Post reply"] as const) expect(vietnamese[key]).not.toBe(key);
    expect(vietnamese.References).toBe("Tài liệu tham khảo");
    expect(vietnamese["Paper Discussion"]).toBe("Bình luận bài báo");
  });
});
