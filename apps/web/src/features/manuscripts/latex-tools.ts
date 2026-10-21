import { EditorSelection } from "@codemirror/state";
import { EditorView, type KeyBinding } from "@codemirror/view";
import { yUndoManagerKeymap } from "y-codemirror.next";

// Yjs undo commands bypass CodeMirror's normal read-only transaction checks.
// Consume the shortcut without changing shared text when editing is disabled.
export const manuscriptUndoKeymap: readonly KeyBinding[] = yUndoManagerKeymap.map(binding => ({
  ...binding,
  run: (view: EditorView) => view.state.readOnly || !view.state.facet(EditorView.editable) ? true : binding.run?.(view) ?? false,
}));

export type LatexAction = "bold" | "italic" | "section" | "list" | "math";
export const sourceLanguage = (filename: string) => /\.(tex|sty|cls)$/i.test(filename) ? "LaTeX" : /\.bib$/i.test(filename) ? "BibTeX" : "Plain text";
const wrappers: Record<LatexAction, [string, string, string]> = {
  bold: ["\\textbf{", "}", "text"],
  italic: ["\\textit{", "}", "text"],
  section: ["\\section{", "}\n", "Section title"],
  list: ["\\begin{itemize}\n  \\item ", "\n\\end{itemize}\n", "Item"],
  math: ["\\[\n  ", "\n\\]\n", "a = b"],
};

/** Dispatch through CodeMirror so the existing Yjs binding and undo stack own edits. */
export function insertLatex(view: EditorView, action: LatexAction) {
  if (view.state.readOnly || !view.state.facet(EditorView.editable)) return false;
  const [before, after, placeholder] = wrappers[action];
  view.dispatch(view.state.changeByRange(range => {
    const text = range.empty ? placeholder : view.state.sliceDoc(range.from, range.to);
    return {
      changes: { from: range.from, to: range.to, insert: before + text + after },
      range: EditorSelection.range(range.from + before.length, range.from + before.length + text.length),
    };
  }), { userEvent: "input" });
  view.focus();
  return true;
}

export type LatexHeading = { title: string; line: number; depth: number };
/** A navigation aid, not a TeX evaluator. Ignore comments and verbatim environments. */
export function latexOutline(source: string): LatexHeading[] {
  const headings: LatexHeading[] = [];
  let literal = false;
  for (const [index, raw] of source.split("\n").entries()) {
    const line = raw.replace(/(^|[^\\])(?:\\\\)*%.*/, "$1");
    if (/\\begin\{(?:verbatim\*?|lstlisting|minted)\}/.test(line)) literal = true;
    if (!literal) {
      const match = line.match(/^\s*\\(chapter|section|subsection|subsubsection|paragraph)\*?(?:\[[^\]]*\])?\s*\{/);
      if (match) {
        let nesting = 1, end = match[0].length;
        for (; end < line.length && nesting; end++) {
          if (line[end] === "\\") { end++; continue; }
          if (line[end] === "{") nesting++;
          if (line[end] === "}") nesting--;
        }
        if (!nesting) headings.push({ title: line.slice(match[0].length, end - 1).replace(/\\[A-Za-z]+\*?\s*\{/g, "").replace(/[{}]/g, "").trim(), line: index + 1, depth: ["chapter", "section", "subsection", "subsubsection", "paragraph"].indexOf(match[1]!) });
      }
    }
    if (/\\end\{(?:verbatim\*?|lstlisting|minted)\}/.test(line)) literal = false;
    if (headings.length >= 200) break;
  }
  return headings;
}
