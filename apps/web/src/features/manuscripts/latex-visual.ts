import type { JSONContent } from "@tiptap/core";

export interface VisualBlock { from: number; to: number; source: string; kind: "paragraph" | "heading" | "source"; level?: number; command?: string; content?: JSONContent[] }
const escaped: Record<string, string> = { "\\": "\\textbackslash{}", "{": "\\{", "}": "\\}", "%": "\\%", "$": "\\$", "&": "\\&", "#": "\\#", "_": "\\_", "^": "\\textasciicircum{}", "~": "\\textasciitilde{}" };
const marks: Record<string, string> = { textbf: "bold", textit: "italic", emph: "latexEmphasis" };
export const escapeProse = (text: string) => text.replace(/[\\{}%$&#_^~]/g, char => escaped[char]!);
/** Deliberately conservative: unsupported TeX stays an untouched source block. */
export function parseVisualInline(source: string, nesting = 0): JSONContent[] | null {
  if (nesting > 16) return null;
  const result: JSONContent[] = [];
  let text = "", position = 0;
  const flush = () => { if (text) result.push({ type: "text", text }); text = ""; };
  while (position < source.length) {
    const rest = source.slice(position), char = source[position]!;
    if (char === "\\") {
      const simple = rest.match(/^\\([%$&#_{}])/);
      if (simple) { text += simple[1]; position += simple[0].length; continue; }
      const escapedChar = rest.match(/^\\(textbackslash|textasciicircum|textasciitilde)\{\}/);
      if (escapedChar) { text += ({ textbackslash: "\\", textasciicircum: "^", textasciitilde: "~" })[escapedChar[1] as "textbackslash"]; position += escapedChar[0].length; continue; }
      const token = rest.match(/^\\(?:[A-Za-z]*cite\*?(?:\[[^\]\n]*\]){0,2}|(?:eqref|ref|label))\{[A-Za-z0-9_:., /-]+\}/);
      if (token) { flush(); result.push({ type: "latexToken", attrs: { source: token[0] } }); position += token[0].length; continue; }
      const mark = rest.match(/^\\(textbf|textit|emph)\{/);
      if (!mark) return null;
      let end = position + mark[0].length, depth = 1;
      for (; end < source.length && depth; end++) { if (source[end] === "\\") { end++; continue; } if (source[end] === "{") depth++; if (source[end] === "}") depth--; }
      if (depth) return null;
      const nested = parseVisualInline(source.slice(position + mark[0].length, end - 1), nesting + 1);
      if (!nested || nested.some(node => node.type === "hardBreak")) return null;
      flush(); result.push(...nested.map(node => ({ ...node, marks: [...(node.marks ?? []), { type: marks[mark[1]!]! }] }))); position = end; continue;
    }
    if (char === "$" && source[position + 1] !== "$") {
      let end = position + 1;
      for (; end < source.length; end++) { if (source[end] === "\\") { end++; continue; } if (source[end] === "$") break; }
      if (end >= source.length || source.slice(position, end).includes("\n")) return null;
      flush(); result.push({ type: "latexToken", attrs: { source: source.slice(position, end + 1) } }); position = end + 1; continue;
    }
    if (/[{}%$&#_^~]/.test(char)) return null;
    if (char === "\n") { flush(); result.push({ type: "hardBreak" }); } else text += char;
    position++;
  }
  flush(); return result;
}
export function serializeVisualInline(content: JSONContent[]): string {
  return content.map(node => {
    if (node.type === "hardBreak") return "\n";
    let source = node.type === "latexToken" ? String(node.attrs?.source ?? "") : escapeProse(node.text ?? "");
    for (const mark of node.marks ?? []) { if (mark.type === "bold") source = `\\textbf{${source}}`; if (mark.type === "italic") source = `\\textit{${source}}`; if (mark.type === "latexEmphasis") source = `\\emph{${source}}`; }
    return source;
  }).join("");
}
export function visualBlocks(source: string): VisualBlock[] {
  const blocks: VisualBlock[] = [];
  const append = (from: number, to: number, protectedSource = false) => {
    const text = source.slice(from, to).replace(/\r?\n$/, ""); to = from + text.length;
    if (!text.trim()) return;
    const heading = text.match(/^\\(section|subsection|subsubsection)\*?\{([^{}\n]*)\}$/);
    const content = protectedSource ? null : parseVisualInline(heading ? heading[2]! : text);
    const level = heading ? ["section", "subsection", "subsubsection"].indexOf(heading[1]!) + 1 : undefined;
    blocks.push({ from, to: from + text.length, source: text, kind: !content ? "source" : heading ? "heading" : "paragraph", ...(content ? { content } : {}), ...(heading ? { level, command: text.slice(0, text.indexOf("{")) } : {}) });
  };
  const lines = [...source.matchAll(/[^\n]*(?:\n|$)/g)].filter(line => line[0]);
  let start = 0, end = 0;
  const flush = () => { if (end > start) append(start, end); start = end; };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!, text = line[0], from = line.index!;
    if (!text.trim()) { flush(); start = end = from + text.length; continue; }
    if (/^\s*(?:\\\[|\$\$)/.test(text)) {
      flush(); let last = index;
      const closing = text.includes("\\[") ? /\\\]/ : /\$\$/;
      const afterOpening = text.replace(/^\s*(?:\\\[|\$\$)/, "");
      if (!closing.test(afterOpening)) { for (last = index + 1; last < lines.length; last++) if (closing.test(lines[last]![0])) break; }
      const final = lines[Math.min(last, lines.length - 1)]!;
      append(from, final.index! + final[0].length, true); index = Math.min(last, lines.length - 1); start = end = final.index! + final[0].length; continue;
    }
    if (/^\s*\\begin\{(?!document\})/.test(text)) {
      flush(); let depth = 0, last = index;
      for (; last < lines.length; last++) {
        for (const command of lines[last]![0].matchAll(/\\(begin|end)\{[^}]+\}/g)) depth += command[1] === "begin" ? 1 : -1;
        if (depth <= 0) break;
      }
      const final = lines[Math.min(last, lines.length - 1)]!;
      append(from, final.index! + final[0].length, true); index = Math.min(last, lines.length - 1); start = end = final.index! + final[0].length; continue;
    }
    const heading = /^\\(?:section|subsection|subsubsection)\*?\{[^{}\n]*\}\s*$/.test(text);
    if (heading || /^\s*(?:%|\\(?:documentclass|usepackage|title|author|date|begin|end|newpage|clearpage|maketitle|tableofcontents|input|include|bibliography|bibliographystyle|renewcommand|newcommand|\[|\]))/.test(text)) {
      flush(); append(from, from + text.length, !heading); start = end = from + text.length; continue;
    }
    if (end === start) start = from;
    end = from + text.length;
  }
  flush();
  return blocks;
}
export function serializeVisualBlock(block: VisualBlock, document: JSONContent): string {
  const tokens = (nodes: JSONContent[]): string[] => nodes.flatMap(node => node.type === "latexToken" ? [String(node.attrs?.source ?? "")] : tokens(node.content ?? []));
  if (JSON.stringify(tokens(block.content ?? [])) !== JSON.stringify(tokens(document.content ?? []))) throw new Error("Protected LaTeX changed; edit it in Source");
  const paragraphs = (document.content ?? []).map(node => serializeVisualInline(node.content ?? []));
  if (block.kind === "heading") return `${block.command}{${paragraphs.join(" ")}}`;
  return paragraphs.join("\n\n");
}
