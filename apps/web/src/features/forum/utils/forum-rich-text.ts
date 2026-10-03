import { Node, type JSONContent, type AnyExtension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown, MarkdownManager } from "@tiptap/markdown";
import { Table, TableKit } from "@tiptap/extension-table";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkDirective from "remark-directive";
import remarkMath from "remark-math";
import { Plugin, TextSelection, type Transaction } from "@tiptap/pm/state";
import type { Schema } from "@tiptap/pm/model";
import { closeHistory } from "@tiptap/pm/history";
import type { ForumTableConfig } from "./forum-discussion-editor";
import { forumFormattingExtensions } from "./forum-formatting-extensions";
import { safeForumImageUrl } from "./forum-formatting";

const footnoteId = /^[a-zA-Z0-9_-]{1,100}$/;
const safeId = (value: unknown) => typeof value === "string" && footnoteId.test(value) ? value : "1";

function escapeTablePipes(value: string) {
  let result = "", backslashes = 0;
  for (const character of value) {
    if (character === "|" && backslashes % 2 === 0) result += "\\";
    result += character;
    backslashes = character === "\\" ? backslashes + 1 : 0;
  }
  return result;
}
// GFM pipes must be escaped, including those inside inline code. Keep this
// serializer independent of version-specific table serialization behavior.
export const ForumTable = Table.extend({
  addKeyboardShortcuts() {
    const move = (direction: number) => {
      if (!this.editor.isActive("table")) return false;
      if (direction < 0) this.editor.commands.goToPreviousCell();
      else this.editor.commands.goToNextCell();
      // GFM cells cannot contain multiple paragraphs. Enter navigates like a
      // spreadsheet instead of creating a line break that would be flattened.
      return true;
    };
    return { ...this.parent?.(), Enter: () => move(1), "Shift-Enter": () => move(-1) };
  },
  renderMarkdown: (node, helpers) => {
    const rows = node.content ?? [];
    if (!rows.length) return "";
    const renderRow = (row: JSONContent) => `| ${(row.content ?? []).map((cell) => escapeTablePipes(helpers.renderChildren(cell.content ?? []).replace(/\n/g, " ").trim())).join(" | ")} |`;
    return [renderRow(rows[0]!), `| ${(rows[0]!.content ?? []).map(() => "---").join(" | ")} |`, ...rows.slice(1).map(renderRow)].join("\n");
  },
});

export const ForumFootnoteReference = Node.create<{ editLabel: string }>({
  name: "forumFootnoteReference", group: "inline", inline: true, atom: true,
  addOptions: () => ({ editLabel: "Edit footnote" }),
  addAttributes: () => ({ id: { default: "1", parseHTML: (element) => safeId(element.getAttribute("data-footnote-ref")), renderHTML: () => ({}) }, label: { default: null, rendered: false } }),
  parseHTML: () => [{ tag: "sup[data-footnote-ref]" }],
  renderHTML({ node }) { const label = node.attrs.label ?? safeId(node.attrs.id); return ["sup", { "data-footnote-ref": safeId(node.attrs.id), class: "forum-footnote-ref", tabindex: "0", role: "button", "aria-label": `${this.options.editLabel} ${label}`, title: this.options.editLabel }, `[${label}]`]; },
  markdownTokenizer: {
    name: "forumFootnoteReference", level: "inline",
    start: (src) => src.indexOf("[^"),
    tokenize: (src) => { const match = /^\[\^([a-zA-Z0-9_-]{1,100})\]/.exec(src); return match ? { type: "forumFootnoteReference", raw: match[0], id: match[1] } : undefined; },
  },
  parseMarkdown: (token) => ({ type: "forumFootnoteReference", attrs: { id: safeId(token.id) } }),
  renderMarkdown: (node) => `[^${safeId(node.attrs?.id)}]`,
});

