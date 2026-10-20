import { expect, it } from "vitest";
import { escapeProse, parseVisualInline, serializeVisualBlock, serializeVisualInline, visualBlocks } from "../latex-visual";

it("round-trips supported prose without turning citation keys or math into editable text", () => {
  const original = "A \\textbf{strong} and \\textit{careful} claim \\cite{paper_2024}, $x_1 + y$ and 50\\%.";
  const nodes = parseVisualInline(original)!;
  expect(nodes.filter(node => node.type === "latexToken")).toHaveLength(2);
  expect(serializeVisualInline(nodes)).toBe(original);
});
it("preserves emphasis commands and separates headings without blank lines", () => {
  const prose = "An \\emph{important} distinction from \\textit{italic}.";
  expect(serializeVisualInline(parseVisualInline(prose)!)).toBe(prose);
  const source = `\\section{Introduction}\n${prose}\n\\subsection{Results}\nMore prose.\n`;
  const blocks = visualBlocks(source);
  expect(blocks.map(block => block.kind)).toEqual(["heading", "paragraph", "heading", "paragraph"]);
  for (const block of blocks) expect(source.slice(block.from, block.to)).toBe(block.source);
});
it("keeps multi-line display equations with blank lines entirely protected", () => {
  for (const equation of ["\\[\nx=2\n\ny=3\n\\]", "$$\nx=2\n\ny=3\n$$"]) {
    const blocks = visualBlocks(`Before.\n\n${equation}\n\nAfter.`);
    expect(blocks.map(block => block.kind)).toEqual(["paragraph", "source", "paragraph"]);
    expect(blocks[1]!.source).toBe(equation);
  }
});
it("refuses deletion or alteration of protected references and math", () => {
  const source = "A claim \\cite{paper} with $x_1$.";
  const block = visualBlocks(source)[0]!;
  expect(() => serializeVisualBlock(block, { content: [{ type: "paragraph", content: [{ type: "text", text: "A claim without the source." }] }] })).toThrow("Protected LaTeX changed");
  expect(() => serializeVisualBlock(block, { content: [{ type: "paragraph", content: block.content!.map(node => node.type === "latexToken" ? { ...node, attrs: { source: "$different$" } } : node) }] })).toThrow();
  expect(serializeVisualBlock(block, { content: [{ type: "paragraph", content: block.content }] })).toBe(source);
  expect(parseVisualInline("\\textbf{".repeat(30) + "deep" + "}".repeat(30))).toBeNull();
});
it("keeps arbitrary macros, comments and environments in source mode", () => {
  for (const source of ["\\begin{align}x&=2\\end{align}", "% comment", "\\newcommand{\\x}{test}", "\\unknown{test}", "$$x$$", "{group}", "\\textbf{unterminated"]) expect(parseVisualInline(source)).toBeNull();
});
it("edits only the addressed block and escapes newly typed LaTeX metacharacters", () => {
  const source = "\\documentclass{article}\n\n\\section{Introduction}\n\nFirst paragraph.\n\n\\begin{equation}\nx=2\n\\end{equation}";
  const blocks = visualBlocks(source), paragraph = blocks.find(block => block.source === "First paragraph.")!;
  const edited = serializeVisualBlock(paragraph, { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "50% & $20" }] }] });
  expect(edited).toBe("50\\% \\& \\$20");
  expect(source.slice(0, paragraph.from) + edited + source.slice(paragraph.to)).toContain("\\begin{equation}\nx=2\n\\end{equation}");
  const heading = blocks.find(block => block.kind === "heading")!;
  expect(serializeVisualBlock(heading, { content: [{ content: [{ type: "text", text: "New & revised" }] }] })).toBe("\\section{New \\& revised}");
  expect(escapeProse("\\%_{}")).toBe("\\textbackslash{}\\%\\_\\{\\}");
});
