import { forumCitationPaperIds, orderForumReferences } from "@trend/shared-types";
import type { ForumPostType } from "@trend/shared-types";
import type { ForumPostInput, ForumReferenceView } from "../api/forum.api";
import { safeForumImageUrl } from "./forum-formatting";

const types: ForumPostType[] = ["QUESTION", "DISCUSSION", "PAPER_DISCUSSION", "RESEARCH_GAP_DISCUSSION"];

export function forumNewDiscussionHref(params: URLSearchParams) {
  const next = new URLSearchParams();
  const community = params.get("category") ?? params.get("community");
  const type = params.get("type") as ForumPostType;
  if (community) next.set("category", community);
  if (types.includes(type)) next.set("type", type);
  for (const key of ["paper", "gap"] as const) {
    const value = params.get(key);
    if (value) next.set(key, value);
  }
  const query = next.toString();
  return `/forum/new${query ? `?${query}` : ""}`;
}

export function forumInitialDiscussionType(params: URLSearchParams): ForumPostType {
  const type = params.get("type") as ForumPostType;
  return types.includes(type) ? type : params.get("gap") ? "RESEARCH_GAP_DISCUSSION" : params.get("paper") ? "PAPER_DISCUSSION" : "QUESTION";
}

export function insertForumMarkdown(content: string, start: number, end: number, prefix: string, suffix: string, placeholder: string) {
  const selected = content.slice(start, end) || placeholder;
  return {
    content: content.slice(0, start) + prefix + selected + suffix + content.slice(end),
    selectionStart: start + prefix.length,
    selectionEnd: start + prefix.length + selected.length,
  };
}

export type ForumMarkdownAction =
  | "bold"
  | "italic"
  | "heading"
  | "heading-1"
  | "heading-2"
  | "heading-3"
  | "heading-4"
  | "paragraph"
  | "small"
  | "link"
  | "quote"
  | "bullet"
  | "numbered"
  | "code"
  | "code-block"
  | "table"
  | "date"
  | "citation"
  | "footnote"
  | "callout"
  | "details"
  | "spoiler"
  | "wrap"
  | "image"
  | "math"
  | "checklist"
  | "strikethrough"
  | "divider"
  | "quote-post";

export type ForumTableConfig = {
  rows: number;
  columns: number;
  includeHeader: boolean;
  headers?: string[];
  cells?: string[][];
};

export interface ForumMarkdownOptions {
  now?: Date;
  quoteSource?: string;
  tableHeaders?: [string, string, string];
  noteLabel?: string;
  detailsLabel?: string;
  table?: ForumTableConfig;
  image?: { url: string; alt: string };
  math?: string;
}

export function forumMarkdownShortcut(event: { key: string; code?: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; isComposing: boolean }): ForumMarkdownAction | undefined {
  if (event.isComposing || !(event.ctrlKey || event.metaKey) || event.altKey) return;
  if (event.shiftKey) return event.code === "Period" || event.key === ">" ? "date" : undefined;
  return ({ b: "bold", i: "italic", k: "link" } as const)[event.key.toLowerCase() as "b" | "i" | "k"];
}

