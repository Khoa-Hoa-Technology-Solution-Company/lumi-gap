type Edit = { start: number; end: number; lines: string[] };
// Bounded LCS keeps large/generated files off the UI thread. Preserve every
// newline byte; binary files and ambiguous overlapping edits need human review.
function edits(base: string[], next: string[]): Edit[] | undefined {
  if ((base.length + 1) * (next.length + 1) > 500_000) return;
  const width = next.length + 1, table = new Uint32Array((base.length + 1) * width);
  for (let i = base.length - 1; i >= 0; i--) for (let j = next.length - 1; j >= 0; j--)
    table[i * width + j] = base[i] === next[j] ? 1 + table[(i + 1) * width + j + 1]! : Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!);
  const result: Edit[] = []; let i = 0, j = 0;
  while (i < base.length || j < next.length) {
    if (i < base.length && j < next.length && base[i] === next[j]) { i++; j++; continue; }
    const edit: Edit = { start: i, end: i, lines: [] };
    while (i < base.length || j < next.length) {
      if (i < base.length && j < next.length && base[i] === next[j]) break;
      if (j < next.length && (i === base.length || table[i * width + j + 1]! > table[(i + 1) * width + j]!)) edit.lines.push(next[j++]!);
      else i++;
    }
    edit.end = i; result.push(edit);
  }
  return result;
}
export function mergeSourceText(base: string, local: string, remote: string): string | undefined {
  if ([base, local, remote].some(value => value.length > 128_000 || [...value].some(char => char.charCodeAt(0) < 32 && ![9, 10, 13].includes(char.charCodeAt(0))))) return;
  const lines = (value: string) => value.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const original = lines(base), here = edits(original, lines(local)), there = edits(original, lines(remote));
  if (!here || !there) return;
  const combined = [...here];
  for (const right of there) {
    let duplicate = false;
    for (const left of here) {
      if (left.start === right.start && left.end === right.end && left.lines.join("") === right.lines.join("")) { duplicate = true; continue; }
      // Insertions at a replaced boundary are deliberately left for review.
      const overlap = left.start === left.end ? left.start >= right.start && left.start <= right.end
        : right.start === right.end ? right.start >= left.start && right.start <= left.end
        : left.start < right.end && right.start < left.end;
      if (overlap) return;
    }
    if (!duplicate) combined.push(right);
  }
  combined.sort((a, b) => a.start - b.start);
  const output: string[] = []; let cursor = 0;
  for (const edit of combined) { output.push(...original.slice(cursor, edit.start), ...edit.lines); cursor = edit.end; }
  return [...output, ...original.slice(cursor)].join("");
}