export const ForumFootnoteDefinition = Node.create({
  name: "forumFootnoteDefinition", group: "block", content: "block+", defining: true,
  addAttributes: () => ({ id: { default: "1", parseHTML: (element) => safeId(element.getAttribute("data-footnote-definition")), renderHTML: () => ({}) }, label: { default: null, rendered: false } }),
  parseHTML: () => [{ tag: "div[data-footnote-definition]", contentElement: ".forum-footnote-content" }],
  renderHTML: ({ node }) => ["div", { "data-footnote-definition": safeId(node.attrs.id), class: "forum-footnote-definition" }, ["span", { contenteditable: "false", class: "forum-footnote-label" }, `[${node.attrs.label ?? safeId(node.attrs.id)}]`], ["div", { class: "forum-footnote-content" }, 0]],
  addProseMirrorPlugins() {
    return [new Plugin({ appendTransaction: (_transactions, _old, state) => {
      const order = new Map<string, string>();
      state.doc.descendants((node) => { if (node.type.name === "forumFootnoteReference" && !order.has(node.attrs.id)) order.set(node.attrs.id, String(order.size + 1)); });
      const transaction = state.tr;
      state.doc.descendants((node, position) => { if (node.type.name.startsWith("forumFootnote")) { const label = order.get(node.attrs.id) ?? node.attrs.id; if (label !== node.attrs.label) transaction.setNodeMarkup(position, undefined, { ...node.attrs, label }); } });
      return transaction.docChanged ? transaction : null;
    } })];
  },
  markdownTokenizer: {
    name: "forumFootnoteDefinition", level: "block",
    start: (src) => src.search(/^\[\^[a-zA-Z0-9_-]{1,100}\]:/m),
    tokenize: (src, _tokens, lexer) => {
      const match = /^\[\^([a-zA-Z0-9_-]{1,100})\]:[^\S\n]*([^\n]*)(?:\n(?: {4}|\t)[^\n]*)*/.exec(src);
      if (!match) return;
      const text = match[0].replace(/^\[\^[^\]]+\]:[^\S\n]*/, "").replace(/\n(?: {4}|\t)/g, "\n");
      return { type: "forumFootnoteDefinition", raw: match[0], id: match[1], tokens: lexer.blockTokens(text || " ") };
    },
  },
  parseMarkdown: (token, helpers) => ({ type: "forumFootnoteDefinition", attrs: { id: safeId(token.id) }, content: helpers.parseChildren(token.tokens ?? []).length ? helpers.parseChildren(token.tokens ?? []) : [{ type: "paragraph" }] }),
  renderMarkdown: (node, helpers) => `[^${safeId(node.attrs?.id)}]: ${helpers.renderChildren(node.content ?? []).replace(/\n/g, "\n    ")}`,
});

export function forumRichTextExtensions(editFootnoteLabel = "Edit footnote"): AnyExtension[] {
  return [
    StarterKit.configure({ underline: false, link: { openOnClick: false, autolink: false, linkOnPaste: false, protocols: ["http", "https", "mailto"] } }),
    TableKit.configure({ table: false }), ForumTable.configure({ resizable: false, renderWrapper: true, cellMinWidth: 100 }),
    TaskList, TaskItem.configure({ nested: true }),
    ForumFootnoteReference.configure({ editLabel: editFootnoteLabel }), ForumFootnoteDefinition, ...forumFormattingExtensions, Markdown,
  ];
}

const semanticParser = unified().use(remarkParse).use(remarkGfm).use(remarkDirective).use(remarkMath, { singleDollarTextMath: false });
function semantics(markdown: string) {
  return JSON.stringify(semanticParser.parse(markdown), (key, value) => key === "position" || key === "data" ? undefined : value);
}
/** Never silently discard unsupported content in an existing Markdown draft. */
export function canUseForumVisualEditor(markdown: string, manager: Pick<MarkdownManager, "parse" | "serialize">, maxLength = Infinity) {
  try {
    const tree = semanticParser.parse(markdown);
    // Raw HTML and unsafe images stay in source mode, never in an HTML parser.
    const unsupported = (node: { type: string; url?: string; children?: unknown[] }): boolean => node.type === "html" || (node.type === "image" && !safeForumImageUrl(node.url)) || Boolean(node.children?.some((child) => unsupported(child as typeof node)));
    if (unsupported(tree)) return false;
    const serialized = manager.serialize(manager.parse(markdown));
    return serialized.length <= maxLength && semantics(markdown) === semantics(serialized);
  } catch { return false; }
}

