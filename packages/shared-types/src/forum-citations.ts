import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkDirective from "remark-directive";

// Use the same Markdown AST on the server and client. Code, escaped text and
// link destinations must never become scholarly citations.
function createCitationParser() {
  return unified().use(remarkParse).use(remarkGfm).use(remarkDirective);
}
let parser: ReturnType<typeof createCitationParser> | undefined;
export const forumCitationPaperIdPattern = /^(?:[a-f0-9]{24}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i;
export type ForumCitationOccurrence = { paperId: string; from: number; to: number };
export function forumCitationToken(paperId: string) {
  if (!forumCitationPaperIdPattern.test(paperId)) throw new Error("Invalid citation paper identifier");
  return `:cite[]{paperId="${paperId.toLowerCase()}"}`;
}
export function forumCitationOccurrences(content: string): ForumCitationOccurrence[] {
  const occurrences: ForumCitationOccurrence[] = [];
  type Ast = { type: string; name?: string; attributes?: Record<string, string>; children?: Ast[]; position?: { start: { offset?: number }; end: { offset?: number } } };
  const visit = (node: Ast) => {
    if (node.type === "textDirective" && node.name === "cite") occurrences.push({ paperId: node.attributes?.paperId?.toLowerCase() ?? "", from: node.position?.start.offset ?? 0, to: node.position?.end.offset ?? 0 });
    node.children?.forEach(visit);
  };
  parser ??= createCitationParser();
  visit(parser.parse(content) as Ast);
  return occurrences;
}
export function forumCitationPaperIds(content: string) {
  return [...new Set(forumCitationOccurrences(content).map((citation) => citation.paperId))];
}
export function orderForumReferences<T extends { paperId?: string | null }>(content: string, references: T[]): T[] {
  const order = forumCitationPaperIds(content);
  if (!order.length) return references;
  return order.flatMap((paperId) => { const reference = references.find((item) => item.paperId?.toLowerCase() === paperId); return reference ? [reference] : []; });
}
