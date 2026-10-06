import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ForumCategoryView } from "../api/forum.api";
import { buildForumDiscussionInput, formatForumMarkdown, forumInitialDiscussionType, forumMarkdownShortcut, forumNewDiscussionHref, insertForumMarkdown, type ForumDiscussionDraft } from "../utils/forum-discussion-editor";
import { ForumNewPage } from "@/pages/forum/forum-new";
import { ForumMarkdown } from "../components/forum-markdown";

const state = vi.hoisted(() => ({ loading: false, error: false, pending: false }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key, language: "en" }) }));
vi.mock("@/features/forum/hooks/use-forum", () => ({
  useForumContext: () => ({ data: { papers: [{ id: "paper", title: "Study", publicationYear: 2026 }], gaps: [{ id: "gap", title: "Candidate", forumShareable: false }], projects: [{ id: "project", title: "Project" }] }, isLoading: false, isError: false, refetch: vi.fn() }),
  useCreateForumPost: () => ({ isPending: state.pending, mutateAsync: vi.fn() }),
  useShareForumGap: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useForumPaperSearch: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock("@/features/forum/hooks/use-forum-categories", () => ({
  useForumCategories: () => ({ data: state.loading || state.error ? undefined : communities, isLoading: state.loading, isError: state.error, refetch: vi.fn() }),
  useForumTags: () => ({ data: [] }),
}));

const joined: ForumCategoryView = { id: "joined", slug: "research-methodology", name: "Research Methodology", description: "", status: "ACTIVE", sortOrder: 0 };
const communities = [joined, { ...joined, id: "pending", slug: "archived", name: "Archived category", status: "ARCHIVED" as const }];
const draft: ForumDiscussionDraft = { type: "QUESTION", communityId: "joined", title: "  A research question  ", content: "  Evidence and methods.  ", tags: "methods, evidence, methods", linkedPaperId: "", linkedGapId: "", references: [] };
const render = (url = "/forum/new") => renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><StaticRouter location={url}><ForumNewPage /></StaticRouter></QueryClientProvider>);
beforeEach(() => { state.loading = false; state.error = false; state.pending = false; });

describe("New discussion composer", () => {
  it("keeps community/type defaults but does not carry list sorting or search into a new post", () => {
    expect(forumNewDiscussionHref(new URLSearchParams("community=research-methodology&type=PAPER_DISCUSSION&page=3&feed=popular&q=abc"))).toBe("/forum/new?category=research-methodology&type=PAPER_DISCUSSION");
    expect(forumNewDiscussionHref(new URLSearchParams("type=PAPER_DISCUSSION&paper=paper&page=2"))).toBe("/forum/new?type=PAPER_DISCUSSION&paper=paper");
    expect(forumNewDiscussionHref(new URLSearchParams("type=invalid"))).toBe("/forum/new");
    expect(forumInitialDiscussionType(new URLSearchParams("type=DISCUSSION"))).toBe("DISCUSSION");
    expect(forumInitialDiscussionType(new URLSearchParams("type=invalid"))).toBe("QUESTION");
  });

  it("uses one shared Forum shell with progressive actions and a real Markdown preview", () => {
    const markup = render();
    expect(markup).toContain("forum-workspace");
    expect(markup).toContain('aria-label="More formatting"');
    expect(markup).not.toContain("Link research context");
    expect(markup).toContain('aria-label="Tags"');
    expect(markup).toContain("Up to 5 tags");
    expect(markup).toContain(">Preview</button>");
    expect(markup).toContain('aria-label="Formatting"');
    expect(markup).toContain('for="discussion-title"');
    expect(markup).toContain('aria-label="Discussion body"');
    expect(markup).not.toContain("<main");
    expect(markup).not.toContain("rounded-3xl");
    expect(markup).toContain("forum-compose-tabs flex");
    expect(markup).not.toContain('id="discussion-type-source"');
    expect(markup).not.toContain("Linked Project");
    expect(markup).not.toContain('aria-label="Paper Citation Title"');
    expect(markup).not.toContain('aria-label="DOI"');
    const select = markup.match(/<select aria-label="Category"[^>]*>(.*?)<\/select>/)?.[1];
    expect(select).toContain('value="joined"');
    expect(select).not.toContain('value="pending"');
  });

  it("exposes required research fields immediately for paper/gap discussions", () => {
    const paper = render("/forum/new?type=PAPER_DISCUSSION");
    expect(paper).toContain('id="discussion-type-source"');
    expect(paper).toContain('aria-label="Linked Paper"');
    expect(paper).toContain('required=""');
    expect(paper).not.toContain('aria-label="Candidate Research Gap"');
    expect(paper).not.toContain("Linked Project");
    const gap = render("/forum/new?type=RESEARCH_GAP_DISCUSSION");
    expect(gap).toContain('aria-label="Candidate Research Gap"');
    expect(gap).toContain('required=""');
    expect(gap).not.toContain('aria-label="Linked Paper"');
    expect(gap).not.toContain("Linked Project");
    const discussion = render("/forum/new?type=DISCUSSION");
    expect(discussion).not.toContain('id="discussion-type-source"');
    expect(discussion).not.toContain("Advanced project context");
  });

  it("shows honest loading/retry states and disables the form while publishing", () => {
    state.loading = true;
    expect(render()).toContain("Loading categories");
    expect(render()).not.toContain("You need to join a research community before posting.");
    state.loading = false; state.error = true;
    expect(render()).toContain("Could not load categories.");
    state.error = false; state.pending = true;
    expect(render()).toContain('<fieldset disabled=""');
    expect(render()).toContain("Publishing…");
  });

  it("keeps preview optional instead of permanently splitting the editor", () => {
    const css = readFileSync(new URL("../../../theme/globals.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.forum-compose\s*\{\s*container: forum-compose \/ inline-size;/);
    expect(css).toMatch(/\.forum-compose-tabs\s*\{\s*display: flex;/);
    expect(css).not.toMatch(/\.forum-compose-editor[^{}]*\{[^}]*grid-template-columns/);
  });

  it("formats selected text without discarding the rest of the draft", () => {
    expect(insertForumMarkdown("one two three", 4, 7, "**", "**", "text")).toEqual({ content: "one **two** three", selectionStart: 6, selectionEnd: 9 });
    expect(insertForumMarkdown("", 0, 0, "- ", "", "nội dung").content).toBe("- nội dung");
  });

  it("adds academic formatting snippets without accepting raw HTML", () => {
    expect(formatForumMarkdown("", 0, 0, "table", "text").content).toContain("| Title | References | Notes |");
    expect(formatForumMarkdown("", 0, 0, "footnote", "text").content).toContain("[^1]: text");
    expect(formatForumMarkdown("", 0, 0, "callout", "text").content).toContain("> **Note**");
    expect(formatForumMarkdown("", 0, 0, "details", "text").content).toContain(':::details{summary="Details"}');
    expect(formatForumMarkdown("", 0, 0, "strikethrough", "text").content).toBe("~~text~~");
    expect(formatForumMarkdown("", 0, 0, "divider", "text").content).toBe("---");
    expect(formatForumMarkdown("", 0, 0, "quote-post", "text", { quoteSource: "A post" }).content).toContain("> A post");
    expect(formatForumMarkdown("A | B\nC", 0, 7, "table", "text").content).toContain("A \\| B C");
    expect(formatForumMarkdown("", 0, 0, "heading-1", "text").content).toBe("# text");
    expect(formatForumMarkdown("", 0, 0, "heading-4", "text").content).toBe("#### text");
    expect(formatForumMarkdown("", 0, 0, "paragraph", "text").content).toBe("text");
    expect(formatForumMarkdown("", 0, 0, "small", "text").content).toContain(":small[text]");
    expect(formatForumMarkdown("", 0, 0, "spoiler", "text").content).toContain(":spoiler[text]");
    expect(formatForumMarkdown("", 0, 0, "wrap", "text").content).toContain(':::wrap{type="note"}');
    expect(formatForumMarkdown("", 0, 0, "image", "text", { image: { url: "https://example.org/figure.png", alt: "Study figure" } }).content).toContain("![Study figure](https://example.org/figure.png)");
    expect(formatForumMarkdown("", 0, 0, "image", "text", { image: { url: "javascript:alert(1)", alt: "unsafe" } }).content).toBe("");
    expect(formatForumMarkdown("", 0, 0, "math", "text", { math: "E = mc^2" }).content).toBe("$$E = mc^2$$");
    const configured = formatForumMarkdown("", 0, 0, "table", "text", { table: { rows: 3, columns: 2, includeHeader: true, headers: ["Method", "Result"] } }).content;
    expect(configured).toContain("| Method | Result |");
    expect(configured.split("\n").filter((line) => line.startsWith("| ")).length).toBe(5);
  });

  it("renders safe forum shortcodes, image URLs, details and spoilers as UI", () => {
    const content = `:::details{summary="Details"}
Hidden methods.
:::

:spoiler[Sensitive result]

:small[caption] $$x^2$$

:::wrap{type="note"}
long_identifier
:::

![Figure](https://example.org/figure.png)`;
    const markup = renderToStaticMarkup(<ForumMarkdown content={content} />);
    expect(markup).toContain("<details");
    expect(markup).toContain("forum-spoiler");
    expect(markup).toContain("forum-small");
    expect(markup).toContain("forum-math");
    expect(markup).toContain("forum-wrap");
    expect(markup).toContain('src="https://example.org/figure.png"');
    expect(renderToStaticMarkup(<ForumMarkdown content={'![bad](javascript:alert(1))'} />)).not.toContain("javascript:");
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
    expect(result).toEqual({ input: { type: "QUESTION", communityId: "joined", title: "A research question", content: "Evidence and methods.", tags: ["methods", "evidence"], linkedPaperId: undefined, linkedResearchGapId: undefined, references: [] } });
  });
  it("requires an active category and valid title/body without membership", () => {
    expect(buildForumDiscussionInput(draft, [], [])).toHaveProperty("error");
    for (const change of [{ title: "ab" }, { title: "a".repeat(241) }, { content: " " }, { content: "a".repeat(20001) }, { tags: "a".repeat(81) }, { tags: Array.from({ length: 6 }, (_, i) => `tag${i}`).join(",") }]) expect(buildForumDiscussionInput({ ...draft, ...change }, [joined], [])).toHaveProperty("error");
  });
  it("retains required papers and gap-sharing checks without making private gaps public automatically", () => {
    expect(buildForumDiscussionInput({ ...draft, type: "PAPER_DISCUSSION" }, [joined], [])).toHaveProperty("error");
    expect(buildForumDiscussionInput({ ...draft, type: "RESEARCH_GAP_DISCUSSION", linkedGapId: "gap" }, [joined], [{ id: "gap", forumShareable: false }])).toHaveProperty("error");
    expect(buildForumDiscussionInput({ ...draft, type: "RESEARCH_GAP_DISCUSSION", linkedGapId: "gap" }, [joined], [{ id: "gap", forumShareable: true }])).toHaveProperty("input.linkedResearchGapId", "gap");
  });
  it("sends attached indexed papers as ForumReferences without creating gap evidence", () => {
    const result = buildForumDiscussionInput({ ...draft, content: 'Evidence :cite[]{paperId="11111111-1111-4111-8111-111111111111"}.', references: [{ paperId: "11111111-1111-4111-8111-111111111111", doi: "10.1145/abc", title: "Study", year: 2025, verified: true }] }, [joined], []);
    expect(result).toHaveProperty("input.references", [{ paperId: "11111111-1111-4111-8111-111111111111", doi: "10.1145/abc", title: "Study", year: 2025, authors: undefined, url: undefined }]);
    expect(buildForumDiscussionInput({ ...draft, references: [{ doi: "10.1145/abc" }] }, [joined], [])).toHaveProperty("error");
  });
  it("excludes hidden Paper/Gap links and legacy project context while keeping citations independent", () => {
    const legacy = { ...draft, linkedPaperId: "paper", linkedGapId: "private-gap", linkedProjectId: "old-project" };
    const question = buildForumDiscussionInput(legacy, [joined], []);
    expect(question).toHaveProperty("input.linkedPaperId", undefined);
    expect(question).toHaveProperty("input.linkedResearchGapId", undefined);
    expect(question).not.toHaveProperty("input.linkedProjectId");
    const paper = buildForumDiscussionInput({ ...legacy, type: "PAPER_DISCUSSION" }, [joined], []);
    expect(paper).toHaveProperty("input.linkedPaperId", "paper");
    expect(paper).toHaveProperty("input.linkedResearchGapId", undefined);
    const gap = buildForumDiscussionInput({ ...legacy, type: "RESEARCH_GAP_DISCUSSION", linkedGapId: "gap" }, [joined], [{ id: "gap", forumShareable: true }]);
    expect(gap).toHaveProperty("input.linkedPaperId", undefined);
    expect(gap).toHaveProperty("input.linkedResearchGapId", "gap");
    expect(buildForumDiscussionInput({ ...draft, tags: "one,two,three,four,five,ONE" }, [joined], [])).toHaveProperty("input.tags", ["one", "two", "three", "four", "five"]);
  });
});
