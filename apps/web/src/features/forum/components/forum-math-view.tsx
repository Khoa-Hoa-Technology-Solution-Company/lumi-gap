import { renderForumMath } from "../utils/forum-math";

export default function ForumMathView({ latex, block = false }: { latex: string; block?: boolean }) {
  const html = renderForumMath(latex, block);
  const Tag = block ? "div" : "span";
  // Never insert the source or KaTeX's error message as HTML.
  return html ? <Tag className="forum-math" dangerouslySetInnerHTML={{ __html: html }} /> : <Tag className="forum-math-error" title="Invalid LaTeX">{latex}</Tag>;
}
