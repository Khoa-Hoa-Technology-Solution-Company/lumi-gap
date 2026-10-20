import * as Y from "yjs";
import type { ManuscriptSuggestion } from "@trend/shared-types";
import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, WidgetType, type DecorationSet } from "@codemirror/view";
import { EditorView } from "@codemirror/view";
import { resolveAiSelection } from "./ai-selection";

export function sourceProposalRange(row: ManuscriptSuggestion, fileId: string, text: Y.Text) {
  if (row.fileId !== fileId || row.status !== "PENDING" || !row.anchor) return null;
  try {
    return resolveAiSelection({ fileId, original: row.original, ...row.anchor, start: Y.createRelativePositionFromJSON(row.anchor.start), end: Y.createRelativePositionFromJSON(row.anchor.end) }, fileId, text, true);
  } catch { return null; }
}

type Review = (row: ManuscriptSuggestion, status: "ACCEPTED" | "REJECTED") => void;
class ProposalWidget extends WidgetType {
  constructor(readonly row: ManuscriptSuggestion, readonly disabled: boolean, readonly review: Review, readonly t: (key: string) => string) { super(); }
  override eq(other: ProposalWidget) { return other.row === this.row && other.disabled === this.disabled && other.review === this.review && other.t === this.t; }
  override toDOM() {
    const host = document.createElement("details"); host.className = "writing-inline-proposal";
    const heading = document.createElement("summary"); heading.textContent = `${this.row.author.name} · ${this.t("Suggested edits")} · v${this.row.revision}`; host.append(heading);
    const content = document.createElement("div"); content.className = "writing-inline-proposal-body";
    const before = document.createElement("del"), after = document.createElement("ins");
    before.textContent = this.row.original || this.t("Insert at cursor"); after.textContent = this.row.replacement || this.t("Delete selection");
    content.append(before, after);
    if (this.row.note) { const note = document.createElement("p"); note.textContent = this.row.note; content.append(note); }
    for (const [status, label] of [["ACCEPTED", "Accept edit"], ["REJECTED", "Reject edit"]] as const) {
      const button = document.createElement("button"); button.type = "button"; button.textContent = this.t(label); button.disabled = this.disabled;
      button.addEventListener("click", () => this.review(this.row, status)); content.append(button);
    }
    host.append(content); return host;
  }
  override ignoreEvent() { return true; }
}
export const setSourceProposals = StateEffect.define<DecorationSet>();
export const sourceProposals = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    // Hide old controls until Yjs anchors have been resolved against the new source.
    if (transaction.docChanged) value = Decoration.none;
    for (const effect of transaction.effects) if (effect.is(setSourceProposals)) value = effect.value;
    return value;
  },
  provide: field => EditorView.decorations.from(field),
});
export function proposalDecorations(rows: ManuscriptSuggestion[], fileId: string, text: Y.Text, view: EditorView, disabled: boolean, review: Review, t: (key: string) => string) {
  if (text.toString() !== view.state.doc.toString()) return Decoration.none;
  const ranges = rows.filter(row => row.fileId === fileId && row.status === "PENDING").slice(0, 30).flatMap(row => {
    const range = sourceProposalRange(row, fileId, text);
    if (!range) return [];
    return [
      ...(range.from < range.to ? [Decoration.mark({ class: "writing-proposed-source" }).range(range.from, range.to)] : []),
      Decoration.widget({ widget: new ProposalWidget(row, disabled, review, t), block: true, side: 1 }).range(view.state.doc.lineAt(range.to).to),
    ];
  });
  return Decoration.set(ranges, true);
}
