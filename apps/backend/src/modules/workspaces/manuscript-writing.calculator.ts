import * as Y from "yjs";
import type { ManuscriptWritingCalculation } from "@trend/shared-types";

export type WritingSpan = { client: number; clock: number; length: number; userId?: string; recordedAt?: string; from?: { client: number; clock: number } };
export type DeletedWritingRun = { client: number; clock: number; text: string };
export type WritingBaseline = { spans: WritingSpan[]; deleted: DeletedWritingRun[] };
export function writingBaseline(value: unknown): WritingBaseline {
  if (Array.isArray(value)) return { spans: value as WritingSpan[], deleted: [] };
  return value && typeof value === "object" && "spans" in value && "deleted" in value ? value as WritingBaseline : { spans: [], deleted: [] };
}
type Visible = { client: number; clock: number; start: number; text: string };

/** Keep Yjs linked-list access in this adapter. Linear traversal avoids a position lookup per character. */
function visible(doc: Y.Doc): Visible[] {
  const result: Visible[] = []; let start = 0;
  for (let item = doc.getText("source")._start; item; item = item.right) {
    if (item.deleted || !(item.content instanceof Y.ContentString)) continue;
    result.push({ client: item.id.client, clock: item.id.clock, start, text: item.content.str });
    start += item.content.str.length;
  }
  return result;
}

function visibleClocks(items: Visible[]) {
  const clients = new Map<number, Visible[]>();
  for (const item of items) { const list = clients.get(item.client) ?? []; list.push(item); clients.set(item.client, list); }
  for (const list of clients.values()) list.sort((a, b) => a.clock - b.clock);
  return (client: number, clock: number) => {
    const list = clients.get(client) ?? []; let lo = 0, hi = list.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (list[mid]!.clock + list[mid]!.text.length <= clock) lo = mid + 1; else hi = mid; }
    return Boolean(list[lo] && list[lo]!.clock <= clock);
  };
}

