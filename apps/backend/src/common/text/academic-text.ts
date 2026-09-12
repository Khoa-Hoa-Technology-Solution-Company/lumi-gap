import { decode } from "html-entities";

const HTML_TAG_PATTERN = /<\/?[a-z][^>]*>/gi;

/**
 * Normalize provider text without interpreting it as HTML. Decoding twice
 * handles legacy records whose markup was encoded more than once.
 */
export function normalizeAcademicTitle(
  value: string | null | undefined,
  fallback = "Untitled",
): string {
  let normalized = value?.trim() ?? "";

  for (let pass = 0; pass < 2; pass += 1) {
    const decoded = decode(normalized);
    if (decoded === normalized) break;
    normalized = decoded;
  }

  normalized = normalized
    .replace(HTML_TAG_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized || fallback;
}
