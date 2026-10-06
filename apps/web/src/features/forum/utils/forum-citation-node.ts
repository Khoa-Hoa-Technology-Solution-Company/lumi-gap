import { Node } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { forumCitationPaperIdPattern, forumCitationToken } from "@trend/shared-types";

export const ForumCitation = Node.create({
  name: "forumCitation", group: "inline", inline: true, atom: true,
  addAttributes: () => ({ paperId: { default: null }, label: { default: null, rendered: false } }),
  parseHTML: () => [{ tag: "span[data-forum-citation]", getAttrs: (element) => {
    const paperId = element.getAttribute("data-forum-citation") ?? "";
    return forumCitationPaperIdPattern.test(paperId) ? { paperId: paperId.toLowerCase() } : false;
  } }],
  renderHTML: ({ node }) => ["span", { "data-forum-citation": node.attrs.paperId, class: "forum-citation-node", contenteditable: "false", tabindex: "0", role: "button" }, `[${node.attrs.label ?? "?"}]`],
  markdownTokenizer: {
    name: "forumCitation", level: "inline", start: (src) => src.indexOf(":cite["),
    tokenize: (src) => {
      const match = /^:cite\[\]\{paperId="([a-fA-F0-9-]+)"\}/.exec(src);
      return match && forumCitationPaperIdPattern.test(match[1]!) ? { type: "forumCitation", raw: match[0], paperId: match[1]!.toLowerCase() } : undefined;
    },
  },
  parseMarkdown: (token) => ({ type: "forumCitation", attrs: { paperId: token.paperId } }),
  renderMarkdown: (node) => forumCitationToken(String(node.attrs?.paperId)),
  addProseMirrorPlugins() {
    return [new Plugin({ appendTransaction: (_transactions, _old, state) => {
      const order = new Map<string, number>();
      const transaction = state.tr;
      state.doc.descendants((node, position) => {
        if (node.type.name !== "forumCitation") return;
        if (!order.has(node.attrs.paperId)) order.set(node.attrs.paperId, order.size + 1);
        const label = order.get(node.attrs.paperId);
        if (node.attrs.label !== label) transaction.setNodeMarkup(position, undefined, { ...node.attrs, label });
      });
      return transaction.docChanged ? transaction.setMeta("addToHistory", false) : null;
    } })];
  },
});
