import { unzipSync } from "fflate";
import sharp from "sharp";
import { AppError } from "../../common/exceptions/app-error.js";
import { manuscriptPath, MAX_TEXT_BYTES } from "./manuscript-source.js";

export type ImportedFile = { path: string; kind: "TEXT" | "ASSET"; bytes: Uint8Array; text?: string; mimeType?: string };
const textExtension = /\.(tex|bib|sty|cls|bst|txt|csv|tsv|dat|tikz|pgf|ist|bbx|cbx|lbx|def|cfg|fd)$/;
const assetExtension = /\.(png|jpg|jpeg|webp|pdf|svg|eps)$/;
const invalid = () => AppError.badRequest("Invalid ZIP. Use an unencrypted source ZIP (200 files, 20 MB extracted, 10 MB compressed).");
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
export function decodeSource(bytes: Uint8Array) {
  if (bytes.length > MAX_TEXT_BYTES) throw AppError.badRequest("Source file exceeds 500 KB");
  try { const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); if (text.includes("\0")) throw new Error(); return text; }
  catch { throw AppError.badRequest("Source files must contain UTF-8 text"); }
}

/** Inspect the central directory BEFORE allocating any decompressed payload.
 * No archive entry is ever extracted to the server filesystem. Reject ambiguous,
 * encrypted, duplicate, symlink and ZIP64 archives rather than guessing. */
export function readSourceZip(input: Uint8Array, requestedMain = "") {
  const zip = Buffer.from(input);
  if (zip.length < 22 || zip.length > 10_000_000) throw invalid();
  let end = zip.length - 22;
  while (end >= Math.max(0, zip.length - 65557) && zip.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < Math.max(0, zip.length - 65557) || end + 22 + zip.readUInt16LE(end + 20) !== zip.length) throw invalid();
  const count = zip.readUInt16LE(end + 10), offset = zip.readUInt32LE(end + 16);
  if (!count || count > 400 || zip.readUInt16LE(end + 4) || zip.readUInt16LE(end + 6) || zip.readUInt16LE(end + 8) !== count || offset + zip.readUInt32LE(end + 12) !== end) throw invalid();
  const entries = new Map<string, { size: number; crc: number; supported: boolean }>(), seen = new Set<string>();
  let cursor = offset, total = 0, supportedCount = 0;
  const ignored: string[] = [];
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || zip.readUInt32LE(cursor) !== 0x02014b50) throw invalid();
    const flags = zip.readUInt16LE(cursor + 8), method = zip.readUInt16LE(cursor + 10), size = zip.readUInt32LE(cursor + 24);
    const length = zip.readUInt16LE(cursor + 28), extra = zip.readUInt16LE(cursor + 30), comment = zip.readUInt16LE(cursor + 32), local = zip.readUInt32LE(cursor + 42);
    if ((flags & 1) || ![0, 8].includes(method) || size === 0xffffffff || local + 30 > offset || cursor + 46 + length + extra + comment > end) throw invalid();
    let name: string;
    try { name = new TextDecoder("utf-8", { fatal: true }).decode(zip.subarray(cursor + 46, cursor + 46 + length)); } catch { throw invalid(); }
    const folder = name.endsWith("/"), path = folder ? name.slice(0, -1) : name;
    // macOS metadata and export receipts are not manuscript source.
    const metadata = name.startsWith("__MACOSX/") || name.split("/").pop() === ".DS_Store" || name === "lumigap-version.json";
    if (!metadata) manuscriptPath(path, "FOLDER");
    if (seen.has(name.toLowerCase()) || ((zip.readUInt32LE(cursor + 38) >>> 16) & 0xf000) === 0xa000) throw invalid();
    seen.add(name.toLowerCase());
    const compressed = zip.readUInt32LE(cursor + 20), localName = zip.readUInt16LE(local + 26), localExtra = zip.readUInt16LE(local + 28);
    if (zip.readUInt32LE(local) !== 0x04034b50 || zip.readUInt16LE(local + 6) !== flags || zip.readUInt16LE(local + 8) !== method || local + 30 + localName + localExtra + compressed > offset || !zip.subarray(local + 30, local + 30 + localName).equals(zip.subarray(cursor + 46, cursor + 46 + length))) throw invalid();
    const supported = !metadata && !folder && (textExtension.test(name) || assetExtension.test(name));
    total += size;
    if (total > 20_000_000 || size > 5_000_000 || (supported && textExtension.test(name) && size > MAX_TEXT_BYTES) || (supported && ++supportedCount > 200)) throw invalid();
    entries.set(name, { size, crc: zip.readUInt32LE(cursor + 16), supported });
    if (!folder && !supported) ignored.push(name);
    cursor += 46 + length + extra + comment;
  }
  if (cursor !== end || !supportedCount) throw invalid();
  let extracted: Record<string, Uint8Array>;
  try { extracted = unzipSync(zip, { filter: file => entries.get(file.name)?.supported === true || file.name === "lumigap-version.json" }); } catch { throw invalid(); }
  const source: ImportedFile[] = [];
  for (const [path, entry] of entries) {
    if (!entry.supported) continue;
    const bytes = extracted[path];
    if (!bytes || bytes.length !== entry.size || crc32(bytes) !== entry.crc) throw invalid();
    source.push(textExtension.test(path) ? { path, kind: "TEXT", bytes, text: decodeSource(bytes) } : { path, kind: "ASSET", bytes });
  }
  const prefix = source[0]!.path.includes("/") ? source[0]!.path.split("/")[0]! + "/" : "";
  if (prefix && !source.some(file => file.path === requestedMain) && source.every(file => file.path.startsWith(prefix))) for (const file of source) file.path = file.path.slice(prefix.length);
  const tex = source.filter(file => file.path.endsWith(".tex") && /\\documentclass(?:\s*\[[^\]]*\])?\s*\{/.test(file.text!.replace(/(^|[^\\])%.*/gm, "$1")));
  let retainedMain = "";
  const receipt = extracted["lumigap-version.json"], receiptEntry = entries.get("lumigap-version.json");
  if (receipt && receiptEntry && receipt.length === receiptEntry.size && crc32(receipt) === receiptEntry.crc) {
    try { const value: unknown = JSON.parse(new TextDecoder().decode(receipt)); if (value && typeof value === "object" && "mainFile" in value && typeof value.mainFile === "string") retainedMain = value.mainFile; } catch { /* A receipt is optional; source validation remains authoritative. */ }
  }
  const main = requestedMain || retainedMain || (source.some(file => file.path === "main.tex") ? "main.tex" : tex.length === 1 ? tex[0]!.path : "");
  if (!main || !source.some(file => file.kind === "TEXT" && file.path === main && main.endsWith(".tex"))) throw AppError.badRequest("Specify the main .tex file path; the ZIP contains no unambiguous main document.");
  return { files: source, mainFile: main, ignored };
}

