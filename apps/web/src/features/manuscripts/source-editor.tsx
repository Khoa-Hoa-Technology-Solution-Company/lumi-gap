import type { ManuscriptSuggestion } from "@trend/shared-types";
import { sourceProposals, proposalDecorations, setSourceProposals } from "./source-proposals";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { EditorState, Compartment, StateEffect } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, drawSelection, highlightActiveLine, dropCursor, rectangularSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { StreamLanguage, bracketMatching, indentOnInput, syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { autocompletion, completionKeymap, type CompletionContext } from "@codemirror/autocomplete";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { yCollab } from "y-codemirror.next";
import { ManuscriptProvider } from "./collaboration-provider";
import { useI18n } from "@/i18n";
import { manuscriptUndoKeymap, sourceLanguage } from "./latex-tools";
import { completeLatex } from "./latex-completion";

const searchLabels: Record<string, string> = { Find: "Find in file", Replace: "Replace text", next: "Next match", previous: "Previous match", all: "All matches", "match case": "Match case", regexp: "Regular expression", "by word": "Whole words", replace: "Replace text", "replace all": "Replace all matches", close: "Close search" };
const searchPhrases = (t: (key: string) => string) => EditorState.phrases.of(Object.fromEntries(Object.entries(searchLabels).map(([key, label]) => [key, t(label)])));
const editorTheme = EditorView.theme({ "&": { height: "100%", fontSize: "14px", backgroundColor: "hsl(var(--background))", color: "hsl(var(--foreground))" }, ".cm-scroller": { overflow: "auto", fontFamily: '"Cascadia Code", "Consolas", monospace', lineHeight: "1.8" }, ".cm-content": { padding: "18px 0" }, ".cm-gutters": { backgroundColor: "hsl(var(--muted) / .25)", color: "hsl(var(--muted-foreground))", border: "none", paddingRight: "8px" }, ".cm-activeLine": { backgroundColor: "hsl(var(--primary) / .035)" }, ".cm-cursor": { borderLeftColor: "hsl(var(--foreground))" }, "&.cm-focused": { outline: "2px solid hsl(var(--primary) / .25)", outlineOffset: "-2px" }, ".cm-panels": { backgroundColor: "hsl(var(--muted))", color: "hsl(var(--foreground))" } });
export type SourceSelection = { line: number; column: number; length: number };
const selectionOf = (state: EditorState): SourceSelection => { const range = state.selection.main, line = state.doc.lineAt(range.head); return { line: line.number, column: range.head - line.from + 1, length: range.to - range.from }; };
export function SourceEditor({ provider, filename, citationKeys, filePaths = [], proposals = [], reviewDisabled = false, onReview, onView, onSelection }: { provider?: ManuscriptProvider; filename: string; citationKeys: string[]; filePaths?: string[]; proposals?: ManuscriptSuggestion[]; reviewDisabled?: boolean; onReview?: (row: ManuscriptSuggestion, status: "ACCEPTED" | "REJECTED") => void; onView: (view: EditorView | null) => void; onSelection?: (selection: SourceSelection) => void }) {
  const { t } = useI18n();
  const host = useRef<HTMLDivElement>(null), view = useRef<EditorView | null>(null), editability = useRef(new Compartment());
  const keys = useRef(citationKeys); keys.current = citationKeys;
  const paths = useRef(filePaths); paths.current = filePaths;
  const reviewRef = useRef(onReview); reviewRef.current = onReview;
  const review = useCallback((row: ManuscriptSuggestion, status: "ACCEPTED" | "REJECTED") => reviewRef.current?.(row, status), []);
  const onViewRef = useRef(onView); onViewRef.current = onView;
  const selectionRef = useRef(onSelection); selectionRef.current = onSelection;
  const state = useSyncExternalStore(provider?.subscribe ?? (() => () => {}), provider?.getSnapshot ?? (() => readOnlyState));
  useEffect(() => {
    if (!host.current || !provider) return;
    const complete = (context: CompletionContext) => completeLatex(context, keys.current, paths.current);
    const latexFile = sourceLanguage(filename) === "LaTeX";
    const instance = new EditorView({ parent: host.current, state: EditorState.create({ doc: provider.text.toString(), extensions: [sourceProposals, searchPhrases(t), lineNumbers(), highlightActiveLineGutter(), drawSelection(), dropCursor(), rectangularSelection(), highlightActiveLine(), indentOnInput(), bracketMatching(), highlightSelectionMatches(), syntaxHighlighting(defaultHighlightStyle, { fallback: true }), ...(latexFile ? [StreamLanguage.define(stex), autocompletion({ override: [complete] })] : []), keymap.of([...manuscriptUndoKeymap, ...defaultKeymap, indentWithTab, ...searchKeymap, ...completionKeymap]), yCollab(provider.text, provider.awareness, { undoManager: provider.undoManager }), editability.current.of([EditorView.editable.of(provider.getSnapshot().canWrite), EditorState.readOnly.of(!provider.getSnapshot().canWrite)]), EditorView.contentAttributes.of({ "aria-label": `${t("Source file")}: ${filename}`, "data-no-i18n": "true", spellcheck: "false" }), EditorView.lineWrapping, editorTheme] }) });
    instance.dispatch({ effects: StateEffect.appendConfig.of(EditorView.updateListener.of(update => { if (update.selectionSet || update.docChanged) selectionRef.current?.(selectionOf(update.state)); })) });
    view.current = instance; onViewRef.current(instance); selectionRef.current?.(selectionOf(instance.state));
    return () => { onViewRef.current(null); view.current = null; instance.destroy(); };
  }, [provider, filename]);
  useEffect(() => { view.current?.dispatch({ effects: editability.current.reconfigure([EditorView.editable.of(state.canWrite), EditorState.readOnly.of(!state.canWrite)]) }); }, [state.canWrite]);
  useEffect(() => {
    const instance = view.current;
    if (!provider || !instance || !onReview) return;
    let disposed = false, queued = false;
    const update = () => {
      if (queued) return; queued = true;
      queueMicrotask(() => {
        queued = false;
        if (!disposed) instance.dispatch({ effects: setSourceProposals.of(proposalDecorations(proposals, provider.fileId, provider.text, instance, reviewDisabled || !provider.getSnapshot().canWrite || Boolean(provider.getSnapshot().pending), review, t)) });
      });
    };
    update(); provider.text.observe(update);
    return () => { disposed = true; provider.text.unobserve(update); };
  }, [provider, filename, proposals, review, reviewDisabled, state.canWrite, t]);
  return <div ref={host} className="writing-code" data-no-i18n />;
}
const readOnlyState = { canWrite: false };
/** Independent proposal buffer: intentionally has no Yjs binding. */
export function ProposalSourceEditor({ initial, disabled, onChange }: { initial: string; disabled: boolean; onChange: (text: string) => void }) {
  const { t } = useI18n(), host = useRef<HTMLDivElement>(null), view = useRef<EditorView>(), change = useRef(onChange), compartment = useRef(new Compartment());
  change.current = onChange;
  useEffect(() => {
    if (!host.current) return;
    const instance = new EditorView({ parent: host.current, state: EditorState.create({ doc: initial, extensions: [lineNumbers(), history(), keymap.of([...historyKeymap, ...defaultKeymap, indentWithTab, ...searchKeymap]), StreamLanguage.define(stex), syntaxHighlighting(defaultHighlightStyle), bracketMatching(), EditorView.lineWrapping, editorTheme, compartment.current.of(EditorState.readOnly.of(disabled)), EditorView.contentAttributes.of({ "aria-label": t("Tracked proposal source"), spellcheck: "false" }), EditorView.updateListener.of(update => { if (update.docChanged) change.current(update.state.doc.toString()); })] }) });
    view.current = instance; return () => { view.current = undefined; instance.destroy(); };
  }, [initial]);
  useEffect(() => { view.current?.dispatch({ effects: compartment.current.reconfigure([EditorState.readOnly.of(disabled), EditorView.editable.of(!disabled)]) }); }, [disabled]);
  return <div className="writing-code writing-proposal-code" ref={host} />;
}
export function SnapshotSourceEditor({ text, filename, onSelection, onView }: { text: string; filename: string; onSelection?: (selection: SourceSelection) => void; onView?: (view: EditorView | null) => void }) {
  const { t } = useI18n();
  const host = useRef<HTMLDivElement>(null);
  const selectionRef = useRef(onSelection); selectionRef.current = onSelection;
  const viewRef = useRef(onView); viewRef.current = onView;
  useEffect(() => { if (!host.current) return; const view = new EditorView({ parent: host.current, state: EditorState.create({ doc: text, extensions: [searchPhrases(t), lineNumbers(), ...(sourceLanguage(filename) === "LaTeX" ? [StreamLanguage.define(stex)] : []), syntaxHighlighting(defaultHighlightStyle), keymap.of(searchKeymap), EditorView.editable.of(false), EditorState.readOnly.of(true), EditorView.contentAttributes.of({ "aria-label": `${t("Snapshot source")}: ${filename}` }), EditorView.updateListener.of(update => { if (update.selectionSet) selectionRef.current?.(selectionOf(update.state)); }), EditorView.lineWrapping, editorTheme] }) }); viewRef.current?.(view); selectionRef.current?.(selectionOf(view.state)); return () => { viewRef.current?.(null); view.destroy(); }; }, [text, filename]);
  return <div ref={host} className="writing-code" data-no-i18n />;
}
