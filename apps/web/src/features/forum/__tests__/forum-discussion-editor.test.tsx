import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommunityView } from "../api/forum.api";
import { buildForumDiscussionInput, formatForumMarkdown, forumInitialDiscussionType, forumMarkdownShortcut, forumNewDiscussionHref, insertForumMarkdown, type ForumDiscussionDraft } from "../utils/forum-discussion-editor";
import { ForumNewPage } from "@/pages/forum/forum-new";

const state = vi.hoisted(() => ({ loading: false, error: false, pending: false }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key, language: "en" }) }));
vi.mock("@/features/forum/hooks/use-forum", () => ({
  useCommunities: () => ({ data: state.loading || state.error ? undefined : communities, isLoading: state.loading, isError: state.error, refetch: vi.fn() }),
  useForumContext: () => ({ data: { papers: [{ id: "paper", title: "Study", publicationYear: 2026 }], gaps: [{ id: "gap", title: "Candidate", forumShareable: false }], projects: [{ id: "project", title: "Project" }] }, isLoading: false, isError: false, refetch: vi.fn() }),
  useCreateForumPost: () => ({ isPending: state.pending, mutateAsync: vi.fn() }),
  useShareForumGap: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));

const joined: CommunityView = { id: "joined", slug: "research-methodology", name: "Research Methodology", description: "", researchTopics: [], visibility: "public", status: "ACTIVE", rules: [], memberCount: 1, threadCount: 0, canManage: false, canEditCommunity: false, contentRestricted: false, viewerMembership: { status: "active", role: "member" } };
const communities = [joined, { ...joined, id: "pending", slug: "pending", name: "Pending community", viewerMembership: { status: "pending" as const, role: "member" as const } }];
const draft: ForumDiscussionDraft = { type: "QUESTION", communityId: "joined", title: "  A research question  ", content: "  Evidence and methods.  ", tags: "methods, evidence, methods", linkedPaperId: "", linkedGapId: "", linkedProjectId: "", references: [] };
const render = (url = "/forum/new") => renderToStaticMarkup(<StaticRouter location={url}><ForumNewPage /></StaticRouter>);
beforeEach(() => { state.loading = false; state.error = false; state.pending = false; });

describe("New discussion composer", () => {
  it("keeps community/type defaults but does not carry list sorting or search into a new post", () => {
    expect(forumNewDiscussionHref(new URLSearchParams("community=research-methodology&type=PAPER_DISCUSSION&page=3&feed=popular&q=abc"))).toBe("/forum/new?community=research-methodology&type=PAPER_DISCUSSION");
    expect(forumNewDiscussionHref(new URLSearchParams("type=PAPER_DISCUSSION&paper=paper&page=2"))).toBe("/forum/new?type=PAPER_DISCUSSION&paper=paper");
    expect(forumNewDiscussionHref(new URLSearchParams("type=invalid"))).toBe("/forum/new");
    expect(forumInitialDiscussionType(new URLSearchParams("type=DISCUSSION"))).toBe("DISCUSSION");
    expect(forumInitialDiscussionType(new URLSearchParams("type=invalid"))).toBe("QUESTION");
  });

  it("uses one shared Forum shell with progressive actions and a real Markdown preview", () => {
    const markup = render();
    expect(markup).toContain("forum-workspace");
    expect(markup).toContain(">Add citation<");
    expect(markup).toContain(">Link research context<");
    expect(markup).toContain('aria-label="Live Preview"');
    expect(markup).toContain('aria-label="Formatting"');
    expect(markup).toContain('for="discussion-title"');
    expect(markup).toContain('for="discussion-body"');
    expect(markup).not.toContain("<main");
    expect(markup).not.toContain("rounded-3xl");
    expect(markup).toContain("forum-compose-tabs flex");
    expect(markup).not.toContain('id="discussion-research-context"');
    expect(markup).not.toContain('aria-label="Paper Citation Title"');
    expect(markup).not.toContain('aria-label="DOI"');
    const select = markup.match(/<select aria-label="Community"[^>]*>(.*?)<\/select>/)?.[1];
    expect(select).toContain('value="joined"');
    expect(select).not.toContain('value="pending"');
  });

  it("exposes required research fields immediately for paper/gap discussions", () => {
    const paper = render("/forum/new?type=PAPER_DISCUSSION");
    expect(paper).toContain('id="discussion-research-context"');
    expect(paper).toContain('aria-label="Linked Paper"');
    expect(paper).toContain('required=""');
    const gap = render("/forum/new?type=RESEARCH_GAP_DISCUSSION");
    expect(gap).toContain('aria-label="Candidate Research Gap"');
    expect(gap).toContain('required=""');
  });

  it("shows honest loading/retry states and disables the form while publishing", () => {
    state.loading = true;
    expect(render()).toContain("Loading communities");
    expect(render()).not.toContain("You need to join a research community before posting.");
    state.loading = false; state.error = true;
    expect(render()).toContain("Could not load communities.");
    state.error = false; state.pending = true;
    expect(render()).toContain('<fieldset disabled=""');
    expect(render()).toContain("Publishing…");
  });

  it("keeps preview optional instead of permanently splitting the editor", () => {
    const css = readFileSync(new URL("../../../theme/globals.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.forum-compose\s*\{\s*container: forum-compose \/ inline-size;/);
    expect(css).toMatch(/\.forum-compose-tabs\s*\{\s*display: flex;/);
    expect(css).not.toMatch(/\.forum-compose-editor[\s\S]*grid-template-columns/);
  });

  it("formats selected text without discarding the rest of the draft", () => {
    expect(insertForumMarkdown("one two three", 4, 7, "**", "**", "text")).toEqual({ content: "one **two** three", selectionStart: 6, selectionEnd: 9 });
    expect(insertForumMarkdown("", 0, 0, "- ", "", "nội dung").content).toBe("- nội dung");
  });

  it("adds academic formatting snippets without accepting raw HTML", () => {
    expect(formatForumMarkdown("", 0, 0, "table", "text").content).toContain("| Title | References | Notes |");
    expect(formatForumMarkdown("", 0, 0, "footnote", "text").content).toContain("[^1]: text");
    expect(formatForumMarkdown("", 0, 0, "callout", "text").content).toContain("> **Note**");
    expect(formatForumMarkdown("", 0, 0, "details", "text").content).toContain("> **Details**");
    expect(formatForumMarkdown("", 0, 0, "strikethrough", "text").content).toBe("~~text~~");
    expect(formatForumMarkdown("", 0, 0, "divider", "text").content).toBe("---");
    expect(formatForumMarkdown("", 0, 0, "quote-post", "text", { quoteSource: "A post" }).content).toContain("> A post");
    expect(formatForumMarkdown("A | B\nC", 0, 7, "table", "text").content).toContain("A \\| B C");
    const configured = formatForumMarkdown("", 0, 0, "table", "text", { table: { rows: 3, columns: 2, includeHeader: true, headers: ["Method", "Result"] } }).content;
    expect(configured).toContain("| Method | Result |");
    expect(configured.split("\n").filter((line) => line.startsWith("| ")).length).toBe(5);
  });

  it("keeps keyboard shortcuts scoped to the editor", () => {
    expect(forumMarkdownShortcut({ key: "b", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, isComposing: false })).toBe("bold");
    expect(forumMarkdownShortcut({ key: ".", code: "Period", ctrlKey: true, metaKey: false, altKey: false, shiftKey: true, isComposing: false })).toBe("date");
    expect(forumMarkdownShortcut({ key: "b", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, isComposing: false })).toBeUndefined();
  });
});

describe("Discussion submission contract", () => {
  it("keeps real creation DTOs, trims text and normalizes duplicate tags", () => {
    const result = buildForumDiscussionInput(draft, [joined], []);
    expect(result).toEqual({ input: { type: "QUESTION", communityId: "joined", title: "A research question", content: "Evidence and methods.", tags: ["methods", "evidence"], linkedPaperId: undefined, linkedResearchGapId: undefined, linkedProjectId: undefined, references: [] } });
  });
  it("requires joined membership and valid title/body", () => {
    expect(buildForumDiscussionInput(draft, [], [])).toHaveProperty("error");
    for (const change of [{ title: "ab" }, { title: "a".repeat(241) }, { content: " " }, { content: "a".repeat(20001) }, { tags: "a".repeat(81) }, { tags: Array.from({ length: 13 }, (_, i) => `tag${i}`).join(",") }]) expect(buildForumDiscussionInput({ ...draft, ...change }, [joined], [])).toHaveProperty("error");
  });
  it("retains required papers and gap-sharing checks without making private gaps public automatically", () => {
    expect(buildForumDiscussionInput({ ...draft, type: "PAPER_DISCUSSION" }, [joined], [])).toHaveProperty("error");
    expect(buildForumDiscussionInput({ ...draft, type: "RESEARCH_GAP_DISCUSSION", linkedGapId: "gap" }, [joined], [{ id: "gap", forumShareable: false }])).toHaveProperty("error");
    expect(buildForumDiscussionInput({ ...draft, type: "RESEARCH_GAP_DISCUSSION", linkedGapId: "gap" }, [joined], [{ id: "gap", forumShareable: true }])).toHaveProperty("input.linkedResearchGapId", "gap");
  });
  it("sends attached indexed papers as ForumReferences without creating gap evidence", () => {
    const result = buildForumDiscussionInput({ ...draft, references: [{ paperId: "paper", doi: "10.1145/abc", title: "Study", year: 2025, verified: true }] }, [joined], []);
    expect(result).toHaveProperty("input.references", [{ paperId: "paper", doi: "10.1145/abc", title: "Study", year: 2025, verified: true }]);
    expect(buildForumDiscussionInput({ ...draft, references: [{ doi: "10.1145/abc" }] }, [joined], [])).toHaveProperty("error");
  });
});
