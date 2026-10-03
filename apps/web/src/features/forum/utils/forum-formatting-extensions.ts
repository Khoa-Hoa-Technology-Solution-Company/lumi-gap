import { Mark, Node, type AnyExtension } from "@tiptap/core";
import { forumBlockDirective, forumDirectiveAttribute, forumInlineDirective, forumWrapType, safeForumImageUrl } from "./forum-formatting";

function inlineMark(name: "small" | "spoiler") {
  return Mark.create({
    name: `forum${name === "small" ? "Small" : "Spoiler"}`,
    parseHTML: () => [{ tag: `[data-forum-${name}]` }],
    renderHTML: () => [name === "small" ? "small" : "span", { [`data-forum-${name}`]: "", class: `forum-${name}` }, 0],
    markdownTokenizer: {
      name: `forum${name === "small" ? "Small" : "Spoiler"}`, level: "inline",
      start: (src) => src.indexOf(`:${name}[`),
      tokenize: (src, _tokens, lexer) => {
        const match = forumInlineDirective(src, name);
        return match ? { type: `forum${name === "small" ? "Small" : "Spoiler"}`, ...match, tokens: lexer.inlineTokens(match.text) } : undefined;
      },
    },
    parseMarkdown: (token, helpers) => helpers.applyMark(`forum${name === "small" ? "Small" : "Spoiler"}`, helpers.parseInline(token.tokens ?? [])),
    renderMarkdown: (node, helpers) => `:${name}[${helpers.renderChildren(node)}]`,
  });
}

