import { useEffect, useRef, useSyncExternalStore } from "react";
import { EditorState, Compartment, StateEffect } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, drawSelection, highlightActiveLine, dropCursor, rectangularSelection } from "@codemirror/view";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { StreamLanguage, bracketMatching, indentOnInput, syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { autocompletion, completionKeymap, type CompletionContext } from "@codemirror/autocomplete";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { yCollab } from "y-codemirror.next";
import { ManuscriptProvider } from "./collaboration-provider";
import { useI18n } from "@/i18n";
import { manuscriptUndoKeymap, sourceLanguage } from "./latex-tools";

const latex = ["section", "subsection", "begin", "end", "textbf", "textit", "emph", "label", "ref", "cite", "includegraphics", "input", "item", "caption", "bibliography"];
const searchLabels: Record<string, string> = { Find: "Find in file", Replace: "Replace text", next: "Next match", previous: "Previous match", all: "All matches", "match case": "Match case", regexp: "Regular expression", "by word": "Whole words", replace: "Replace text", "replace all": "Replace all matches", close: "Close search" };
const searchPhrases = (t: (key: string) => string) => EditorState.phrases.of(Object.fromEntries(Object.entries(searchLabels).map(([key, label]) => [key, t(label)])));
const editorTheme = EditorView.theme({ "&": { height: "100%", fontSize: "14px", backgroundColor: "hsl(var(--background))", color: "hsl(var(--foreground))" }, ".cm-scroller": { overflow: "auto", fontFamily: '"Cascadia Code", "Consolas", monospace', lineHeight: "1.8" }, ".cm-content": { padding: "18px 0" }, ".cm-gutters": { backgroundColor: "hsl(var(--muted) / .25)", color: "hsl(var(--muted-foreground))", border: "none", paddingRight: "8px" }, ".cm-activeLine": { backgroundColor: "hsl(var(--primary) / .035)" }, ".cm-cursor": { borderLeftColor: "hsl(var(--foreground))" }, "&.cm-focused": { outline: "2px solid hsl(var(--primary) / .25)", outlineOffset: "-2px" }, ".cm-panels": { backgroundColor: "hsl(var(--muted))", color: "hsl(var(--foreground))" } });
export type SourceSelection = { line: number; column: number; length: number };
const selectionOf = (state: EditorState): SourceSelection => { const range = state.selection.main, line = state.doc.lineAt(range.head); return { line: line.number, column: range.head - line.from + 1, length: range.to - range.from }; };
export function SourceEditor({ provider, filename, citationKeys, onView, onSelection }: { provider?: ManuscriptProvider; filename: string; citationKeys: string[]; onView: (view: EditorView | null) => void; onSelection?: (selection: SourceSelection) => void }) {
  const { t } = useI18n();
  const host = useRef<HTMLDivElement>(null), view = useRef<EditorView | null>(null), editability = useRef(new Compartment());
  const keys = useRef(citationKeys); keys.current = citationKeys;
  const onViewRef = useRef(onView); onViewRef.current = onView;
  const selectionRef = useRef(onSelection); selectionRef.current = onSelection;
  const state = useSyncExternalStore(provider?.subscribe ?? (() => () => {}), provider?.getSnapshot ?? (() => readOnlyState));
  useEffect(() => {
    if (!host.current || !provider) return;
    const complete = (context: CompletionContext) => {
      const citation = context.matchBefore(/\\cite\{[A-Za-z0-9_:.-]*/);
      if (citation) return { from: citation.from + 6, options: keys.current.map(label => ({ label, type: "text" })) };
      const command = context.matchBefore(/\\[A-Za-z]*/); return command ? { from: command.from + 1, options: latex.map(label => ({ label, type: "keyword" })) } : null;
    };
    const latexFile = sourceLanguage(filename) === "LaTeX";
    const instance = new EditorView({ parent: host.current, state: EditorState.create({ doc: provider.text.toString(), extensions: [searchPhrases(t), lineNumbers(), highlightActiveLineGutter(), drawSelection(), dropCursor(), rectangularSelection(), highlightActiveLine(), indentOnInput(), bracketMatching(), highlightSelectionMatches(), syntaxHighlighting(defaultHighlightStyle, { fallback: true }), ...(latexFile ? [StreamLanguage.define(stex), autocompletion({ override: [complete] })] : []), keymap.of([...manuscriptUndoKeymap, ...defaultKeymap, indentWithTab, ...searchKeymap, ...completionKeymap]), yCollab(provider.text, provider.awareness, { undoManager: provider.undoManager }), editability.current.of([EditorView.editable.of(provider.getSnapshot().canWrite), EditorState.readOnly.of(!provider.getSnapshot().canWrite)]), EditorView.contentAttributes.of({ "aria-label": `${t("Source file")}: ${filename}`, "data-no-i18n": "true", spellcheck: "false" }), EditorView.lineWrapping, editorTheme] }) });
    instance.dispatch({ effects: StateEffect.appendConfig.of(EditorView.updateListener.of(update => { if (update.selectionSet || update.docChanged) selectionRef.current?.(selectionOf(update.state)); })) });
    view.current = instance; onViewRef.current(instance); selectionRef.current?.(selectionOf(instance.state));
    return () => { onViewRef.current(null); view.current = null; instance.destroy(); };
  }, [provider, filename]);
  useEffect(() => { view.current?.dispatch({ effects: editability.current.reconfigure([EditorView.editable.of(state.canWrite), EditorState.readOnly.of(!state.canWrite)]) }); }, [state.canWrite]);
  return <div ref={host} className="writing-code" data-no-i18n />;
}
const readOnlyState = { canWrite: false };
export function SnapshotSourceEditor({ text, filename, onSelection, onView }: { text: string; filename: string; onSelection?: (selection: SourceSelection) => void; onView?: (view: EditorView | null) => void }) {
  const { t } = useI18n();
  const host = useRef<HTMLDivElement>(null);
  const selectionRef = useRef(onSelection); selectionRef.current = onSelection;
  const viewRef = useRef(onView); viewRef.current = onView;
  useEffect(() => { if (!host.current) return; const view = new EditorView({ parent: host.current, state: EditorState.create({ doc: text, extensions: [searchPhrases(t), lineNumbers(), ...(sourceLanguage(filename) === "LaTeX" ? [StreamLanguage.define(stex)] : []), syntaxHighlighting(defaultHighlightStyle), keymap.of(searchKeymap), EditorView.editable.of(false), EditorState.readOnly.of(true), EditorView.contentAttributes.of({ "aria-label": `${t("Snapshot source")}: ${filename}` }), EditorView.updateListener.of(update => { if (update.selectionSet) selectionRef.current?.(selectionOf(update.state)); }), EditorView.lineWrapping, editorTheme] }) }); viewRef.current?.(view); selectionRef.current?.(selectionOf(view.state)); return () => { viewRef.current?.(null); view.destroy(); }; }, [text, filename]);
  return <div ref={host} className="writing-code" data-no-i18n />;
}