/** Equal ranges survive replacements, including suggestions accepted by a different account. */
function equalRanges(before: string, after: string) {
  const ranges: { old: number; next: number; length: number }[] = [];
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
  if (prefix) ranges.push({ old: 0, next: 0, length: prefix });
  let suffix = 0;
  while (suffix < before.length - prefix && suffix < after.length - prefix && before[before.length - suffix - 1] === after[after.length - suffix - 1]) suffix++;
  const a = [...before.slice(prefix, before.length - suffix).matchAll(/[\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+/gu)];
  const b = [...after.slice(prefix, after.length - suffix).matchAll(/[\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+/gu)];
  // Bounded LCS for changed text; oversized replacements remain unattributed in the middle.
  const uncertain = a.length > 0 && b.length > 0 && a.length * b.length > 200000;
  if (!uncertain) {
    const width = b.length + 1, cells = new Uint32Array((a.length + 1) * width);
    for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) cells[i * width + j] = a[i]![0] === b[j]![0] ? 1 + cells[(i + 1) * width + j + 1]! : Math.max(cells[(i + 1) * width + j]!, cells[i * width + j + 1]!);
    let i = 0, j = 0;
    while (i < a.length && j < b.length) {
      if (a[i]![0] === b[j]![0]) { ranges.push({ old: prefix + a[i]!.index!, next: prefix + b[j]!.index!, length: a[i]![0].length }); i++; j++; }
      else if (cells[(i + 1) * width + j]! >= cells[i * width + j + 1]!) i++; else j++;
    }
  }
  if (suffix) ranges.push({ old: before.length - suffix, next: after.length - suffix, length: suffix });
  return { ranges, uncertain, prefix, end: after.length - suffix };
}

export function captureWritingSpans(before: Y.Doc, after: Y.Doc, actorId: string, deleted: DeletedWritingRun[] = [], consumed = new Set<DeletedWritingRun>()): WritingSpan[] {
  const vector = Y.decodeStateVector(Y.encodeStateVector(before));
  const old = visible(before), next = visible(after), result: WritingSpan[] = [];
  const stillVisible = visibleClocks(next);
  const matches = equalRanges(before.getText("source").toString(), after.getText("source").toString());
  const recovery = new Map<string, DeletedWritingRun | null>();
  for (const run of deleted) recovery.set(run.text, recovery.has(run.text) ? null : run);
  let matchIndex = 0, oldIndex = 0;
  for (const item of next) {
    const offset = Math.max(0, (vector.get(item.client) ?? 0) - item.clock);
    if (offset >= item.text.length) continue;
    // A restored deleted run keeps its recorded origin, including undo by a different editor.
    const restored = recovery.get(item.text.slice(offset));
    for (let index = offset; index < item.text.length;) {
      const position = item.start + index;
      while (matchIndex < matches.ranges.length && matches.ranges[matchIndex]!.next + matches.ranges[matchIndex]!.length <= position) matchIndex++;
      const match = matches.ranges[matchIndex];
      const span: WritingSpan = { client: item.client, clock: item.clock + index, length: 1 };
      if (match && match.next <= position) {
        const oldPosition = match.old + position - match.next;
        while (oldIndex < old.length && old[oldIndex]!.start + old[oldIndex]!.text.length <= oldPosition) oldIndex++;
        const origin = old[oldIndex];
        // Text equality only transfers credit for replaced characters. A retained
        // source character already has its credit and must not also own a new copy.
        if (origin && !stillVisible(origin.client, origin.clock + oldPosition - origin.start)) span.from = { client: origin.client, clock: origin.clock + oldPosition - origin.start };
        else span.userId = actorId;
      } else if (restored) { span.from = { client: restored.client, clock: restored.clock + index - offset }; consumed.add(restored); }
      else if (!(matches.uncertain && position >= matches.prefix && position < matches.end)) span.userId = actorId;
      const previous = result.at(-1);
      if (previous && previous.client === span.client && previous.clock + previous.length === span.clock && previous.userId === span.userId && ((!previous.from && !span.from) || (previous.from && span.from && previous.from.client === span.from.client && previous.from.clock + previous.length === span.from.clock))) previous.length++;
      else result.push(span);
      index++;
    }
    if (restored && consumed.has(restored)) recovery.delete(restored.text);
  }
  return result;
}

export function captureWritingChange(before: Y.Doc, after: Y.Doc, actorId: string, baselineValue: unknown) {
  const baseline = writingBaseline(baselineValue), consumed = new Set<DeletedWritingRun>();
  const spans = captureWritingSpans(before, after, actorId, baseline.deleted, consumed);
  const live = new Map<number, Visible[]>();
  for (const item of visible(after)) { const list = live.get(item.client) ?? []; list.push(item); live.set(item.client, list); }
  for (const list of live.values()) list.sort((a, b) => a.clock - b.clock);
  const removed: DeletedWritingRun[] = [];
  for (const item of visible(before)) {
    const list = live.get(item.client) ?? []; let clock = item.clock;
    let lo = 0, hi = list.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (list[mid]!.clock + list[mid]!.text.length <= clock) lo = mid + 1; else hi = mid; }
    for (let i = lo; i < list.length; i++) {
      const remaining = list[i]!;
      if (remaining.clock >= item.clock + item.text.length) break;
      if (remaining.clock > clock) removed.push({ client: item.client, clock, text: item.text.slice(clock - item.clock, remaining.clock - item.clock) });
      clock = Math.max(clock, remaining.clock + remaining.text.length);
    }
    if (clock < item.clock + item.text.length) removed.push({ client: item.client, clock, text: item.text.slice(clock - item.clock) });
  }
  // Each deleted occurrence can restore its credit once. Further copies are new
  // insertions, even when their text is identical to a previously recovered run.
  const deleted = [...baseline.deleted.filter(run => !consumed.has(run)), ...removed];
  let size = deleted.reduce((n, run) => n + run.text.length, 0), drop = 0;
  while (size > 500000 && drop < deleted.length) size -= deleted[drop++]!.text.length;
  return { spans, baseline: { spans: baseline.spans, deleted: deleted.slice(drop) } };
}

function indexSpans(spans: WritingSpan[]) {
  const clients = new Map<number, WritingSpan[]>();
  for (const span of spans) { const list = clients.get(span.client) ?? []; list.push(span); clients.set(span.client, list); }
  for (const list of clients.values()) list.sort((a, b) => a.clock - b.clock);
  return (client: number, clock: number): { userId: string; recordedAt?: string } | null => {
    for (let depth = 0; depth < 128; depth++) {
      const list = clients.get(client) ?? []; let lo = 0, hi = list.length - 1, found: WritingSpan | undefined;
      while (lo <= hi) { const middle = (lo + hi) >>> 1, candidate = list[middle]!; if (candidate.clock <= clock) { found = candidate; lo = middle + 1; } else hi = middle - 1; }
      if (!found || clock >= found.clock + found.length) return null;
      if (found.userId) return { userId: found.userId, recordedAt: found.recordedAt };
      if (!found.from) return null;
      clock = found.from.clock + clock - found.clock; client = found.from.client;
    }
    return null;
  };
}

/** Keep executable input/include commands while excluding non-body examples and syntax. */
export function latexBodyMask(source: string): string {
  let text = source;
  const blank = (value: string) => " ".repeat(value.length);
  text = text.replace(/\\(?:verb\*?)([^\w\s])[^\n]*?\1/g, blank);
  text = text.replace(/(?<!\\)%[^\n]*/g, blank);
  text = text.replace(/\\begin\{(thebibliography|verbatim\*?|lstlisting|minted|equation\*?|align\*?|tikzpicture)\}[\s\S]*?\\end\{\1\}/g, blank);
  text = text.replace(/\$\$[\s\S]*?\$\$|(?<!\\)\$[^$\n]*?(?<!\\)\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)/g, blank);
  const documentStart = text.indexOf("\\begin{document}");
  if (documentStart >= 0) text = blank(text.slice(0, documentStart)) + text.slice(documentStart);
  const documentEnd = text.indexOf("\\end{document}");
  if (documentEnd >= 0) text = text.slice(0, documentEnd) + blank(text.slice(documentEnd));
  return text;
}

