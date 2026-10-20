import * as Y from "yjs";

export interface AiSelection {
  fileId: string; original: string; start: Y.RelativePosition; end: Y.RelativePosition;
  before: string; after: string;
}
export function captureAiSelection(fileId: string, text: Y.Text, from: number, to: number): AiSelection {
  const source = text.toString();
  return { fileId, original: source.slice(from, to), start: Y.createRelativePositionFromTypeIndex(text, from, 0),
    end: Y.createRelativePositionFromTypeIndex(text, to, -1), before: source.slice(Math.max(0, from - 32), from), after: source.slice(to, to + 32) };
}
export function resolveAiSelection(target: AiSelection, fileId: string, text: Y.Text, checkContext = false): { from: number; to: number } | null {
  if (target.fileId !== fileId || !text.doc) return null;
  const start = Y.createAbsolutePositionFromRelativePosition(target.start, text.doc), end = Y.createAbsolutePositionFromRelativePosition(target.end, text.doc);
  if (!start || !end || start.type !== text || end.type !== text || end.index < start.index) return null;
  const source = text.toString();
  if (source.slice(start.index, end.index) !== target.original) return null;
  // At a cursor there is no selected text to compare: check the neighbouring context instead.
  if ((!target.original || checkContext) && (source.slice(Math.max(0, start.index - target.before.length), start.index) !== target.before || source.slice(end.index, end.index + target.after.length) !== target.after)) return null;
  return { from: start.index, to: end.index };
}
