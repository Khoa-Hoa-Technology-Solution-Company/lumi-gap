import type { ForumPostType } from "@trend/shared-types";
import type { CommunityView, ForumPostInput, ForumReferenceView } from "../api/forum.api";

const types: ForumPostType[] = ["QUESTION", "DISCUSSION", "PAPER_DISCUSSION", "RESEARCH_GAP_DISCUSSION"];

export function forumNewDiscussionHref(params: URLSearchParams) {
  const next = new URLSearchParams();
  const community = params.get("community");
  const type = params.get("type") as ForumPostType;
  if (community) next.set("community", community);
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
  return types.includes(type) ? type : "QUESTION";
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
  | "link"
  | "quote"
  | "bullet"
  | "numbered"
  | "code"
  | "code-block"
  | "table"
  | "date"
  | "footnote"
  | "callout"
  | "details"
  | "checklist"
  | "strikethrough"
  | "divider"
  | "quote-post";

export interface ForumMarkdownOptions {
  now?: Date;
  quoteSource?: string;
  tableHeaders?: [string, string, string];
  noteLabel?: string;
  detailsLabel?: string;
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
  if (action === "table") {
    const headers = options.tableHeaders ?? ["Title", "References", "Notes"];
    const cell = (value: string) => value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
    const selected = cell(content.slice(start, end) || placeholder);
    const header = `| ${headers.map(cell).join(" | ")} |\n| --- | --- | --- |\n`;
    const snippet = `${header}| ${selected} |  |  |`;
    return insertBlock(snippet, header.length + 2, header.length + 2 + selected.length);
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
    const prefix = `> **${label}**\n`;
    const snippet = prefix + selected.split("\n").map((line) => "> " + line).join("\n");
    return insertBlock(snippet, prefix.length + 2, snippet.length);
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
  const prefix = (index: number) => action === "heading" ? "## " : action === "quote" ? "> " : action === "numbered" ? `${index + 1}. ` : action === "checklist" ? "- [ ] " : "- ";
  const formatted = selected.split("\n").map((line, index) => prefix(index) + line).join("\n");
  return { content: before + formatted + after, selectionStart: lineStart, selectionEnd: lineStart + formatted.length };
}

export type ForumDiscussionDraft = {
  type: ForumPostType; communityId: string; title: string; content: string; tags: string;
  linkedPaperId: string; linkedGapId: string; linkedProjectId: string;
  references: ForumReferenceView[];
};

export function buildForumDiscussionInput(draft: ForumDiscussionDraft, joined: CommunityView[], gaps: Array<{ id: string; forumShareable: boolean }>): { input: ForumPostInput } | { error: string } {
  if (!joined.some((community) => community.id === draft.communityId)) return { error: "Join a community before starting a discussion." };
  const title = draft.title.trim();
  const content = draft.content.trim();
  if (title.length < 3 || title.length > 240) return { error: "Use a discussion title between 3 and 240 characters." };
  if (!content || content.length > 20000) return { error: "Write a discussion body of up to 20,000 characters." };
  if (draft.type === "PAPER_DISCUSSION" && !draft.linkedPaperId) return { error: "Select a paper for this paper discussion." };
  if (draft.type === "RESEARCH_GAP_DISCUSSION" && !draft.linkedGapId) return { error: "Select a shareable candidate research gap." };
  if (draft.linkedGapId && !gaps.some((gap) => gap.id === draft.linkedGapId && gap.forumShareable)) return { error: "Select a shareable candidate research gap." };
  const tags = [...new Set(draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean))];
  if (tags.length > 12 || tags.some((tag) => tag.length > 80)) return { error: "Use up to 12 tags, with no more than 80 characters each." };
  const references = draft.references.slice(0, 30).map((reference) => ({
    paperId: reference.paperId,
    doi: reference.doi?.trim().toLowerCase(),
    url: reference.url,
    title: reference.title?.trim(),
    authors: reference.authors?.map((author) => author.trim()).filter(Boolean),
    year: reference.year,
    verified: reference.verified,
  }));
  if (references.some((reference) => !reference.paperId && (!reference.doi || !reference.title))) return { error: "Attach a paper from LumiGap before adding a citation." };
  return { input: {
    type: draft.type, communityId: draft.communityId, title, content, tags,
    linkedPaperId: draft.linkedPaperId || undefined,
    linkedResearchGapId: draft.linkedGapId || undefined,
    linkedProjectId: draft.linkedProjectId || undefined,
    references,
  } };
}