export function formatForumMarkdown(content: string, start: number, end: number, action: ForumMarkdownAction, placeholder: string, options: ForumMarkdownOptions = {}) {
  const wrappers = { bold: ["**", "**"], italic: ["_", "_"], link: ["[", "](https://)"], code: ["`", "`"], strikethrough: ["~~", "~~"] } as const;
  if (action in wrappers) {
    const [prefix, suffix] = wrappers[action as keyof typeof wrappers];
    return insertForumMarkdown(content, start, end, prefix, suffix, placeholder);
  }

  const insertSnippet = (snippet: string, selectionStart: number, selectionEnd: number) => ({
    content: content.slice(0, start) + snippet + content.slice(end),
    selectionStart: start + selectionStart,
    selectionEnd: start + selectionEnd,
  });
  const insertBlock = (snippet: string, selectionStart: number, selectionEnd: number) => {
    const before = content.slice(0, start);
    const after = content.slice(end);
    const prefix = before && !before.endsWith("\n\n") ? before.endsWith("\n") ? "\n" : "\n\n" : "";
    const suffix = after && !after.startsWith("\n\n") ? after.startsWith("\n") ? "\n" : "\n\n" : "";
    return insertSnippet(prefix + snippet + suffix, prefix.length + selectionStart, prefix.length + selectionEnd);
  };
  if (action === "date") {
    const timestamp = (options.now ?? new Date()).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
    return insertSnippet(timestamp, timestamp.length, timestamp.length);
  }
  if (action === "image") {
    const image = options.image;
    if (!image?.url.trim()) return insertSnippet("", 0, 0);
    const safeUrl = safeForumImageUrl(image.url);
    if (!safeUrl) return insertSnippet("", 0, 0);
    const alt = image.alt.trim().replaceAll("[", "").replaceAll("]", "") || "Image";
    const url = safeUrl.replace(/[()]/g, (character) => encodeURIComponent(character));
    const snippet = `![${alt}](${url})`;
    return insertBlock(snippet, snippet.length, snippet.length);
  }
  if (action === "math") {
    const expression = options.math?.trim() || placeholder;
    const snippet = `$$${expression}$$`;
    return insertSnippet(snippet, snippet.length, snippet.length);
  }
  if (action === "table") {
    const config = options.table ?? { rows: 2, columns: 3, includeHeader: true };
    const columns = Math.max(1, Math.min(8, Math.round(config.columns)));
    const rows = Math.max(1, Math.min(20, Math.round(config.rows)));
    const cell = (value: string) => value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
    const defaultHeaders = options.tableHeaders ?? ["Title", "References", "Notes"];
    const headers = Array.from({ length: columns }, (_, index) => cell(config.headers?.[index] || defaultHeaders[index] || `Column ${index + 1}`));
    const firstCell = cell(content.slice(start, end) || placeholder);
    const dataRows = Array.from({ length: rows }, (_, row) => Array.from({ length: columns }, (_, column) => config.cells ? cell(config.cells[row]?.[column] ?? "") : row === 0 && column === 0 ? firstCell : ""));
    const headerRow = `| ${headers.join(" | ")} |\n| ${headers.map(() => "---").join(" | ")} |\n`;
    const body = dataRows.map((row) => `| ${row.join(" | ")} |`).join("\n");
    const snippet = `${config.includeHeader ? headerRow : `| ${headers.map(() => "").join(" | ")} |\n| ${headers.map(() => "---").join(" | ")} |\n`}${body}`;
    const firstCellOffset = (config.includeHeader ? headerRow.length : headerRow.length) + 2;
    return insertBlock(snippet, firstCellOffset, firstCellOffset + firstCell.length);
  }
  if (action === "footnote") {
    const used = new Set([...content.matchAll(/\[\^(\d+)\]/g)].map((match) => Number(match[1])));
    let id = 1;
    while (used.has(id)) id++;
    const citation = `[^${id}]`;
    const main = content.slice(0, start) + content.slice(start, end) + citation + content.slice(end);
    const prefix = main.endsWith("\n\n") ? "" : main.endsWith("\n") ? "\n" : "\n\n";
    const definition = `${prefix}${citation}: `;
    const selectionStart = main.length + definition.length;
    return { content: main + definition + placeholder, selectionStart, selectionEnd: selectionStart + placeholder.length };
  }
  if (action === "callout") {
    const selected = content.slice(start, end) || placeholder;
    const prefix = `> **${options.noteLabel ?? "Note"}**\n`;
    const snippet = prefix + selected.split("\n").map((line) => "> " + line).join("\n");
    return insertBlock(snippet, prefix.length + 2, snippet.length);
  }
  if (action === "details") {
    const selected = content.slice(start, end) || placeholder;
    // Keep this in the common Markdown subset. A fenced `details` block is not
    // a standard Markdown construct and would otherwise render as raw code in
    // react-markdown rather than as a disclosure widget.
    const label = options.detailsLabel ?? "Details";
    const snippet = `:::details{summary="${label}"}\n${selected}\n:::`;
    const opening = `:::details{summary="${label}"}\n`;
    return insertBlock(snippet, opening.length, opening.length + selected.length);
  }
  if (action === "spoiler") {
    const selected = content.slice(start, end) || placeholder;
    const snippet = `:spoiler[${selected}]`;
    return insertSnippet(snippet, ":spoiler[".length, ":spoiler[".length + selected.length);
  }
  if (action === "wrap") {
    const selected = content.slice(start, end) || placeholder;
    const snippet = `:::wrap{type="note"}\n${selected}\n:::`;
    return insertBlock(snippet, ":::wrap{type=\"note\"}\n".length, ":::wrap{type=\"note\"}\n".length + selected.length);
  }
  if (action === "divider") return insertBlock("---", 3, 3);
  if (action === "quote-post") {
    const source = options.quoteSource?.trim() || placeholder;
    const snippet = source.split("\n").map((line) => "> " + line).join("\n");
    return insertBlock(snippet, snippet.length, snippet.length);
  }
  // Block formatting starts on a whole line, including a caret placed midway
  // through it. Every selected line receives its own Markdown marker.
  const lineStart = start === 0 ? 0 : content.lastIndexOf("\n", start - 1) + 1;
  const selectionEnd = end > start && content[end - 1] === "\n" ? end - 1 : end;
  const newline = content.indexOf("\n", selectionEnd);
  const lineEnd = newline === -1 ? content.length : newline;
  const selected = content.slice(lineStart, lineEnd) || placeholder;
  const before = content.slice(0, lineStart);
  const after = content.slice(lineEnd);
  if (action === "code-block") {
    const fence = "`".repeat(Math.max(3, ...[...selected.matchAll(/`+/g)].map((match) => match[0].length + 1)));
    const prefix = `${fence}text\n`;
    return { content: `${before}${prefix}${selected}\n${fence}${after}`, selectionStart: lineStart + prefix.length, selectionEnd: lineStart + prefix.length + selected.length };
  }
  const headingLevel = action.startsWith("heading-") ? Number(action.slice("heading-".length)) : action === "heading" ? 2 : 0;
  const prefix = (index: number) => headingLevel ? `${"#".repeat(headingLevel)} ` : action === "quote" ? "> " : action === "numbered" ? `${index + 1}. ` : action === "checklist" ? "- [ ] " : action === "paragraph" ? "" : action === "small" ? "[small]" : "- ";
  const inlinePrefix = action === "small" ? ":small[" : "";
  const inlineSuffix = action === "small" ? "]" : "";
  const formatted = inlinePrefix ? `${inlinePrefix}${selected}${inlineSuffix}` : selected.split("\n").map((line, index) => prefix(index) + line).join("\n");
  return { content: before + formatted + after, selectionStart: lineStart, selectionEnd: lineStart + formatted.length };
}

export type ForumDiscussionDraft = {
  type: ForumPostType; communityId: string; title: string; content: string; tags: string;
  linkedPaperId: string; linkedGapId: string;
  references: ForumReferenceView[];
};

export const FORUM_DISCUSSION_TAG_LIMIT = 5;
export function forumDiscussionTags(value: string): string[] {
  const unique = new Map<string, string>();
  for (const tag of value.split(",").map((item) => item.trim()).filter(Boolean)) {
    if (!unique.has(tag.toLowerCase())) unique.set(tag.toLowerCase(), tag);
  }
  return [...unique.values()];
}

export function buildForumDiscussionInput(draft: ForumDiscussionDraft, categories: Array<{ id: string; status?: string }>, gaps: Array<{ id: string; forumShareable: boolean }>): { input: ForumPostInput } | { error: string } {
  if (!categories.some((category) => category.id === draft.communityId && (!category.status || category.status === "ACTIVE"))) return { error: "Select an active forum category." };
  const title = draft.title.trim();
  const content = draft.content.trim();
  if (title.length < 3 || title.length > 240) return { error: "Use a discussion title between 3 and 240 characters." };
  if (!content || content.length > 20000) return { error: "Write a discussion body of up to 20,000 characters." };
  if (draft.type === "PAPER_DISCUSSION" && !draft.linkedPaperId) return { error: "Select a paper for this paper discussion." };
  if (draft.type === "RESEARCH_GAP_DISCUSSION" && !draft.linkedGapId) return { error: "Select a shareable candidate research gap." };
  if (draft.type === "RESEARCH_GAP_DISCUSSION" && !gaps.some((gap) => gap.id === draft.linkedGapId && gap.forumShareable)) return { error: "Select a shareable candidate research gap." };
  const tags = forumDiscussionTags(draft.tags);
  if (tags.length > FORUM_DISCUSSION_TAG_LIMIT || tags.some((tag) => tag.length > 80)) return { error: "Use up to 5 tags, with no more than 80 characters each." };
  if (draft.references.some((reference) => !reference.paperId && (!reference.doi || !reference.title))) return { error: "Attach a paper from LumiGap before adding a citation." };
  const citedIds = new Set(forumCitationPaperIds(content));
  const references = orderForumReferences(content, draft.references.filter((reference) => reference.paperId && citedIds.has(reference.paperId.toLowerCase()))).slice(0, 30).map((reference) => ({
    paperId: reference.paperId,
    doi: reference.doi?.trim().toLowerCase(),
    url: reference.url,
    title: reference.title?.trim(),
    authors: reference.authors?.map((author) => author.trim()).filter(Boolean),
    year: reference.year,
  }));
  if (references.some((reference) => !reference.paperId && (!reference.doi || !reference.title))) return { error: "Attach a paper from LumiGap before adding a citation." };
  return { input: {
    type: draft.type, communityId: draft.communityId, title, content, tags,
    linkedPaperId: draft.type === "PAPER_DISCUSSION" ? draft.linkedPaperId : undefined,
    linkedResearchGapId: draft.type === "RESEARCH_GAP_DISCUSSION" ? draft.linkedGapId : undefined,
    references,
  } };
}