export async function prepareFigure(path: string, bytes: Uint8Array) {
  manuscriptPath(path, "ASSET");
  if (!bytes.length || bytes.length > 5_000_000) throw AppError.badRequest("Figures must be smaller than 5 MB");
  if (/\.(svg|eps)$/.test(path)) {
    const header = Buffer.from(bytes).subarray(0, 4096).toString("utf8");
    if (path.endsWith(".svg") ? !/<svg(?:\s|>)/.test(header) : !header.startsWith("%!PS-Adobe")) throw AppError.badRequest("Invalid vector figure");
    // Opaque private source only. Never render XML/PostScript in the browser or
    // convert it in the API process; isolated compiler workers handle conversion.
    return { bytes, mimeType: "application/octet-stream" };
  }
  if (path.endsWith(".pdf")) {
    // Retained as private binary data, downloaded as attachment, never executed or
    // embedded as an active document. TeX reads it only in the isolated compiler.
    const data = Buffer.from(bytes);
    if (!data.subarray(0, 8).toString("ascii").match(/^%PDF-1\.[0-9]|^%PDF-2\.0/) || !data.subarray(-2048).includes(Buffer.from("%%EOF"))) throw AppError.badRequest("Upload a valid PDF figure");
    return { bytes, mimeType: "application/pdf" };
  }
  try {
    const image = sharp(bytes, { limitInputPixels: 20_000_000, failOn: "warning" });
    const info = await image.metadata();
    if (!["png", "jpeg", "webp"].includes(info.format ?? "") || (info.pages ?? 1) > 1) throw new Error();
    const format = /\.jpe?g$/.test(path) ? "jpeg" : path.endsWith(".webp") ? "webp" : "png";
    const clean = await image.rotate().toFormat(format).toBuffer();
    if (clean.length > 5_000_000) throw new Error();
    return { bytes: new Uint8Array(clean), mimeType: `image/${format}` };
  } catch { throw AppError.badRequest("Upload a valid PNG, JPEG, WebP or PDF figure"); }
}
