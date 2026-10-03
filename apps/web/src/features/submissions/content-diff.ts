export type DiffLine = { kind: "same" | "added" | "removed"; text: string };

/** Line-level LCS with an explicit size limit to keep long manuscripts responsive. */
export function diffContent(before: string, after: string): DiffLine[] | null {
  const left = before.split("\n"), right = after.split("\n");
  if (left.length * right.length > 1_000_000 || before.length + after.length > 500_000) return null;
  const width = right.length + 1, lengths = new Uint32Array((left.length + 1) * width);
  for (let i = left.length - 1; i >= 0; i--) for (let j = right.length - 1; j >= 0; j--) lengths[i * width + j] = left[i] === right[j] ? 1 + lengths[(i + 1) * width + j + 1]! : Math.max(lengths[(i + 1) * width + j]!, lengths[i * width + j + 1]!);
  const result: DiffLine[] = []; let i = 0, j = 0;
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) { result.push({ kind: "same", text: left[i++]! }); j++; }
    else if (j < right.length && (i === left.length || lengths[i * width + j + 1]! > lengths[(i + 1) * width + j]!)) result.push({ kind: "added", text: right[j++]! });
    else result.push({ kind: "removed", text: left[i++]! });
  }
  return result;
}
