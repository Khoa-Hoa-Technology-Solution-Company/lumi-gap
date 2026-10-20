import { Bold, Italic, Heading1, List, Sigma, Search, Undo2, Redo2, MessageSquarePlus, Table2, FunctionSquare } from "lucide-react";
import { openSearchPanel } from "@codemirror/search";
import type { EditorView } from "@codemirror/view";
import { useI18n } from "@/i18n";
import { insertLatex, manuscriptUndoKeymap, sourceLanguage, type LatexAction } from "./latex-tools";

const tools = [
  { action: "bold", label: "Bold text", Icon: Bold },
  { action: "italic", label: "Italic text", Icon: Italic },
  { action: "section", label: "Insert section", Icon: Heading1 },
  { action: "list", label: "Insert list", Icon: List },
  { action: "math", label: "Insert equation", Icon: Sigma },
] as const;
export function ManuscriptSourceToolbar({ getView, canEdit, canSearch, canComment, onComment, onStructure, canStructure = canEdit, filename }: {
  getView: () => EditorView | null; canEdit: boolean; canSearch: boolean; canComment: boolean; onComment: () => void; canStructure?: boolean; onStructure?: (kind: "table" | "equation") => void; filename: string;
}) {
  const { t } = useI18n();
  const language = sourceLanguage(filename), latexFile = language === "LaTeX";
  const edit = (action: LatexAction) => { const view = getView(); if (view && canEdit && latexFile) insertLatex(view, action); };
  return <div className="writing-source-tools" role="group" aria-label={t("Source tools")}>
    <button title={t("Undo local edit")} aria-label={t("Undo local edit")} disabled={!canEdit} onClick={() => { const view = getView(); if (view) manuscriptUndoKeymap[0]?.run?.(view); }}><Undo2 /></button>
    <button title={t("Redo local edit")} aria-label={t("Redo local edit")} disabled={!canEdit} onClick={() => { const view = getView(); if (view) manuscriptUndoKeymap[1]?.run?.(view); }}><Redo2 /></button>
    <span className="writing-tool-divider" />
    {tools.map(({ action, label, Icon }) => <button key={action} title={t(label)} aria-label={t(label)} disabled={!canEdit || !latexFile} onClick={() => edit(action)}><Icon /></button>)}
    {onStructure ? <><button title={t("Table editor")} aria-label={t("Table editor")} disabled={!canStructure || !latexFile} onClick={() => onStructure("table")}><Table2 /></button><button title={t("Equation editor")} aria-label={t("Equation editor")} disabled={!canStructure || !latexFile} onClick={() => onStructure("equation")}><FunctionSquare /></button></> : null}
    <span className="writing-tool-divider" />
    <button title={t("Comment on selection")} aria-label={t("Comment on selection")} disabled={!canComment} onClick={onComment}><MessageSquarePlus /></button>
    <span className="writing-source-mode">{t(language)}</span>
    <button title={t("Find in file")} aria-label={t("Find in file")} disabled={!canSearch} onClick={() => { const view = getView(); if (view) openSearchPanel(view); }}><Search /></button>
  </div>;
}
