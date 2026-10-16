export const MAX_MANUSCRIPT_CHARS = 60000;
const OMITTED_MARKER = "\n\n[... middle pages omitted ...]\n\n";

/** Page-marked manuscript text for the AI pre-review. Long text keeps the start (abstract, method) and the end (results, references). */
export function buildManuscriptText(pages: Array<{ pageNumber: number | null; text: string }>, max = MAX_MANUSCRIPT_CHARS): string {
  const text = pages.map((page, index) => `[[PAGE ${page.pageNumber ?? index + 1}]]\n${page.text}`).join("\n\n");
  if (text.length <= max) return text;
  const head = Math.floor(max * 0.65);
  const tail = max - head - OMITTED_MARKER.length;
  return `${text.slice(0, head)}${OMITTED_MARKER}${tail > 0 ? text.slice(-tail) : ""}`;
}
