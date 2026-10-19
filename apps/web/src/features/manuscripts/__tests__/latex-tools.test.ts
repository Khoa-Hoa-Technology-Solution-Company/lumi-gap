// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { EditorState, EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import * as Y from "yjs";
import { yCollab, yUndoManagerKeymap } from "y-codemirror.next";
import { insertLatex, latexOutline } from "../latex-tools";

let editor: EditorView | undefined;
afterEach(() => { editor?.destroy(); editor = undefined; });

it("inserts LaTeX around the selection and persists through the existing Yjs binding", () => {
  const doc = new Y.Doc(), text = doc.getText("source");
  text.insert(0, "Our findings");
  editor = new EditorView({ state: EditorState.create({ doc: text.toString(), selection: EditorSelection.range(4, 12), extensions: [yCollab(text, null)] }) });
  expect(insertLatex(editor, "bold")).toBe(true);
  expect(editor.state.doc.toString()).toBe("Our \\textbf{findings}");
  expect(text.toString()).toBe(editor.state.doc.toString());
  expect(editor.state.sliceDoc(editor.state.selection.main.from, editor.state.selection.main.to)).toBe("findings");
  yUndoManagerKeymap[0]!.run!(editor);
  expect(text.toString()).toBe("Our findings");
  editor.destroy(); editor = undefined; doc.destroy();
});
it("uses editable placeholders and blocks commands on readonly source", () => {
  editor = new EditorView({ state: EditorState.create({ doc: "", extensions: [EditorView.editable.of(false)] }) });
  expect(insertLatex(editor, "section")).toBe(false);
  expect(editor.state.doc.length).toBe(0);
  editor.destroy();
  editor = new EditorView({ state: EditorState.create({ doc: "" }) });
  insertLatex(editor, "math");
  expect(editor.state.doc.toString()).toBe("\\[\n  a = b\n\\]\n");
  expect(editor.state.sliceDoc(editor.state.selection.main.from, editor.state.selection.main.to)).toBe("a = b");
});
it("keeps local undo across editor remounts without undoing remote edits", () => {
  const doc = new Y.Doc(), text = doc.getText("source");
  text.insert(0, "Original");
  const undoManager = new Y.UndoManager(text, { trackedOrigins: new Set() });
  const mount = () => new EditorView({ state: EditorState.create({ doc: text.toString(), extensions: [yCollab(text, null, { undoManager })] }) });
  editor = mount();
  editor.dispatch({ changes: { from: text.length, insert: " local" } });
  editor.destroy();
  doc.transact(() => text.insert(0, "Remote "), "remote-provider");
  editor = mount();
  yUndoManagerKeymap[0]!.run!(editor);
  expect(text.toString()).toBe("Remote Original");
  expect(editor.state.doc.toString()).toBe("Remote Original");
  editor.destroy(); editor = undefined; undoManager.destroy(); doc.destroy();
});
it("navigates real headings and ignores commented and verbatim headings", () => {
  const text = "% \\section{Hidden}\n\\section{Introduction}\n\\subsection*{A \\textbf{nested} title}\n\\begin{verbatim}\n\\section{Example}\n\\end{verbatim}\n\\section[Short]{Results} % note\n\\section{Unclosed";
  expect(latexOutline(text)).toEqual([
    { title: "Introduction", line: 2, depth: 1 },
    { title: "A nested title", line: 3, depth: 2 },
    { title: "Results", line: 7, depth: 1 },
  ]);
});
it("treats untrusted heading text as data and caps the navigation list", () => {
  expect(latexOutline("\\section{<img src=x onerror=alert(1)>}")[0]?.title).toBe("<img src=x onerror=alert(1)>");
  expect(latexOutline(Array.from({ length: 500 }, () => "\\section{Section}").join("\n"))).toHaveLength(200);
});
