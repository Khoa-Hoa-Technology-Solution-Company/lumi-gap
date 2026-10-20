/**
 * Parser of the small inline markup used by documentation content:
 *   **bold**   *italic*   `code`   [text](/docs/id#anchor)   [@source-id]
 * A backslash escapes the next character (e.g. `p\*`). Pure, no React.
 */

export type RichTextNode =
  | { type: "text"; value: string }
  | { type: "strong"; children: RichTextNode[] }
  | { type: "em"; children: RichTextNode[] }
  | { type: "code"; value: string }
  | { type: "link"; href: string; children: RichTextNode[] }
  | { type: "cite"; sourceId: string };

export function parseRichText(input: string): RichTextNode[] {
  const nodes: RichTextNode[] = [];
  let buffer = "";
  let i = 0;

  const flush = () => {
    if (buffer) nodes.push({ type: "text", value: buffer });
    buffer = "";
  };

  while (i < input.length) {
    const char = input[i]!;

    if (char === "\\" && i + 1 < input.length) {
      buffer += input[i + 1];
      i += 2;
      continue;
    }

    if (char === "`") {
      const end = input.indexOf("`", i + 1);
      if (end > i + 1) {
        flush();
        nodes.push({ type: "code", value: input.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    if (char === "*" && input[i + 1] === "*") {
      const end = findClosing(input, "**", i + 2);
      if (end > i + 2) {
        flush();
        nodes.push({ type: "strong", children: parseRichText(input.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }

    if (char === "*" && input[i + 1] !== "*" && input[i + 1] !== undefined && !/\s/.test(input[i + 1]!)) {
      const end = findClosing(input, "*", i + 1);
      if (end > i + 1 && !/\s/.test(input[end - 1]!)) {
        flush();
        nodes.push({ type: "em", children: parseRichText(input.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }

    if (char === "[" && input[i + 1] === "@") {
      const end = input.indexOf("]", i + 2);
      if (end > i + 2) {
        flush();
        nodes.push({ type: "cite", sourceId: input.slice(i + 2, end) });
        i = end + 1;
        continue;
      }
    }

    if (char === "[") {
      const close = findClosing(input, "]", i + 1);
      if (close > i + 1 && input[close + 1] === "(") {
        const hrefEnd = input.indexOf(")", close + 2);
        if (hrefEnd > close + 2) {
          flush();
          nodes.push({
            type: "link",
            href: input.slice(close + 2, hrefEnd),
            children: parseRichText(input.slice(i + 1, close)),
          });
          i = hrefEnd + 1;
          continue;
        }
      }
    }

    buffer += char;
    i += 1;
  }

  flush();
  return nodes;
}

/** Index of the next unescaped `token` at or after `from`, or -1. A lone "*" never matches inside "**". */
function findClosing(input: string, token: string, from: number): number {
  for (let i = from; i < input.length; i++) {
    if (input[i] === "\\") {
      i += 1;
      continue;
    }
    if (token === "*" && input[i] === "*" && input[i + 1] === "*") {
      i += 1;
      continue;
    }
    if (input.startsWith(token, i)) return i;
  }
  return -1;
}

/** Plain text of a rich string, for search and accessibility. */
export function richTextToPlain(input: string): string {
  return parseRichText(input).map(nodeToPlain).join("");
}

function nodeToPlain(node: RichTextNode): string {
  switch (node.type) {
    case "text":
    case "code":
      return node.value;
    case "cite":
      return node.sourceId;
    default:
      return node.children.map(nodeToPlain).join("");
  }
}

/** Every `[@source-id]` cited in a rich string. */
export function citedSourceIds(input: string): string[] {
  const ids: string[] = [];
  const visit = (nodes: RichTextNode[]) => {
    for (const node of nodes) {
      if (node.type === "cite") ids.push(node.sourceId);
      else if (node.type === "strong" || node.type === "em" || node.type === "link") visit(node.children);
    }
  };
  visit(parseRichText(input));
  return ids;
}

/** Every link target of a rich string. */
export function linkTargets(input: string): string[] {
  const hrefs: string[] = [];
  const visit = (nodes: RichTextNode[]) => {
    for (const node of nodes) {
      if (node.type === "link") {
        hrefs.push(node.href);
        visit(node.children);
      } else if (node.type === "strong" || node.type === "em") visit(node.children);
    }
  };
  visit(parseRichText(input));
  return hrefs;
}
