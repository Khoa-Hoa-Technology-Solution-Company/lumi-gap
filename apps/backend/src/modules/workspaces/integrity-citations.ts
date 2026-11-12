import path from "node:path";
import type { ManuscriptManifest, IntegrityCitationAudit, CitationFinding, CitationSourceEvidence } from "@trend/shared-types";
import { createHash } from "node:crypto";
import { normalizeProjectDoi } from "../projects/project-paper-identity.js";

export const integrityDigest = (value: unknown): string => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, canonical(item)]));
  return value;
}
// A bounded lexical analysis, never a TeX interpreter. Mask literals while retaining line offsets.
export function citationSource(text: string) {
  return text.replace(/\\begin\{(verbatim\*?|lstlisting|minted|comment)\}[\s\S]*?\\end\{\1\}|\\verb\*?([^\w\s])[^\n]*?\2|\\%|%[^\n]*/g,
    token => token === "\\%" ? token : token.replace(/[^\n]/g, " "));
}
type Entry = { key: string; file: string; title?: string; author?: string; year?: string; doi?: string };
export type CitationMetadata = CitationSourceEvidence;
/** Crossref update-to belongs to the notice, not the affected original work. Only updated-by is evidence here.
 * https://www.crossref.org/documentation/register-maintain-records/maintaining-your-metadata/registering-updates/
 */
