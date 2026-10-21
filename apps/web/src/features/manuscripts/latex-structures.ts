import { escapeProse } from "./latex-visual";

export type PlainTable = { align: string; rows: string[][]; layout?: { before: string; after: string; columnSpec: string; rules: string[][] } };
export function serializeTable(table: PlainTable) {
  if (!/^[lcr]{1,8}$/.test(table.align) || table.rows.length < 1 || table.rows.length > 20 || table.rows.some(row => row.length !== table.align.length || row.some(cell => cell.length > 500 || /[\r\n]/.test(cell)))) throw new Error("TABLE_LIMIT");
  const layout = table.layout, originalColumns = layout?.columnSpec.replace(/\|/g, "");
  // Keep rules, float placement, caption and label around edited cells.
  const spec = layout && originalColumns?.length === table.align.length ? (() => { let index = 0; return layout.columnSpec.replace(/[lcr]/g, () => table.align[index++]!); })() : table.align;
  const rules = Array.from({ length: table.rows.length + 1 }, () => [] as string[]);
  for (let i = 0; i < (layout?.rules.length ?? 0); i++) rules[Math.min(i, table.rows.length)]!.push(...layout!.rules[i]!);
  const body = table.rows.flatMap((row, index) => [...rules[index]!, row.map(escapeProse).join(" & ") + " \\\\"]);
  return `${layout?.before ?? ""}\\begin{tabular}{${spec}}\n${[...body, ...rules[table.rows.length]!].join("\n")}\n\\end{tabular}${layout?.after ?? ""}`;
}
function plainCell(source: string) {
  let output = "";
  const tokens = /\\(?:[%$&#_{}]|textbackslash\{\}|textasciicircum\{\}|textasciitilde\{\})|[^\\{}%$&#_^~]+/gy;
  let offset = 0;
  while (offset < source.length) {
    tokens.lastIndex = offset; const match = tokens.exec(source);
    if (!match) return null;
    const token = match[0];
    output += token.startsWith("\\text") ? ({ "\\textbackslash{}": "\\", "\\textasciicircum{}": "^", "\\textasciitilde{}": "~" })[token]! : token.startsWith("\\") ? token.slice(1) : token;
    offset += token.length;
  }
  return output;
}
/** No macros, nested environments, spanning cells or formatting are rewritten. */
export function parseTable(source: string): PlainTable | null {
  if (source.length > 100000) return null;
  let inner = source.trim(), before = "", after = "";
  const float = inner.match(/^\\begin\{(table\*?)\}(?:\[[!htbpH]*\])?\s*([\s\S]*?)\\end\{\1\}$/);
  if (float) {
    const start = inner.indexOf("\\begin{tabular}"), end = inner.indexOf("\\end{tabular}") + "\\end{tabular}".length;
    if (start < 0 || end <= start) return null;
    before = inner.slice(0, start); after = inner.slice(end);
    const outer = before.replace(/^\\begin\{table\*?\}(?:\[[!htbpH]*\])?/, "") + after.replace(/\\end\{table\*?\}$/, "");
    if (outer.replace(/\\centering\b|\\caption\{[^{}%]*\}|\\label\{[A-Za-z0-9_:.-]+\}|\s+/g, "")) return null;
    inner = inner.slice(start, end);
  }
  const match = inner.match(/^\\begin\{tabular\}\{([|lcr]+)\}\s*([\s\S]*?)\s*\\end\{tabular\}$/);
  if (!match) return null;
  const align = match[1]!.replace(/\|/g, ""); if (!/^[lcr]{1,8}$/.test(align)) return null;
  // Escaped ampersands and escaped backslashes must not become delimiters.
  const rows: string[][] = [[]], rules: string[][] = [[]]; let cell = "", index = 0;
  const finish = () => { const value = plainCell(cell.trim()); if (value === null || value.length > 500) return false; rows.at(-1)!.push(value); cell = ""; return true; };
  const body = match[2]!;
  while (index < body.length) {
    if (body.startsWith("\\\\", index)) { if (!finish()) return null; rows.push([]); rules.push([]); index += 2; continue; }
    const rule = body.slice(index).match(/^\\(?:toprule|midrule|bottomrule|hline)\b/);
    if (rule) { if (cell.trim() || rows.at(-1)!.length) return null; rules.at(-1)!.push(rule[0]); cell = ""; index += rule[0].length; continue; }
    if (body[index] === "\\") { const token = body.slice(index).match(/^\\(?:[%$&#_{}]|textbackslash\{\}|textasciicircum\{\}|textasciitilde\{\})/); if (!token) return null; cell += token[0]; index += token[0].length; continue; }
    if (body[index] === "&") { if (!finish()) return null; index++; continue; }
    cell += body[index++];
  }
  if (cell.trim() || rows.at(-1)!.length) { if (!finish()) return null; } else rows.pop();
  if (!rows.length || rows.length > 20 || rows.some(row => row.length !== align.length || row.some(value => /[\r\n]/.test(value)))) return null;
  return { align, rows, ...(before || after || match[1]!.includes("|") || rules.some(row => row.length) ? { layout: { before, after, columnSpec: match[1]!, rules } } : {}) };
}
export function equationBody(source: string) {
  return source.trim().match(/^\\\[([\s\S]*)\\\]$/)?.[1]?.trim() ?? source.trim().match(/^\\begin\{(equation\*?)\}([\s\S]*)\\end\{\1\}$/)?.[2]?.trim() ?? null;
}
export function structureAt(source: string, from: number, to: number, kind: "table" | "equation") {
  if (kind === "table") for (const match of source.matchAll(/\\begin\{(table\*?)\}[\s\S]*?\\end\{\1\}/g)) {
    if (match.index <= from && match.index + match[0].length >= to && parseTable(match[0])) return { from: match.index, to: match.index + match[0].length };
  }
  const pattern = kind === "table" ? /\\begin\{tabular\}\{[|lcr]+\}[\s\S]*?\\end\{tabular\}/g : /\\\[[\s\S]*?\\\]|\\begin\{equation\*?\}[\s\S]*?\\end\{equation\*?\}/g;
  for (const match of source.matchAll(pattern)) {
    if (match.index <= from && match.index + match[0].length >= to) return { from: match.index, to: match.index + match[0].length };
  }
  return { from, to };
}