export function forumTableDocument(config: ForumTableConfig, original?: JSONContent): JSONContent {
  const columns = Math.max(1, Math.min(Math.max(8, original?.content?.[0]?.content?.length ?? 0), Math.round(config.columns)));
  const rows = Math.max(1, Math.min(Math.max(20, (original?.content?.length ?? 1) - 1), Math.round(config.rows)));
  const cell = (value: string, header: boolean): JSONContent => ({ type: header ? "tableHeader" : "tableCell", content: [{ type: "paragraph", content: value ? [{ type: "text", text: value.replace(/\r?\n/g, " ") }] : [] }] });
  // GFM requires a header row. An intentionally empty one preserves no-header tables.
  const table: JSONContent = { type: "table", content: [
    { type: "tableRow", content: Array.from({ length: columns }, (_, column) => cell(config.includeHeader ? config.headers?.[column] ?? `Column ${column + 1}` : "", true)) },
    ...Array.from({ length: rows }, (_, row) => ({ type: "tableRow", content: Array.from({ length: columns }, (_, column) => cell(config.cells?.[row]?.[column] ?? "", false)) })),
  ] };
  const text = (node: JSONContent): string => node.text ?? node.content?.map(text).join("") ?? "";
  // Resizing a table must not strip marks/footnotes from untouched cells.
  table.content?.forEach((row, rowIndex) => row.content?.forEach((next, columnIndex) => {
    const previous = original?.content?.[rowIndex]?.content?.[columnIndex];
    if (previous && text(previous) === text(next)) row.content![columnIndex] = previous;
  }));
  return table;
}

export function nextForumFootnoteId(doc: JSONContent) {
  const used = new Set<string>();
  const visit = (node: JSONContent) => { if (node.type?.startsWith("forumFootnote")) used.add(String(node.attrs?.id)); node.content?.forEach(visit); };
  visit(doc); let id = 1; while (used.has(String(id))) id++;
  return String(id);
}

export function writeForumFootnote(transaction: Transaction, schema: Schema, text: string, id?: string) {
  const paragraph = schema.nodes.paragraph, definition = schema.nodes.forumFootnoteDefinition, reference = schema.nodes.forumFootnoteReference;
  if (!paragraph || !definition || !reference || !text.trim()) return false;
  closeHistory(transaction);
  const noteId = id ?? nextForumFootnoteId(transaction.doc.toJSON());
  const item = definition.create({ id: noteId }, paragraph.create(null, schema.text(text.trim())));
  if (id) {
    let target: { from: number; to: number } | undefined;
    let unchanged = false;
    transaction.doc.descendants((node, position) => { if (!target && node.type.name === "forumFootnoteDefinition" && node.attrs.id === noteId) { target = { from: position, to: position + node.nodeSize }; unchanged = node.textContent === text.trim(); } });
    if (unchanged) return true;
    if (target) transaction.replaceWith(target.from, target.to, item); else transaction.insert(transaction.doc.content.size, item);
  } else {
    if (!transaction.selection.$to.parent.inlineContent) return false;
    const position = transaction.selection.to;
    // Attach a note after highlighted text, never replace the selected words.
    transaction.insert(position, reference.create({ id: noteId }));
    transaction.setSelection(TextSelection.create(transaction.doc, position + 1));
    transaction.insert(transaction.doc.content.size, item);
  }
  return true;
}

export function removeForumFootnote(transaction: Transaction, id: string) {
  closeHistory(transaction);
  const ranges: Array<{ from: number; to: number }> = [];
  transaction.doc.descendants((node, position) => { if (node.type.name.startsWith("forumFootnote") && node.attrs.id === id) { ranges.push({ from: position, to: position + node.nodeSize }); return false; } });
  for (const range of ranges.reverse()) transaction.delete(range.from, range.to);
  return true;
}