const ForumDetails = Node.create({
  name: "forumDetails", group: "block", content: "block+", defining: true,
  addAttributes: () => ({ summary: { default: "Details", parseHTML: (element) => element.querySelector("summary")?.textContent?.slice(0, 240) ?? "Details", rendered: false } }),
  parseHTML: () => [{ tag: "details[data-forum-details]", contentElement: ".forum-details-content" }],
  renderHTML: ({ node }) => ["details", { "data-forum-details": "", class: "forum-details", open: "" }, ["summary", { contenteditable: "false" }, String(node.attrs.summary)], ["div", { class: "forum-details-content" }, 0]],
  markdownTokenizer: {
    name: "forumDetails", level: "block", start: (src) => src.search(/^:::details\{/m),
    tokenize: (src, _tokens, lexer) => { const match = forumBlockDirective(src, "details"); return match ? { type: "forumDetails", ...match, tokens: lexer.blockTokens(match.text) } : undefined; },
  },
  parseMarkdown: (token, helpers) => ({ type: "forumDetails", attrs: { summary: String(token.attribute).slice(0, 240) }, content: helpers.parseChildren(token.tokens ?? []).length ? helpers.parseChildren(token.tokens ?? []) : [{ type: "paragraph" }] }),
  renderMarkdown: (node, helpers) => `:::details{summary="${forumDirectiveAttribute(String(node.attrs?.summary ?? "Details"))}"}\n${helpers.renderChildren(node.content ?? [])}\n:::`,
});

const ForumWrap = Node.create({
  name: "forumWrap", group: "block", content: "block+", defining: true,
  addAttributes: () => ({ type: { default: "note", parseHTML: (element) => forumWrapType(element.getAttribute("data-forum-wrap")), rendered: false } }),
  parseHTML: () => [{ tag: "div[data-forum-wrap]" }],
  renderHTML: ({ node }) => ["div", { "data-forum-wrap": forumWrapType(node.attrs.type), class: `forum-wrap forum-wrap-${forumWrapType(node.attrs.type)}` }, 0],
  markdownTokenizer: {
    name: "forumWrap", level: "block", start: (src) => src.search(/^:::wrap\{/m),
    tokenize: (src, _tokens, lexer) => { const match = forumBlockDirective(src, "wrap"); return match ? { type: "forumWrap", ...match, tokens: lexer.blockTokens(match.text) } : undefined; },
  },
  parseMarkdown: (token, helpers) => ({ type: "forumWrap", attrs: { type: forumWrapType(token.attribute) }, content: helpers.parseChildren(token.tokens ?? []).length ? helpers.parseChildren(token.tokens ?? []) : [{ type: "paragraph" }] }),
  renderMarkdown: (node, helpers) => `:::wrap{type="${forumWrapType(node.attrs?.type)}"}\n${helpers.renderChildren(node.content ?? [])}\n:::`,
});

const ForumImage = Node.create({
  name: "forumImage", group: "inline", inline: true, atom: true, draggable: true,
  addAttributes: () => ({ src: { default: "", parseHTML: (el) => safeForumImageUrl(el.getAttribute("src")), rendered: false }, alt: { default: "", rendered: false }, title: { default: null, rendered: false } }),
  parseHTML: () => [{ tag: "img[src]", getAttrs: (el) => safeForumImageUrl(el.getAttribute("src")) ? { src: safeForumImageUrl(el.getAttribute("src")), alt: el.getAttribute("alt") ?? "", title: el.getAttribute("title") } : false }],
  renderHTML: ({ node }) => ["img", { src: safeForumImageUrl(node.attrs.src), alt: String(node.attrs.alt ?? ""), title: node.attrs.title, class: "forum-image", loading: "lazy", referrerpolicy: "no-referrer" }],
  markdownTokenName: "image",
  parseMarkdown: (token) => safeForumImageUrl(token.href) ? { type: "forumImage", attrs: { src: safeForumImageUrl(token.href), alt: token.text ?? "", title: token.title ?? null } } : { type: "text", text: token.raw ?? "" },
  renderMarkdown: (node) => {
    const src = safeForumImageUrl(node.attrs?.src);
    if (!src) return "";
    const alt = String(node.attrs?.alt ?? "").replace(/[\\[\]]/g, "\\$&");
    const title = node.attrs?.title ? ` "${String(node.attrs.title).replace(/[\\"]/g, "\\$&")}"` : "";
    return `![${alt}](<${src.replace(/>/g, "%3E")}>${title})`;
  },
});

function mathNode(block: boolean) {
  const name = block ? "forumBlockMath" : "forumInlineMath";
  return Node.create({
    name, group: block ? "block" : "inline", inline: !block, atom: true,
    addAttributes: () => ({ latex: { default: "", parseHTML: (el) => el.getAttribute("data-latex") ?? "", rendered: false } }),
    parseHTML: () => [{ tag: `[data-forum-math="${block ? "block" : "inline"}"]` }],
    renderHTML: ({ node }) => [block ? "div" : "span", { "data-forum-math": block ? "block" : "inline", "data-latex": String(node.attrs.latex), class: "forum-math" }, String(node.attrs.latex)],
    addNodeView() {
      return ({ node }) => {
        const dom = document.createElement(block ? "div" : "span");
        let active = true;
        let latex = String(node.attrs.latex);
        dom.className = `forum-math ${block ? "forum-math-block" : "forum-math-inline"}`;
        dom.setAttribute("data-forum-math", block ? "block" : "inline");
        dom.setAttribute("data-latex", latex);
        dom.setAttribute("tabindex", "0");
        dom.setAttribute("role", "button");
        dom.setAttribute("aria-label", `LaTeX: ${latex}`);
        dom.textContent = latex;
        const render = () => {
          const requestedLatex = latex;
          void import("./forum-math").then(({ renderForumMath }) => {
            if (!active || requestedLatex !== latex) return;
            const html = renderForumMath(requestedLatex, block);
            // Only KaTeX-generated, trust:false HTML goes into the atom view.
            if (html) dom.innerHTML = html;
            else dom.textContent = requestedLatex;
          });
        };
        render();
        return {
          dom,
          update: (nextNode) => {
            if (nextNode.type !== node.type) return false;
            latex = String(nextNode.attrs.latex);
            dom.setAttribute("data-latex", latex);
            dom.setAttribute("aria-label", `LaTeX: ${latex}`);
            dom.textContent = latex;
            render();
            return true;
          },
          destroy: () => { active = false; },
        };
      };
    },
    markdownTokenizer: {
      name, level: block ? "block" : "inline",
      start: (src) => block ? src.search(/^\$\$\s*\n/m) : src.indexOf("$$"),
      tokenize: (src) => {
        const match = (block ? /^\$\$[^\S\n]*\n([\s\S]+?)\n\$\$[^\S\n]*(?:\n|$)/ : /^\$\$([^\n]+?)\$\$/).exec(src);
        return match ? { type: name, raw: match[0], latex: match[1] } : undefined;
      },
    },
    parseMarkdown: (token) => ({ type: name, attrs: { latex: String(token.latex) } }),
    renderMarkdown: (node) => block ? `$$\n${String(node.attrs?.latex ?? "")}\n$$` : `$$${String(node.attrs?.latex ?? "")}$$`,
  });
}

export const forumFormattingExtensions: AnyExtension[] = [inlineMark("small"), inlineMark("spoiler"), ForumDetails, ForumWrap, ForumImage, mathNode(true), mathNode(false)];
