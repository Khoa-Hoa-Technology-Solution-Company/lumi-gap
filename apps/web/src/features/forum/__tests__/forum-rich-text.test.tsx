// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { canUseForumVisualEditor, forumRichTextExtensions, forumTableDocument, nextForumFootnoteId, writeForumFootnote, removeForumFootnote } from "../utils/forum-rich-text";
import { ForumMarkdown } from "../components/forum-markdown";
import { ForumBodyEditor } from "../components/forum-body-editor";
import { formatForumMarkdown } from "../utils/forum-discussion-editor";

vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key, language: "en" }) }));
const create = (content = "") => new Editor({ extensions: forumRichTextExtensions(), content, contentType: "markdown" });

describe("Visual forum tables and footnotes", () => {
  it("uses editable table cells, not a code snippet, and preserves populated cells through Markdown", () => {
    const editor = create();
    const table = forumTableDocument({ rows: 2, columns: 2, includeHeader: true, headers: ["Method", "Result"], cells: [["Review", "12 studies"], ["Survey", "A | B"]] });
    editor.commands.insertContent([table, { type: "paragraph" }]);
    const markdown = editor.getMarkdown();
    expect(editor.getHTML()).toContain("<table");
    expect(markdown).toContain("Review");
    editor.commands.setContent(markdown, { contentType: "markdown" });
    expect(editor.state.doc.textContent).toContain("A | B");
    expect(editor.state.doc.textContent).toContain("12 studies");
    expect(canUseForumVisualEditor(markdown, editor.markdown!)).toBe(true);
    editor.destroy();
  });
  it("round-trips the requested native formatting nodes without raw code blocks", () => {
    const markdown = `# Heading\n\n:small[Caption] and :spoiler[hidden result]\n\n:::details{summary="Methods"}\nRead the method details.\n:::\n\n:::wrap{type="note"}\nA wrapped note.\n:::\n\n![Figure](https://example.org/figure.png) $$x^2$$`;
    const editor = create(markdown);
    const html = editor.getHTML();
    expect(html).toContain('data-forum-details');
    expect(html).toContain('data-forum-wrap="note"');
    expect(html).toContain('data-forum-small');
    expect(html).toContain('data-forum-spoiler');
    expect(html).toContain('class="forum-image"');
    expect(html).toContain('data-forum-math="inline"');
    const serialized = editor.getMarkdown();
    expect(serialized).toContain(":small[Caption]");
    expect(serialized).toContain(":spoiler[hidden result]");
    expect(serialized).toContain(':::details{summary="Methods"}');
    expect(serialized).toContain(':::wrap{type="note"}');
    expect(serialized).toContain("![Figure](<https://example.org/figure.png>)");
    expect(serialized).toContain("$$x^2$$");
    expect(serialized).not.toContain("```");
    editor.destroy();
  });
  it("preserves structured footnote references, definitions, numbering and formatted content", () => {
    const markdown = "A research claim[^1] and context[^3].\n\n[^1]: **Supporting note** with [source](https://example.org).\n[^3]: A limitation.";
    const editor = create(markdown);
    expect(editor.getHTML()).toContain('data-footnote-ref="1"');
    expect(editor.getHTML()).toContain('data-footnote-definition="3"');
    expect(editor.getHTML()).not.toContain("[^1]");
    expect(nextForumFootnoteId(editor.getJSON())).toBe("2");
    expect(editor.getMarkdown()).toContain("[^1]: **Supporting note**");
    expect(canUseForumVisualEditor(markdown, editor.markdown!)).toBe(true);
    editor.destroy();
  });
  it("keeps code examples literal instead of interpreting their footnotes/tables", () => {
    const markdown = "```text\n[^1]: Not a note\n| A | B |\n| --- | --- |\n```";
    const editor = create(markdown);
    expect(editor.getJSON().content?.[0]?.type).toBe("codeBlock");
    expect(editor.getHTML()).not.toContain('data-footnote-ref=');
    expect(canUseForumVisualEditor(markdown, editor.markdown!)).toBe(true);
    editor.destroy();
  });
  it("renders clickable published footnotes without raw syntax, unsafe HTML or unsafe links", () => {
    const markup = renderToStaticMarkup(<ForumMarkdown content={'Claim[^1].\n\n[^1]: Context.\n\n<script>alert(1)</script>\n\n[unsafe](javascript:alert(1))'} />);
    expect(markup).toContain("data-footnote-ref");
    expect(markup).toContain("data-footnotes");
    const target = /href="#([^"]+fn-1)"/.exec(markup)?.[1];
    expect(target).toBeTruthy();
    expect(markup).toContain(`id="${target}"`);
    expect(markup).not.toContain("[^1]");
    expect(markup).not.toContain("<script>");
    expect(markup).not.toContain('href="javascript:');
  });
  it("keeps unsafe HTML/images in Markdown mode while allowing safe HTTPS images in visual mode", () => {
    const editor = create();
    const parse = vi.spyOn(editor.markdown!, "parse");
    expect(canUseForumVisualEditor('<img src="x" onerror="alert(1)">', editor.markdown!)).toBe(false);
    expect(parse).not.toHaveBeenCalled();
    expect(canUseForumVisualEditor("![figure](https://example.org/a.png)", editor.markdown!)).toBe(true);
    const safeImageEditor = create("![figure](https://example.org/a.png)");
    expect(safeImageEditor.getHTML()).toContain('class="forum-image"');
    safeImageEditor.destroy();
    editor.destroy();
  });
  it("keeps footnote IDs and accessible labels unique across posts on a thread", () => {
    const content = "Claim[^1].\n\n[^1]: Context.";
    const markup = renderToStaticMarkup(<><ForumMarkdown content={content} /><ForumMarkdown content={content} /></>);
    const ids = [...markup.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const match of markup.matchAll(/aria-describedby="([^"]+)"/g)) expect(ids).toContain(match[1]);
  });
  it("the Markdown fallback also inserts the table builder's actual cell values", () => {
    const markdown = formatForumMarkdown("", 0, 0, "table", "text", { table: { rows: 1, columns: 2, includeHeader: true, headers: ["Method", "Result"], cells: [["Review", "Finding"]] } }).content;
    expect(markdown).toContain("| Review | Finding |");
    expect(markdown).not.toContain("| text |");
  });
  it("attaches notes to highlighted text without deleting it; editing/removal is undoable", () => {
    const editor = create("Research claim and context.");
    editor.commands.setTextSelection({ from: 1, to: 15 });
    editor.commands.command(({ tr, state }) => writeForumFootnote(tr, state.schema, "Qualification."));
    expect(editor.getMarkdown()).toContain("Research claim[^1] and context.");
    editor.commands.command(({ tr, state }) => writeForumFootnote(tr, state.schema, "Revised qualification.", "1"));
    expect(editor.getMarkdown()).toContain("[^1]: Revised qualification.");
    expect(editor.getMarkdown()).not.toContain("[^2]");
    editor.commands.command(({ tr }) => removeForumFootnote(tr, "1"));
    expect(editor.getMarkdown().trim()).toBe("Research claim and context.");
    editor.commands.undo();
    expect(editor.getMarkdown()).toContain("[^1]");
    editor.destroy();
  });
  it("renumbers visible notes by appearance without losing their stable source IDs", () => {
    const editor = create("First[^9], second[^3].\n\n[^9]: First note.\n[^3]: Second note.");
    editor.view.dispatch(editor.state.tr);
    expect(editor.getHTML()).toContain('aria-label="Edit footnote 1"');
    expect(editor.getHTML()).toContain('aria-label="Edit footnote 2"');
    expect(editor.getMarkdown()).toContain("[^9]");
    expect(editor.getMarkdown()).toContain("[^3]");
    expect(editor.getHTML()).toContain('tabindex="0"');
    editor.destroy();
  });
  it("does not strip existing note formatting when the text form is saved unchanged", () => {
    const editor = create("Claim[^1].\n\n[^1]: **Important** [source](https://example.org).");
    editor.commands.command(({ tr, state }) => writeForumFootnote(tr, state.schema, "Important source.", "1"));
    expect(editor.getMarkdown()).toContain("**Important** [source](https://example.org).");
    editor.destroy();
  });
  it("keeps formatting in untouched cells when editing/resizing an existing table", () => {
    const editor = create("| Method | Result |\n| --- | --- |\n| **Review** | 12 |\n");
    const original = editor.getJSON().content?.[0];
    const table = forumTableDocument({ rows: 2, columns: 2, includeHeader: true, headers: ["Method", "Result"], cells: [["Review", "13"], ["Survey", "20"]] }, original);
    editor.commands.setContent({ type: "doc", content: [table] });
    expect(editor.getMarkdown()).toContain("**Review**");
    expect(editor.getMarkdown()).toContain("13");
    expect(editor.getMarkdown()).toContain("Survey");
    editor.destroy();
  });
  it("rejects lossy visual conversion instead of dropping table alignment", () => {
    const editor = create();
    expect(canUseForumVisualEditor("| A | B |\n| :--- | ---: |\n| 1 | 2 |", editor.markdown!)).toBe(false);
    // Normalization must not make a saved draft fail the transaction limit and
    // leave an empty visual document in place of the user's original content.
    const source = "- item";
    const serializedLength = editor.markdown!.serialize(editor.markdown!.parse(source)).length;
    expect(canUseForumVisualEditor(source, editor.markdown!, serializedLength - 1)).toBe(false);
    editor.destroy();
  });
  it("never promotes footnotes to forum citations or formal research evidence", () => {
    const editor = create("A claim.");
    editor.commands.command(({ tr, state }) => writeForumFootnote(tr, state.schema, "A note, not extracted paper evidence."));
    const doc = editor.getJSON();
    expect(JSON.stringify(doc)).not.toMatch(/paperId|GapEvidence|SUPPORTING|COUNTER/);
    editor.destroy();
  });
  it("keeps HTML-like and Markdown-like text entered through forms literal after reopening", () => {
    const editor = create("A claim.");
    const literal = '<img src="x" onerror="alert(1)"> **not bold** [^9]';
    editor.commands.insertContent(forumTableDocument({ rows: 1, columns: 1, includeHeader: true, headers: ["Context"], cells: [[literal]] }));
    editor.commands.setTextSelection(2);
    editor.commands.command(({ tr, state }) => writeForumFootnote(tr, state.schema, literal));
    const markdown = editor.getMarkdown();
    expect(canUseForumVisualEditor(markdown, editor.markdown!)).toBe(true);
    editor.commands.setContent(markdown, { contentType: "markdown" });
    expect(editor.state.doc.textContent).toContain(literal);
    expect(editor.getHTML()).not.toContain('<img');
    editor.destroy();
  });
  it("hydrates a saved rich draft without clearing it and keeps contents across editor modes", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const saved = "Claim[^1].\n\n| Method | Result |\n| --- | --- |\n| Review | 12 |\n\n[^1]: A qualification.";
    const changes = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    function Draft() {
      const [value, setValue] = useState(saved);
      return <ForumBodyEditor label="Body" value={value} onChange={(next) => { changes(next); setValue(next); }} maxLength={20000} />;
    }
    try {
      await act(async () => { root.render(<Draft />); });
      expect(container.querySelector("table")?.textContent).toContain("Review");
      expect(container.querySelector("[data-footnote-ref]")?.textContent).toBe("[1]");
      expect(changes).not.toHaveBeenCalled();
      for (const mode of ["Markdown", "Preview", "Write"]) {
        await act(async () => { [...container.querySelectorAll("button")].find((button) => button.textContent === mode)!.click(); });
      }
      expect(container.querySelector("table")?.textContent).toContain("12");
      expect(container.querySelector("[data-footnote-definition]")?.textContent).toContain("A qualification.");
      expect(changes).not.toHaveBeenCalled();
    } finally {
      await act(async () => { root.unmount(); });
      container.remove(); vi.unstubAllGlobals();
    }
  });
});
