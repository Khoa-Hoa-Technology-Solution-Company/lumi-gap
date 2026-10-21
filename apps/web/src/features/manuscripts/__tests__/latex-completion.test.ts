import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { expect, it } from "vitest";
import { completeLatex } from "../latex-completion";
const complete = (doc: string) => completeLatex(new CompletionContext(EditorState.create({ doc }), doc.length, false), ["known2026"], ["main.tex", "sections/intro.tex", "figures/chart.pdf", "refs.bib"]);
it("completes citation keys, labels, files, classes, environments and installed package names", () => {
  expect(complete("\\parencite{first,kn")?.options.map(option => option.label)).toEqual(["known2026"]);
  expect(complete("\\label{sec:intro}\nSee \\ref{sec:")?.options.map(option => option.label)).toEqual(["sec:intro"]);
  expect(complete("\\includegraphics{fig")?.options.map(option => option.label)).toEqual(["figures/chart.pdf"]);
  expect(complete("\\begin{ali")?.options.map(option => option.label)).toContain("align");
  expect(complete("\\usepackage{bib")?.options.map(option => option.label)).toContain("biblatex");
  expect(complete("\\documentclass{IE")?.options.map(option => option.label)).toContain("IEEEtran");
  expect(complete("\\input{sect")?.options.map(option => option.label)).toContain("sections/intro.tex");
});
it("offers structured snippets without replacing text outside the current command", () => {
  const result = complete("Earlier text \\fig");
  expect(result?.from).toBe(14);
  expect(result?.options.find(option => option.label === "figure")?.apply).toBeTypeOf("function");
  expect(complete("Ordinary prose")).toBeNull();
});
