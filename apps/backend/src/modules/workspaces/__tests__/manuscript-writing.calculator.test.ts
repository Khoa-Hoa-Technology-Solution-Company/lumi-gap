import { describe, it, expect } from "vitest";
import * as Y from "yjs";
import { captureWritingChange, captureWritingSpans, calculateRetainedWriting, proseMask, type WritingSpan } from "../manuscript-writing.calculator.js";
import { includedWritingFiles } from "../manuscript-writing.service.js";
import type { ManuscriptManifest } from "@trend/shared-types";

const alice = "00000000-0000-4000-8000-000000000001", bob = "00000000-0000-4000-8000-000000000002";
function fixture(initial = "") {
  const doc = new Y.Doc(); doc.getText("source").insert(0, initial); const spans: WritingSpan[] = [];
  let baseline: unknown;
  return { doc, spans,
    edit(actor: string, edit: (text: Y.Text) => void) {
      const before = new Y.Doc(); Y.applyUpdate(before, Y.encodeStateAsUpdate(doc)); edit(doc.getText("source"));
      const captured = captureWritingChange(before, doc, actor, baseline); baseline = captured.baseline; spans.push(...captured.spans); before.destroy();
    },
    result(path = "paper.txt") { return calculateRetainedWriting([{ id: "f", path, state: Y.encodeStateAsUpdate(doc), spans }], new Map([[alice, { name: "Alice" }], [bob, { name: "Bob" }]])); },
  };
}
describe("retained manuscript writing attribution", () => {
  it("attributes a 60/40 example, includes unknown text in overall percentages and preserves exactly 10000 suggested basis points", () => {
    const f = fixture("Unknown baseline. ");
    f.edit(alice, text => text.insert(text.length, "one two three four five six "));
    f.edit(bob, text => text.insert(text.length, "seven eight nine ten"));
    const result = f.result();
    expect(result.totalWords).toBe(12); expect(result.unknownWordUnits).toBe(2000);
    expect(result.members.map(m => m.suggestedBasisPoints)).toEqual([6000, 4000]);
    expect(result.members.map(m => m.overallBasisPoints)).toEqual([5000, 3333]);
    expect(result.coverageBasisPoints).toBe(8333);
  });
  it("divides a mixed word by characters instead of crediting its entire paragraph to the last editor", () => {
    const f = fixture(); f.edit(alice, text => text.insert(0, "cats"));
    f.edit(bob, text => { text.delete(0, 1); text.insert(0, "b"); });
    const result = f.result();
    expect(result.totalWords).toBe(1); expect(result.members.map(m => m.retainedWordUnits)).toEqual([750, 250]);
  });
  it("credits a newly inserted repeated phrase without duplicating the retained phrase's ownership", () => {
    const f = fixture(); f.edit(alice, text => text.insert(0, "alpha beta"));
    f.edit(bob, text => text.insert(0, "alpha beta "));
    expect(f.result().members.map(m => [m.userId, m.retainedWordUnits])).toEqual([[alice, 2000], [bob, 2000]]);
  });
  it("preserves the original source of unchanged text when an entire suggestion is replaced", () => {
    const f = fixture(); f.edit(alice, text => text.insert(0, "first old middle old last"));
    f.edit(bob, text => { text.delete(0, text.length); text.insert(0, "first new middle new last"); });
    const result = f.result();
    expect(result.members.map(m => m.retainedWordUnits)).toEqual([3000, 2000]);
    expect(result.members.map(m => m.suggestedBasisPoints)).toEqual([6000, 4000]);
  });
  it("never credits baseline text on a full-state replay or an identical replacement", () => {
    const f = fixture("old imported words");
    f.edit(bob, text => { text.delete(0, text.length); text.insert(0, "old imported words"); });
    expect(f.result().members).toEqual([]); expect(f.result().unknownWordUnits).toBe(3000);
    const before = new Y.Doc(); Y.applyUpdate(before, Y.encodeStateAsUpdate(f.doc));
    expect(captureWritingSpans(before, f.doc, alice)).toEqual([]);
  });
  it("counts retained text only after deletions and undo without accumulating keystrokes", () => {
    const f = fixture(); const manager = new Y.UndoManager(f.doc.getText("source"));
    f.edit(alice, text => text.insert(0, "keep remove")); manager.stopCapturing();
    f.edit(alice, text => text.delete(4, 7));
    expect(f.result().members[0]?.retainedWordUnits).toBe(1000);
    const before = new Y.Doc(); Y.applyUpdate(before, Y.encodeStateAsUpdate(f.doc));
    manager.undo(); f.spans.push(...captureWritingSpans(before, f.doc, alice));
    expect(f.result().members[0]?.retainedWordUnits).toBe(2000);
    manager.destroy(); before.destroy();
  });
  it("preserves the original writer when another account deletes and restores their text", () => {
    const f = fixture(); f.edit(alice, text => text.insert(0, "original writing"));
    f.edit(bob, text => text.delete(0, text.length));
    expect(f.result().members).toEqual([]);
    f.edit(bob, text => text.insert(0, "original writing"));
    expect(f.result().members.map(m => [m.userId, m.retainedWordUnits])).toEqual([[alice, 2000]]);
  });
  it("does not reuse a recovered deletion to credit additional copies to the original writer", () => {
    const f = fixture(); f.edit(alice, text => text.insert(0, "original writing"));
    f.edit(bob, text => text.delete(0, text.length));
    f.edit(bob, text => text.insert(0, "original writing"));
    f.edit(bob, text => text.insert(text.length, " "));
    f.edit(bob, text => text.insert(text.length, "original writing"));
    expect(f.result().members.map(m => [m.userId, m.retainedWordUnits])).toEqual([[alice, 2000], [bob, 2000]]);
  });
  it("excludes common LaTeX syntax, comments, bibliography, math and preamble while preserving Unicode offsets", () => {
    const f = fixture();
    f.edit(alice, text => text.insert(0, "\\documentclass{article}\n\\title{Not body}\n\\begin{document}\nXin chào \\textbf{nghiên cứu}. % hidden words\n\\cite{secret_ref} $x + y$ \\begin{thebibliography}{9}Should not count\\end{thebibliography}\n\\end{document}Ignored after end"));
    expect(f.result("main.tex").totalWords).toBe(4); expect(f.result("refs.bib").totalWords).toBe(0);
    expect(proseMask("😀 chào \\ref{abc}", "main.tex").length).toBe("😀 chào \\ref{abc}".length);
  });
  it("handles concurrent Yjs clients and deterministic rounding independent of span order", () => {
    const base = fixture(), a = new Y.Doc(), b = new Y.Doc();
    a.getText("source").insert(0, "alpha "); b.getText("source").insert(0, "beta ");
    const before = new Y.Doc();
    Y.applyUpdate(base.doc, Y.encodeStateAsUpdate(a)); base.spans.push(...captureWritingSpans(before, base.doc, alice));
    Y.applyUpdate(before, Y.encodeStateAsUpdate(base.doc));
    Y.applyUpdate(base.doc, Y.encodeStateAsUpdate(b)); base.spans.push(...captureWritingSpans(before, base.doc, bob));
    const result = base.result(); base.spans.reverse();
    expect(base.result()).toEqual(result); expect(result.members.map(m => m.suggestedBasisPoints)).toEqual([5000, 5000]);
  });
  it("only follows literal included files once and excludes unused drafts", () => {
    const manifest = { mainFileId: "main", files: [{ id: "main", kind: "TEXT", path: "main.tex", text: "\\input{sections/method} \\include{sections/method} % \\input{unused}" }, { id: "method", kind: "TEXT", path: "sections/method.tex", text: "\\input{main}" }, { id: "unused", kind: "TEXT", path: "unused.tex", text: "Unused content" }] } as ManuscriptManifest;
    expect(includedWritingFiles(manifest).map(f => f.id)).toEqual(["main", "method"]);
  });
  it("ignores file references inside examples, comments, math and after the document ends", () => {
    const manifest = { mainFileId: "main", files: [
      { id: "main", kind: "TEXT", path: "main.tex", text: "\\begin{document}\n\\verb|\\input{unused}|\n\\begin{verbatim}\\input{unused}\\end{verbatim}\n% \\input{unused}\n$\\input{unused}$\n\\input{method}\n\\end{document}\\input{unused}" },
      { id: "method", kind: "TEXT", path: "method.tex", text: "Actual prose" },
      { id: "unused", kind: "TEXT", path: "unused.tex", text: "Words from a file shown only as a source example" },
    ] } as ManuscriptManifest;
    expect(includedWritingFiles(manifest).map(f => f.id)).toEqual(["main", "method"]);
  });
  it("keeps oversized ambiguous replacements conservative instead of reclaiming old text", () => {
    const initial = Array.from({ length: 600 }, (_, i) => `old${i}`).join(" ");
    const f = fixture(initial);
    f.edit(bob, text => { text.delete(0, text.length); text.insert(0, Array.from({ length: 600 }, (_, i) => `new${i}`).join(" ")); });
    expect(f.result().attributedWordUnits).toBe(0); expect(f.result().unknownWordUnits).toBe(600000);
  });
});
