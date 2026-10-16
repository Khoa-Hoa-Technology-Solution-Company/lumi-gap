import { Fragment, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { DOCS_SECTIONS, docsPath, docsSourceAnchor } from "../docs-section-ids";
import { DOCS_SOURCES, isDocsSourceId } from "../docs-sources";
import { parseRichText, type RichTextNode } from "../utils/docs-rich-text";

const LINK_CLASS = "font-medium text-blue-700 underline decoration-blue-300 underline-offset-2 hover:decoration-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm dark:text-blue-300 dark:decoration-blue-700 dark:hover:decoration-blue-300";

export function DocsRichText({ text }: { text: string }) {
  return <>{renderNodes(parseRichText(text))}</>;
}

function renderNodes(nodes: RichTextNode[]): ReactNode[] {
  return nodes.map((node, index) => <Fragment key={index}>{renderNode(node)}</Fragment>);
}

function renderNode(node: RichTextNode): ReactNode {
  switch (node.type) {
    case "text":
      return node.value;
    case "strong":
      return <strong className="font-semibold text-foreground">{renderNodes(node.children)}</strong>;
    case "em":
      return <em>{renderNodes(node.children)}</em>;
    case "code":
      return <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground [overflow-wrap:anywhere]">{node.value}</code>;
    case "link":
      return node.href.startsWith("/")
        ? <Link to={node.href} className={LINK_CLASS}>{renderNodes(node.children)}</Link>
        : <a href={node.href} target="_blank" rel="noreferrer" className={LINK_CLASS}>{renderNodes(node.children)}</a>;
    case "cite": {
      if (!isDocsSourceId(node.sourceId)) return node.sourceId;
      const source = DOCS_SOURCES[node.sourceId];
      return (
        <Link to={docsPath(DOCS_SECTIONS.references, docsSourceAnchor(source.id))} className={LINK_CLASS}>
          ({source.shortCite})
        </Link>
      );
    }
  }
}
