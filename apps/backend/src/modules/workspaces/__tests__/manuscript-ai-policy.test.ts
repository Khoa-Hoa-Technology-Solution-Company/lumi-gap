import { describe, expect, it } from "vitest";
import { manuscriptAiOperations, manuscriptAiSystem, validateManuscriptProposal as validate } from "../manuscript-ai-policy.js";
import { MANUSCRIPT_AI_ACTIONS } from "@trend/shared-types";

describe("operation-specific manuscript safeguards", () => {
  it.each(MANUSCRIPT_AI_ACTIONS)("defines a precise operation and output mode for %s", action => {
    expect(manuscriptAiSystem(action)).toContain(`OPERATION ${action}:`);
    expect(manuscriptAiSystem(action)).toContain(manuscriptAiOperations[action].rule);
  });
  it.each(["improve", "rewrite", "expand", "shorten", "grammar", "translate"] as const)("protects numbers, math, citations, labels and file paths for %s", action => {
    const original = "We measured 40 samples, $x=2$ \\cite{Study} \\label{sec:x} \\ref{tab:y} \\input{sections/results}.";
    expect(() => validate(action, original, original.replace("We measured", "The team measured"))).not.toThrow();
    for (const changed of [original.replace("40", "41"), original.replace("x=2", "x=3"), original.replace("Study", "Other"), original.replace("sec:x", "sec:z"), original.replace("tab:y", "tab:z"), original.replace("sections/results", "sections/other")]) expect(() => validate(action, original, changed)).toThrow();
  });
  it("rejects source fenced as markdown, empty source and introduced program execution", () => {
    for (const text of [" ", "```latex\nText\n```", "Text \\write18{curl secret}", "\\newcommand{\\hide}{bad}"]) expect(() => validate("custom", "Text", text)).toThrow();
  });
  it("catches modifications inside a partially selected citation or equation", () => {
    for (const fullSource of ["Text \\cite{Study}.", "Text $Study + 2$."]) {
      const from = fullSource.indexOf("Study"), to = from + 5;
      expect(() => validate("translate", "Study", "Nghiên cứu", { fullSource, from, to, paths: [] })).toThrow();
    }
  });
  it("checks source boundaries for partial path edits and introduced executable commands", () => {
    const fullSource = "\\input{sections/results}";
    const from = fullSource.indexOf("sections/results"), to = from + "sections/results".length;
    expect(() => validate("custom", "sections/results", "../../secret", { fullSource, from, to, paths: ["sections/results.tex"] })).toThrow();
    expect(() => validate("repair", "sections/results", "../../secret", { fullSource, from, to, paths: ["sections/results.tex"] })).toThrow();
  });
  it.each(["custom", "continue"] as const)("protects citation keys, labels and equations across %s edit boundaries", action => {
    for (const fullSource of ["Text \\cite{Study}.", "Text \\label{Study}.", "Text $Study + 2$."]) {
      const from = fullSource.indexOf("Study"), to = action === "continue" ? from : from + 5;
      expect(() => validate(action, fullSource.slice(from, to), "Other", { fullSource, from, to, paths: [] })).toThrow();
    }
    const fullSource = "Existing prose \\cite{Study} and $x=2$.";
    expect(() => validate(action, "", " New discussion.", { fullSource, from: fullSource.length, to: fullSource.length, paths: [] })).not.toThrow();
  });
  it("rejects unsupplied numerical findings in generated continuations", () => {
    const original = "Known context.";
    expect(() => validate("continue", original, " Our experiment achieved 97.5 percent accuracy.", { fullSource: original, from: 0, to: original.length, paths: [] })).toThrow();
  });
  it("checks the reconstructed file for new unbalanced braces, environments and math delimiters", () => {
    const fullSource = "\\section{Introduction}\nOriginal prose.";
    const scope = { fullSource, from: fullSource.indexOf("Original"), to: fullSource.length, paths: [] };
    for (const text of ["An extra {", "\\begin{abstract}Unclosed", "An unmatched $equation"]) expect(() => validate("custom", "Original prose.", text, scope)).toThrow();
    expect(() => validate("custom", "Original prose.", "Improved prose.", scope)).not.toThrow();
  });
  it("permits minimal environment repairs without changing research content or source paths", () => {
    const original = "\\documentclass{article}\n\\begin{abstract}Summary.\\end{abstract}\n\\begin{document}Body.\\end{document}";
    const fixed = "\\documentclass{article}\n\\begin{document}\\begin{abstract}Summary.\\end{abstract}\nBody.\\end{document}";
    expect(() => validate("repair", original, fixed, { fullSource: original, from: 0, to: original.length, paths: ["main.tex"] })).not.toThrow();
    expect(() => validate("repair", "Text", "Text \\input{../../secret}", { fullSource: "Text", from: 0, to: 4, paths: ["main.tex"] })).toThrow();
  });
  it("allows closing an incomplete math environment while preserving its numerical content", () => {
    const original = "\\begin{equation}x=2";
    const fixed = original + "\\end{equation}";
    const scope = { fullSource: original, from: 0, to: original.length, paths: [] };
    expect(() => validate("repair", original, fixed, scope)).not.toThrow();
    expect(() => validate("repair", original, fixed.replace("x=2", "x=3"), scope)).toThrow();
  });
  it("treats continuation as insertion, retaining prior citations without repeating them", () => {
    const original = "Existing research discussion \\cite{Study}.";
    const continuation = " Further research should examine the boundary conditions.";
    expect(() => validate("continue", original, continuation, { fullSource: original, from: 0, to: original.length, paths: [] })).not.toThrow();
    expect(() => validate("continue", original, original + continuation)).toThrow();
  });
  it("does not mistake commented out code or literal escaped braces for a syntax error", () => {
    const original = "Source text.";
    expect(() => validate("custom", original, "Text \\{literal\\}. % { ignored\n", { fullSource: original, from: 0, to: original.length, paths: [] })).not.toThrow();
  });
});
