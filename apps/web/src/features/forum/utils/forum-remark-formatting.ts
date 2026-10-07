import type { Root, RootContent, PhrasingContent } from "mdast";
import type { Node } from "unist";
import remarkDirective from "remark-directive";
import remarkMath from "remark-math";
import type { PluggableList } from "unified";
import { forumWrapType } from "./forum-formatting";

type DirectiveNode = Node & { name?: string; attributes?: Record<string, string>; children?: RootContent[]; data?: Record<string, unknown>; value?: string };

/** Allowlisted native nodes, never an HTML parser and never links as sentinels. */
export function remarkForumFormatting() {
  return (tree: Root) => {
    const citations = new Map<string, number>();
    function visit(node: DirectiveNode) {
      if (node.type === "textDirective" && node.name === "cite") {
        const paperId = node.attributes?.paperId?.toLowerCase() ?? "";
        if (!citations.has(paperId)) citations.set(paperId, citations.size + 1);
        node.data = { hName: "span", hProperties: { "data-forum-citation": paperId, "data-citation-number": citations.get(paperId) } };
        node.children = [];
      }
      if (node.type === "textDirective" && (node.name === "small" || node.name === "spoiler")) node.data = { hName: node.name === "small" ? "small" : "span", hProperties: { className: [`forum-${node.name}`], ...(node.name === "spoiler" ? { "data-forum-spoiler": "true" } : {}) } };
      if (node.type === "containerDirective" && node.name === "details") {
        const summary = node.attributes?.summary?.slice(0, 240) || "Details";
        node.data = { hName: "details", hProperties: { className: ["forum-details"] } };
        node.children = [{ type: "paragraph", children: [{ type: "text", value: summary } as PhrasingContent], data: { hName: "summary" } }, ...(node.children ?? [])];
      }
      if (node.type === "containerDirective" && node.name === "wrap") {
        const type = forumWrapType(node.attributes?.type);
        node.data = { hName: "div", hProperties: { className: ["forum-wrap", `forum-wrap-${type}`] } };
      }
      if (node.type === "inlineMath" || node.type === "math") node.data = { hName: node.type === "math" ? "div" : "span", hProperties: { "data-forum-math": node.type === "math" ? "block" : "inline", "data-latex": node.value } };
      node.children?.forEach((child) => visit(child as DirectiveNode));
    }
    visit(tree as unknown as DirectiveNode);
  };
}

export const forumRemarkPlugins: PluggableList = [remarkDirective, [remarkMath, { singleDollarTextMath: false }], remarkForumFormatting];
