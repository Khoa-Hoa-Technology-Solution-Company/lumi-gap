import { useEffect, useRef, useSyncExternalStore } from "react";
import { EditorState, Compartment } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, drawSelection, highlightActiveLine, dropCursor, rectangularSelection } from "@codemirror/view";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { StreamLanguage, bracketMatching, indentOnInput, syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { autocompletion, completionKeymap, type CompletionContext } from "@codemirror/autocomplete";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { yCollab, yUndoManagerKeymap } from "y-codemirror.next";
import { ManuscriptProvider } from "./collaboration-provider";
import { useI18n } from "@/i18n";

const latex = ["section", "subsection", "begin", "end", "textbf", "textit", "emph", "label", "ref", "cite", "includegraphics", "input", "item", "caption", "bibliography"];
const editorTheme = EditorView.theme({ "&": { height: "100%", fontSize: "13px", backgroundColor: "hsl(var(--background))", color: "hsl(var(--foreground))" }, ".cm-scroller": { overflow: "auto", fontFamily: '"Cascadia Code", "Consolas", monospace', lineHeight: "1.7" }, ".cm-content": { padding: "14px 0" }, ".cm-gutters": { backgroundColor: "hsl(var(--muted) / .45)", color: "hsl(var(--muted-foreground))", border: "none", paddingRight: "6px" }, ".cm-activeLine": { backgroundColor: "hsl(var(--primary) / .035)" }, ".cm-cursor": { borderLeftColor: "hsl(var(--foreground))" }, "&.cm-focused": { outline: "2px solid hsl(var(--primary) / .25)", outlineOffset: "-2px" }, ".cm-panels": { backgroundColor: "hsl(var(--muted))", color: "hsl(var(--foreground))" } });
export function SourceEditor({ provider, filename, citationKeys, onView }: { provider?: ManuscriptProvider; filename: string; citationKeys: string[]; onView: (view: EditorView | null) => void }) {
  const { t } = useI18n();
  const host = useRef<HTMLDivElement>(null), view = useRef<EditorView | null>(null), editability = useRef(new Compartment());
  const keys = useRef(citationKeys); keys.current = citationKeys;
  const onViewRef = useRef(onView); onViewRef.current = onView;
  const state = useSyncExternalStore(provider?.subscribe ?? (() => () => {}), provider?.getSnapshot ?? (() => readOnlyState));
  useEffect(() => {
    if (!host.current || !provider) return;
    const complete = (context: CompletionContext) => {
      const citation = context.matchBefore(/\\cite\{[A-Za-z0-9_:.-]*/);
      if (citation) return { from: citation.from + 6, options: keys.current.map(label => ({ label, type: "text" })) };
      const command = context.matchBefore(/\\[A-Za-z]*/); return command ? { from: command.from + 1, options: latex.map(label => ({ label, type: "keyword" })) } : null;
    };
    const instance = new EditorView({ parent: host.current, state: EditorState.create({ doc: provider.text.toString(), extensions: [lineNumbers(), highlightActiveLineGutter(), drawSelection(), dropCursor(), rectangularSelection(), highlightActiveLine(), indentOnInput(), bracketMatching(), highlightSelectionMatches(), syntaxHighlighting(defaultHighlightStyle, { fallback: true }), StreamLanguage.define(stex), autocompletion({ override: [complete] }), keymap.of([...yUndoManagerKeymap, ...defaultKeymap, indentWithTab, ...searchKeymap, ...completionKeymap]), yCollab(provider.text, provider.awareness), editability.current.of(EditorView.editable.of(provider.getSnapshot().canWrite)), EditorView.contentAttributes.of({ "aria-label": `${t("LaTeX source")}: ${filename}`, "data-no-i18n": "true", spellcheck: "false" }), EditorView.lineWrapping, editorTheme] }) });
    view.current = instance; onViewRef.current(instance);
    return () => { onViewRef.current(null); view.current = null; instance.destroy(); };
  }, [provider, filename]);
  useEffect(() => { view.current?.dispatch({ effects: editability.current.reconfigure(EditorView.editable.of(state.canWrite)) }); }, [state.canWrite]);
  return <div ref={host} className="writing-code" data-no-i18n />;
}
const readOnlyState = { canWrite: false };
export function SnapshotSourceEditor({ text, filename }: { text: string; filename: string }) {
  const { t } = useI18n();
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!host.current) return; const view = new EditorView({ parent: host.current, state: EditorState.create({ doc: text, extensions: [lineNumbers(), StreamLanguage.define(stex), syntaxHighlighting(defaultHighlightStyle), keymap.of(searchKeymap), EditorView.editable.of(false), EditorState.readOnly.of(true), EditorView.contentAttributes.of({ "aria-label": `${t("Snapshot source")}: ${filename}` }), EditorView.lineWrapping, editorTheme] }) }); return () => view.destroy(); }, [text, filename]);
  return <div ref={host} className="writing-code" data-no-i18n />;
}
