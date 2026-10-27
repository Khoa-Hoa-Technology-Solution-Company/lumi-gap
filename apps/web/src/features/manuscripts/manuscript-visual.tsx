import { Fragment, Suspense, lazy, useEffect, useState } from "react";
import { Mark, Node, type JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { useUnsavedWorkspace } from "@/features/projects/components/workspace-common";
import type { ManuscriptProvider } from "./collaboration-provider";
import { captureAiSelection, type AiSelection } from "./ai-selection";
import { visualBlocks, serializeVisualBlock, type VisualBlock } from "./latex-visual";

import { parseTable, equationBody } from "./latex-structures";
import type { StructureDraft } from "./manuscript-structure-dialog";
const StructureDialog = lazy(() => import("./manuscript-structure-dialog").then(module => ({ default: module.ManuscriptStructureDialog })));
const LatexToken = Node.create({
  name: "latexToken", group: "inline", inline: true, atom: true,
  addAttributes: () => ({ source: { default: "" } }),
  parseHTML: () => [{ tag: "span[data-latex-token]" }],
  renderHTML: ({ node }) => ["span", { "data-latex-token": "true", class: "writing-visual-token", contenteditable: "false", title: node.attrs.source }, node.attrs.source],
});
const LatexEmphasis = Mark.create({ name: "latexEmphasis", parseHTML: () => [{ tag: "em[data-latex-emphasis]" }], renderHTML: () => ["em", { "data-latex-emphasis": "true" }, 0] });
function Inline({ nodes }: { nodes: JSONContent[] }) {
  return <>{nodes.map((node, index) => {
    let child = node.type === "hardBreak" ? <br /> : node.type === "latexToken" ? <code className="writing-visual-token">{node.attrs?.source}</code> : <>{node.text}</>;
    for (const mark of node.marks ?? []) child = mark.type === "bold" ? <strong>{child}</strong> : ["italic", "latexEmphasis"].includes(mark.type) ? <em>{child}</em> : child;
    return <Fragment key={index}>{child}</Fragment>;
  })}</>;
}
export function ManuscriptVisual({ provider, canWrite, apply, source, onDirty }: { provider: ManuscriptProvider; canWrite: boolean; apply: (target: AiSelection, replacement: string) => Promise<void>; source: (line: number) => void; onDirty?: (dirty: boolean) => void }) {
  const { t } = useI18n();
  const [value, setValue] = useState(provider.text.toString()), [draft, setDraft] = useState<{ block: VisualBlock; target: AiSelection; insert?: boolean }>();
  const [structure, setStructure] = useState<StructureDraft>();
  useEffect(() => { const update = () => setValue(provider.text.toString()); update(); provider.text.observe(update); return () => provider.text.unobserve(update); }, [provider]);
  useUnsavedWorkspace(Boolean(draft || structure));
  useEffect(() => { onDirty?.(Boolean(draft || structure)); return () => onDirty?.(false); }, [Boolean(draft || structure), onDirty]);
  const blocks = visualBlocks(value);
  const editStructure = (block: VisualBlock, kind: "table" | "equation") => {
    if (!canWrite || provider.text.toString() !== value || !provider.getSnapshot().canWrite || provider.getSnapshot().pending) return;
    setStructure({ kind, target: captureAiSelection(provider.fileId, provider.text, block.from, block.to) });
  };
  return <div className="writing-visual" aria-label={t("Visual writing")}>
    <p className="writing-small">{t("Edit prose and headings visually. Equations, citations and unsupported LaTeX stay protected; use Source for complex structures.")}</p>
    {draft ? <VisualDraft key={`${draft.block.from}:${draft.target.original}`} block={draft.block} disabled={!canWrite} onCancel={() => setDraft(undefined)} onSave={async text => { await apply(draft.target, draft.insert ? `\n\n${text}\n` : text); setDraft(undefined); }} /> : blocks.slice(0, 300).map((block, index) => <section key={index} className={`writing-visual-block is-${block.kind}`}>
      {block.kind === "source" && parseTable(block.source) ? <><div className="writing-table-grid"><table><tbody>{parseTable(block.source)!.rows.map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c}>{cell}</td>)}</tr>)}</tbody></table></div><Button size="sm" variant="outline" disabled={!canWrite} onClick={() => editStructure(block, "table")}>{t("Table editor")}</Button></> : block.kind === "source" && equationBody(block.source) !== null ? <><pre>{block.source}</pre><Button size="sm" variant="outline" disabled={!canWrite} onClick={() => editStructure(block, "equation")}>{t("Equation editor")}</Button></> : block.kind === "source" ? <details><summary>{t("LaTeX structure")}</summary><pre>{block.source}</pre></details> : block.kind === "heading" ? <h2 className={`is-level-${block.level}`}><Inline nodes={block.content!} /></h2> : <p><Inline nodes={block.content!} /></p>}
      <div className="writing-visual-actions">{block.kind !== "source" ? <><button disabled={!canWrite} onClick={() => { if (provider.text.toString() !== value || !provider.getSnapshot().canWrite || provider.getSnapshot().pending) return; setDraft({ block, target: captureAiSelection(provider.fileId, provider.text, block.from, block.to) }); }}>{t("Edit block")}</button><button disabled={!canWrite} onClick={() => { if (provider.text.toString() !== value || !provider.getSnapshot().canWrite || provider.getSnapshot().pending) return; setDraft({ block: { from: block.to, to: block.to, source: "", kind: "paragraph", content: [] }, target: captureAiSelection(provider.fileId, provider.text, block.to, block.to), insert: true }); }}>{t("Add paragraph")}</button></> : null}<button onClick={() => source(value.slice(0, block.from).split("\n").length)}>{t("Open source")}</button></div>
    </section>)}
    {blocks.length > 300 ? <p>{t("Open Source to view the rest of this file.")}</p> : null}
    {!blocks.length ? <Button variant="outline" size="sm" disabled={!canWrite} onClick={() => setDraft({ block: { from: 0, to: 0, source: "", kind: "paragraph", content: [] }, target: captureAiSelection(provider.fileId, provider.text, 0, 0) })}>{t("Write a paragraph")}</Button> : null}
    {structure ? <Suspense fallback={<p role="status">{t("Loading…")}</p>}><StructureDialog draft={structure} onClose={() => setStructure(undefined)} onApply={apply} /></Suspense> : null}
  </div>;
}
function VisualDraft({ block, disabled, onCancel, onSave }: { block: VisualBlock; disabled: boolean; onCancel: () => void; onSave: (text: string) => Promise<void> }) {
  const { t } = useI18n(), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const editor = useEditor({ extensions: [StarterKit.configure({ heading: false, blockquote: false, bulletList: false, orderedList: false, codeBlock: false, code: false, horizontalRule: false, strike: false, link: false, underline: false }), LatexToken, LatexEmphasis], content: { type: "doc", content: [{ type: "paragraph", content: block.content ?? [] }] }, editable: !disabled, editorProps: { attributes: { "aria-label": t("Edit visual block"), role: "textbox", "aria-multiline": "true" }, handlePaste: (view, event) => { const text = event.clipboardData?.getData("text/plain"); if (text) view.dispatch(view.state.tr.insertText(text)); return true; }, handleDrop: () => true } });
  useEffect(() => { editor?.setEditable(!disabled && !busy); }, [editor, disabled, busy]);
  if (!editor) return null;
  return <section className="writing-visual-draft"><div role="toolbar" aria-label={t("Text formatting")}><Button type="button" size="sm" variant="outline" disabled={disabled || busy} aria-label={t("Bold")} onClick={() => editor.chain().focus().toggleBold().run()}><strong>B</strong></Button><Button type="button" size="sm" variant="outline" disabled={disabled || busy} aria-label={t("Italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><em>I</em></Button></div><EditorContent editor={editor} />
    {error ? <p role="alert" className="writing-error">{error}</p> : null}
    <div className="writing-actions"><Button size="sm" disabled={disabled || busy} onClick={() => { setBusy(true); setError(""); void Promise.resolve().then(() => onSave(serializeVisualBlock(block, editor.getJSON()))).catch(() => setError(t("The source or protected LaTeX changed, or access ended. Your draft is retained; compare it with Source before retrying."))).finally(() => setBusy(false)); }}>{t("Save block")}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>{t("Cancel")}</Button></div>
  </section>;
}