/** Mask syntax while preserving UTF-16 source offsets. This is a conservative prose estimate, not a TeX interpreter. */
export function proseMask(source: string, path: string): string {
  if (!/\.(tex|txt)$/i.test(path)) return " ".repeat(source.length);
  if (/\.txt$/i.test(path)) return source;
  let text = latexBodyMask(source);
  const blank = (value: string) => " ".repeat(value.length);
  text = text.replace(/\\(?:cite\w*|ref|eqref|label|url|bibliography|bibliographystyle|input|include|includegraphics|documentclass|usepackage|begin|end|author|title|date)\*?(?:\[[^\]]*\])?\{[^{}]*\}/g, blank);
  text = text.replace(/\\[A-Za-z@]+\*?(?:\[[^\]]*\])?/g, blank);
  return text;
}

function distribute(values: { key: string; value: number }[], totalUnits: number) {
  const total = values.reduce((sum, row) => sum + BigInt(row.value), 0n);
  if (!total) return new Map(values.map(row => [row.key, 0]));
  const rows = values.map(row => ({ key: row.key, units: Number(BigInt(row.value) * BigInt(totalUnits) / total), remainder: BigInt(row.value) * BigInt(totalUnits) % total }));
  let left = totalUnits - rows.reduce((sum, row) => sum + row.units, 0);
  const order = [...rows].sort((a, b) => a.remainder === b.remainder ? a.key < b.key ? -1 : a.key > b.key ? 1 : 0 : a.remainder > b.remainder ? -1 : 1);
  for (const row of order) { if (!left) break; row.units++; left--; }
  return new Map(rows.map(row => [row.key, row.units]));
}

export function calculateRetainedWriting(files: { id: string; path: string; state: Uint8Array; spans: WritingSpan[] }[], people: Map<string, { name: string }>): ManuscriptWritingCalculation {
  const totals = new Map<string, number>(); let totalWords = 0;
  let recordedFrom: string | null = null, recordedThrough: string | null = null;
  const resultFiles = [];
  for (const file of files) {
    const doc = new Y.Doc(); Y.applyUpdate(doc, file.state);
    try {
      const source = doc.getText("source").toString(), masked = proseMask(source, file.path), items = visible(doc), owner = indexSpans(file.spans);
      let itemIndex = 0, words = 0, unknown = 0;
      for (const token of masked.matchAll(/[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['’-][\p{L}\p{M}\p{N}]+)*/gu)) {
        const counts = new Map<string, number>(); words++;
        for (let position = token.index!; position < token.index! + token[0].length;) {
          while (itemIndex < items.length && items[itemIndex]!.start + items[itemIndex]!.text.length <= position) itemIndex++;
          const item = items[itemIndex], code = source.codePointAt(position)!, width = code > 0xffff ? 2 : 1;
          if (/[\p{L}\p{M}\p{N}]/u.test(String.fromCodePoint(code))) {
            const attribution = item ? owner(item.client, item.clock + position - item.start) : null;
            const user = attribution?.userId ?? "";
            if (attribution?.recordedAt) {
              if (!recordedFrom || attribution.recordedAt < recordedFrom) recordedFrom = attribution.recordedAt;
              if (!recordedThrough || attribution.recordedAt > recordedThrough) recordedThrough = attribution.recordedAt;
            }
            counts.set(user, (counts.get(user) ?? 0) + 1);
          }
          position += width;
        }
        for (const [user, units] of distribute([...counts].map(([key, value]) => ({ key, value })), 1000)) { totals.set(user, (totals.get(user) ?? 0) + units); if (!user) unknown += units; }
      }
      totalWords += words; resultFiles.push({ id: file.id, path: file.path, totalWords: words, unknownWordUnits: unknown });
    } finally { doc.destroy(); }
  }
  const known = [...totals].filter(([id]) => id), knownTotal = known.reduce((n, [, units]) => n + units, 0), unknown = totals.get("") ?? 0;
  const overall = distribute([...totals].map(([key, value]) => ({ key, value })), 10000), suggestions = distribute(known.map(([key, value]) => ({ key, value })), 10000);
  return { algorithmVersion: "RETAINED_WRITING_V1", totalWords, attributedWordUnits: knownTotal, unknownWordUnits: unknown,
    coverageBasisPoints: totalWords ? 10000 - (overall.get("") ?? 0) : 0, recordedFrom, recordedThrough,
    members: known.sort(([a], [b]) => a < b ? -1 : 1).map(([userId, units]) => ({ userId, name: people.get(userId)?.name ?? "Researcher", retainedWordUnits: units, overallBasisPoints: overall.get(userId) ?? 0, suggestedBasisPoints: knownTotal ? suggestions.get(userId)! : null })), files: resultFiles };
}