export function providerCitationStatus(provider: string, raw: Record<string, unknown>): Pick<CitationMetadata, "status" | "statusNoticeDoi"> {
  if (provider === "openalex" && raw.is_retracted === true) return { status: "RETRACTED" };
  const notices: Array<{ type: string; doi: string }> = [];
  if (provider === "crossref" && Array.isArray(raw["updated-by"])) for (const item of raw["updated-by"].slice(0, 20)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const notice = item as Record<string, unknown>;
    const doi = typeof notice.DOI === "string" ? normalizeProjectDoi(notice.DOI) : undefined;
    if (doi && /^10\.\d{4,9}\/[^\s<>"{}]+$/i.test(doi) && ["retraction", "correction"].includes(String(notice.type))) notices.push({ type: String(notice.type), doi });
  }
  const notice = notices.find(notice => notice.type === "retraction") ?? notices.find(notice => notice.type === "correction");
  if (notice) return { status: notice.type === "retraction" ? "RETRACTED" : "CORRECTED", statusNoticeDoi: notice.doi };
  return { status: "UNKNOWN" };
}
function group(text: string, start: number, open = "{", close = "}") {
  let depth = 1, index = start + 1, quoted = false;
  for (; index < text.length && depth; index++) {
    const c = text[index];
    if (c === "\\") { index++; continue; }
    if (open === "(" && c === '"') quoted = !quoted;
    if (!quoted && c === open) depth++;
    if (!quoted && c === close) depth--;
  }
  return { value: text.slice(start + 1, depth ? text.length : index - 1), end: index, complete: depth === 0 };
}
function fields(body: string): Record<string, string> {
  const result: Record<string, string> = {}; let index = 0;
  while (index < body.length) {
    const match = /^\s*,?\s*([\w-]+)\s*=\s*/.exec(body.slice(index));
    if (!match) break;
    index += match[0].length; let value = "";
    if (body[index] === "{") { const next = group(body, index); value = next.value; index = next.end; }
    else if (body[index] === '"') {
      const start = ++index;
      while (index < body.length && (body[index] !== '"' || body[index - 1] === "\\")) index++;
      value = body.slice(start, index++);
    } else { const start = index; while (index < body.length && body[index] !== ",") index++; value = body.slice(start, index).trim(); }
    result[match[1]!.toLowerCase()] = value;
    if (/^\s*#/.test(body.slice(index))) break; // BibTeX string concatenation requires manual review.
  }
  return result;
}
export function analyzeSnapshotCitations(manifest: ManuscriptManifest, metadata: CitationMetadata[] = []): IntegrityCitationAudit {
  const findings: CitationFinding[] = [], entries: Entry[] = [], visited = new Set<string>(), bibs = new Set<string>(), keys = new Set<string>();
  const files = new Map(manifest.files.filter(file => file.kind === "TEXT").map(file => [file.path, file]));
  let findingLimitReported = false;
  const add = (code: string, message: string, file?: string, key?: string) => {
    if (findings.length < 1000) findings.push({ code, message, ...(file ? { file } : {}), ...(key ? { key } : {}) });
    else if (!findingLimitReported) {
      findings[999] = { code: "ANALYSIS_LIMIT", message: "Finding limit exceeded; the audit is incomplete." };
      findingLimitReported = true;
    }
  };
  const result = (rows: IntegrityCitationAudit["entries"]): IntegrityCitationAudit => ({ algorithm: "LATEX_CITATIONS_V1", files: [...visited].sort(), citedKeys: [...keys].sort(), entries: rows, findings, metadataDigest: integrityDigest(metadata), claimSupport: "NOT_REVIEWED" });
  if (files.size > 200 || [...files.values()].reduce((size, file) => size + Buffer.byteLength(file.text ?? ""), 0) > 2_000_000) {
    add("ANALYSIS_LIMIT", "The saved source exceeds the bounded citation analyzer. Review references manually."); return result([]);
  }
  const main = manifest.files.find(file => file.id === manifest.mainFileId);
  if (!main || main.kind !== "TEXT") { add("MAIN_FILE_UNAVAILABLE", "The snapshot has no readable main LaTeX file."); return result([]); }
  const resolve = (from: string, name: string, ext: string) => {
    if (/[\\{}#]|^[a-z]+:|^\//i.test(name)) return undefined;
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(from), name.trim()));
    if (target.startsWith("../") || target === "..") return undefined;
    return files.has(target) ? target : files.has(`${target}${ext}`) ? `${target}${ext}` : undefined;
  };
  const visit = (filename: string) => {
    if (visited.has(filename)) return;
    visited.add(filename);
    const text = citationSource(files.get(filename)?.text ?? "").split(/\\end\s*\{document\}/)[0]!;
    for (const input of text.matchAll(/\\(input|include|subfile|bibliography|addbibresource)\s*(?:\[[^\]]*\]\s*)?\{([^{}]*)\}/g)) {
      const bibliography = ["bibliography", "addbibresource"].includes(input[1]!);
      for (const name of input[2]!.split(",")) {
        const target = resolve(filename, name, bibliography ? ".bib" : ".tex");
        if (!target) { add(bibliography ? "BIBLIOGRAPHY_UNAVAILABLE" : "INPUT_UNAVAILABLE", "A static source or bibliography reference cannot be resolved in this snapshot.", filename); continue; }
        if (bibliography) bibs.add(target); else visit(target);
      }
    }
    for (const command of text.matchAll(/\\([A-Za-z]*cite[A-Za-z]*|nocite)\*?\s*((?:(?:\[[^\]]*\]\s*){0,2}\{[^{}]+\}\s*)+)/g)) {
      const groups = [...command[2]!.matchAll(/\{([^{}]+)\}/g)];
      for (const key of (command[1]!.endsWith("cites") ? groups : groups.slice(0, 1)).flatMap(group => group[1]!.split(",")).map(value => value.trim()).filter(Boolean)) {
        if (key === "*") continue;
        if (/[#\\]/.test(key)) { add("DYNAMIC_TEX", "A dynamic citation key cannot be resolved lexically.", filename); continue; }
        if (keys.size >= 5000) { add("ANALYSIS_LIMIT", "Citation key limit exceeded; the audit is incomplete.", filename); break; }
        keys.add(key);
      }
    }
    for (const inline of text.matchAll(/\\bibitem\s*(?:\[[^\]]*\]\s*)?\{([^{}]+)\}/g)) {
      if (entries.length >= 2000) { add("ANALYSIS_LIMIT", "Bibliography entry limit exceeded; the audit is incomplete.", filename); break; }
      entries.push({ key: inline[1]!.trim(), file: filename });
    }
    if (/\\(?:def|edef|newcommand|renewcommand|includeonly)\b/.test(text)) add("DYNAMIC_TEX", "Custom TeX commands or conditional includes may require manual citation review.", filename);
  };
  visit(main.path);
  for (const filename of bibs) {
    visited.add(filename);
    const text = citationSource(files.get(filename)?.text ?? ""); const start = /@([A-Za-z]+)\s*([{(])/g; let match: RegExpExecArray | null;
    while ((match = start.exec(text))) {
      const block = group(text, start.lastIndex - 1, match[2], match[2] === "(" ? ")" : "}"); start.lastIndex = block.end;
      if (["comment", "preamble", "string"].includes(match[1]!.toLowerCase())) { if (match[1]!.toLowerCase() === "string") add("BIBTEX_MACRO", "Bibliography string macros require manual verification.", filename); continue; }
      if (!block.complete) add("BIBLIOGRAPHY_SYNTAX", "An unclosed bibliography entry requires review.", filename);
      const comma = block.value.indexOf(","); if (comma < 0) { add("BIBLIOGRAPHY_SYNTAX", "A bibliography entry has no field separator.", filename); continue; }
      const key = block.value.slice(0, comma).trim(), data = fields(block.value.slice(comma + 1));
      if (entries.length >= 2000) { add("ANALYSIS_LIMIT", "Bibliography entry limit exceeded; the audit is incomplete.", filename); break; }
      entries.push({ key, file: filename, ...Object.fromEntries(["title", "author", "year", "doi"].flatMap(field => data[field] ? [[field, data[field]]] : [])) });
    }
  }
  const counts = new Map<string, number>(); for (const entry of entries) counts.set(entry.key, (counts.get(entry.key) ?? 0) + 1);
  for (const key of keys) if (!counts.has(key)) add("UNDEFINED_CITATION", "A cited key has no bibliography entry in the reachable snapshot files.", undefined, key);
  const normalizeTitle = (title: string) => title.normalize("NFKD").replace(/\\[a-zA-Z]+/g, "").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
  const rows = entries.map(entry => {
    if (counts.get(entry.key)! > 1) add("DUPLICATE_IDENTIFIER", "The bibliography identifier occurs more than once; it may resolve ambiguously.", entry.file, entry.key);
    const incomplete = !entry.title || !entry.author || !/^\d{4}$/.test(entry.year ?? "");
    if (incomplete) add("INCOMPLETE_METADATA", "Title, author or publication year is missing or cannot be interpreted safely.", entry.file, entry.key);
    const doi = entry.doi ? normalizeProjectDoi(entry.doi) : undefined;
    const validDoi = Boolean(doi && /^10\.\d{4,9}\/[^\s<>"{}]+$/i.test(doi));
    if (doi && !validDoi) add("DOI_FORMAT", "The DOI does not match the supported DOI format.", entry.file, entry.key);
    const evidence = validDoi ? metadata.find(item => normalizeProjectDoi(item.doi) === doi) : undefined;
    let verified = false;
    const verifiedFields: string[] = [];
    if (evidence) {
      const names = (values: string[]) => values.map(value => (value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).sort().join(" ")).sort();
      const authorMismatch = evidence.authors?.length && entry.author && JSON.stringify(names(entry.author.split(/\s+and\s+/i))) !== JSON.stringify(names(evidence.authors));
      if (entry.title && normalizeTitle(entry.title) === normalizeTitle(evidence.title)) verifiedFields.push("title");
      if (entry.year && Number(entry.year) === evidence.year) verifiedFields.push("year");
      if (evidence.authors?.length && entry.author && !authorMismatch) verifiedFields.push("authors");
      verified = !incomplete && verifiedFields.includes("title") && verifiedFields.includes("year") && !authorMismatch;
      if (incomplete || !verifiedFields.includes("title") || !verifiedFields.includes("year")) add("DOI_METADATA_MISMATCH", "The DOI resolves to stored provider metadata with a different title/year or incomplete entry. Check the original source.", entry.file, entry.key);
      if (authorMismatch) add("AUTHOR_METADATA_MISMATCH", "The bibliography author names differ from available provider metadata. Check spelling, initials and the original source.", entry.file, entry.key);
      if (evidence.status !== "UNKNOWN") add(`SOURCE_${evidence.status}`, "Stored provider evidence reports a source status warning. Review the source and its correction or retraction notice.", entry.file, entry.key);
      else add("SOURCE_STATUS_UNAVAILABLE", "The available records do not establish a complete correction or retraction status. Check the source manually.", entry.file, entry.key);
    } else add("UNABLE_TO_VERIFY", "No authorized cached provider metadata is available for this reference. This is not a finding of misconduct.", entry.file, entry.key);
    return { ...entry, verifiedFields, identity: evidence ? "CONFIRMED" as const : "UNAVAILABLE" as const, metadata: verified ? "VERIFIED" as const : evidence ? "NEEDS_REVIEW" as const : "UNAVAILABLE" as const, ...(evidence ? { evidence } : {}) };
  });
  return result(rows);
}
