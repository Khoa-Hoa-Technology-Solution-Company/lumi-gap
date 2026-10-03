export const FORUM_WRAP_TYPES = ["note", "aside", "warning"] as const;
export type ForumWrapType = (typeof FORUM_WRAP_TYPES)[number];
export const forumWrapType = (value: unknown): ForumWrapType => FORUM_WRAP_TYPES.includes(value as ForumWrapType) ? value as ForumWrapType : "note";

/** No data/blob/javascript URLs, credentials, or locally hosted image requests. */
export function safeForumImageUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2000 || [...value].some((character) => { const code = character.charCodeAt(0); return code <= 0x20 || code === 0x7f; })) return;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return;
    if (/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[)/i.test(url.hostname) || !url.hostname.includes(".")) return;
    return url.href;
  } catch { return; }
}

export const forumDirectiveAttribute = (value: string) => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]/g, " ");

/** Read directive labels without treating their contents as HTML or JS. */
export function forumInlineDirective(src: string, name: string) {
  const opening = `:${name}[`;
  if (!src.startsWith(opening)) return;
  let depth = 1;
  for (let index = opening.length; index < src.length; index++) {
    if (src[index] === "\\") { index++; continue; }
    if (src[index] === "[") depth++;
    if (src[index] === "]" && --depth === 0) return { raw: src.slice(0, index + 1), text: src.slice(opening.length, index) };
  }
}

export function forumBlockDirective(src: string, name: "details" | "wrap") {
  const opening = new RegExp(`^:::${name}\\{(summary|type)="((?:\\\\.|[^"\\\\])*)"\\}[^\\S\\n]*\\n`).exec(src);
  if (!opening || opening[1] !== (name === "details" ? "summary" : "type")) return;
  let depth = 1;
  let fence: string | undefined;
  let offset = opening[0].length;
  for (const line of src.slice(offset).split(/(?<=\n)/)) {
    const text = line.trimEnd();
    const codeFence = /^ {0,3}(`{3,}|~{3,})/.exec(text)?.[1];
    if (codeFence) {
      if (!fence) fence = codeFence;
      else if (codeFence[0] === fence[0] && codeFence.length >= fence.length) fence = undefined;
    }
    if (!fence) {
      if (/^:::[a-z]/.test(text)) depth++;
      if (/^:::[^\S\n]*$/.test(text) && --depth === 0) return {
        raw: src.slice(0, offset + line.length),
        text: src.slice(opening[0].length, offset).trimEnd(),
        attribute: opening[2]!.replace(/\\(["\\])/g, "$1"),
      };
    }
    offset += line.length;
  }
}
