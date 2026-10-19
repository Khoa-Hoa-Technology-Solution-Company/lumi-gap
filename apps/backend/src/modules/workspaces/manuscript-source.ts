import * as Y from "yjs";
import { createHash } from "node:crypto";
import type { ManuscriptTemplate } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";

export const hashBytes = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
export const MAX_TEXT_BYTES = 500_000;
export const MAX_CRDT_BYTES = 2_000_000;
export function manuscriptPath(path: string, kind: "TEXT" | "ASSET" | "FOLDER") {
  if (path.length > 240 || !path || path.split("/").some(part => !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part) || part === "." || part === ".." || part.length > 100)) throw AppError.badRequest("Invalid manuscript path");
  if (kind === "TEXT" && !/\.(tex|bib|txt|sty)$/.test(path)) throw AppError.badRequest("Use a .tex, .bib, .txt or .sty source file");
  if (kind === "ASSET" && !/\.(png|jpg|jpeg|webp)$/.test(path)) throw AppError.badRequest("Use a PNG, JPEG or WebP image");
  return path;
}
export function sourceDocument(bytes?: Uint8Array | null) {
  const doc = new Y.Doc();
  doc.getText("source");
  if (bytes) Y.applyUpdate(doc, bytes);
  return doc;
}
export function sourceState(text: string) {
  if (Buffer.byteLength(text, "utf8") > MAX_TEXT_BYTES) throw AppError.badRequest("Source file is too large");
  const doc = sourceDocument();
  doc.getText("source").insert(0, text);
  const state = validateDocument(doc); doc.destroy(); return state;
}
export function sourceText(state: Uint8Array) {
  const doc = sourceDocument(state); const text = doc.getText("source").toString(); doc.destroy(); return text;
}
export function validateDocument(doc: Y.Doc) {
  // A receipt must not acknowledge update bytes whose causal dependencies are absent.
  if (doc.store.pendingStructs || doc.store.pendingDs) throw AppError.conflict("Missing CRDT dependencies; reconnect and synchronize before retrying");
  if (doc.share.size !== 1 || !doc.share.has("source") || !(doc.share.get("source") instanceof Y.Text)) throw AppError.badRequest("Only the canonical source text may be edited");
  const text = doc.getText("source");
  if (text.toDelta().some((part: { insert?: unknown; attributes?: unknown }) => typeof part.insert !== "string" || part.attributes)) throw AppError.badRequest("Source documents contain plain text only");
  if (Buffer.byteLength(text.toString(), "utf8") > MAX_TEXT_BYTES) throw AppError.badRequest("Source file is too large");
  const state = Y.encodeStateAsUpdate(doc);
  if (state.byteLength > MAX_CRDT_BYTES) throw AppError.badRequest("Collaborative history exceeds the file limit; create a new manuscript from a snapshot");
  return new Uint8Array(state);
}
export function texEscape(value: string) {
  return value.replace(/[\\{}%$&#_^~]/g, c => ({ "\\": "\\textbackslash{}", "{": "\\{", "}": "\\}", "%": "\\%", "$": "\\$", "&": "\\&", "#": "\\#", "_": "\\_", "^": "\\textasciicircum{}", "~": "\\textasciitilde{}" })[c]!);
}
export function manuscriptTemplate(title: string, template: ManuscriptTemplate) {
  const sections = template === "PROPOSAL" ? ["Research problem", "Research questions", "Methodology", "Research plan"] : template === "REPORT" ? ["Introduction", "Methodology", "Results", "Conclusion"] : ["Introduction", "Related work", "Methodology", "Results", "Conclusion"];
  const files = sections.map(name => ({ path: `sections/${name.toLowerCase().replaceAll(" ", "_")}.tex`, text: `\\section{${name}}\n% Write your research here.\n` }));
  return [{ path: "main.tex", text: `\\documentclass[11pt]{${template === "REPORT" ? "report" : "article"}}\n\\usepackage[utf8]{inputenc}\n\\usepackage[T1]{fontenc}\n\\usepackage{lmodern}\n\\usepackage{graphicx}\n\\usepackage{hyperref}\n\\title{${texEscape(title)}}\n\\author{}\n\\date{}\n\\begin{document}\n\\maketitle\n${files.map(file => `\\input{${file.path}}`).join("\n")}\n\\bibliographystyle{plain}\n\\bibliography{references}\n\\end{document}\n` }, ...files, { path: "references.bib", text: "% Add references from the project literature panel or edit BibTeX here.\n" }];
}
export function citationKey(paper: { id: string; publicationYear: number }, authors: string[]) {
  const name = (authors[0] ?? "reference").normalize("NFKD").replace(/[^a-zA-Z]/g, "").slice(0, 20).toLowerCase() || "reference";
  return `${name}${paper.publicationYear || "nd"}_${paper.id.replaceAll("-", "").slice(0, 10)}`;
}
export function bibtexEntry(paper: { title: string; publicationYear: number; doi: string | null; journalName: string | null }, authors: string[], key: string) {
  const fields = [`  title = {${texEscape(paper.title)}}`, ...(authors.length ? [`  author = {${authors.map(texEscape).join(" and ")}}`] : []), ...(paper.publicationYear ? [`  year = {${paper.publicationYear}}`] : []), ...(paper.doi ? [`  doi = {${texEscape(paper.doi)}}`] : []), ...(paper.journalName ? [`  journal = {${texEscape(paper.journalName)}}`] : [])];
  return `@article{${key},\n${fields.join(",\n")}\n}\n`;
}
