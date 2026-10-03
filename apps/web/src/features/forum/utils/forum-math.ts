import katex from "katex";
import "katex/dist/katex.min.css";

/** HTML is produced only by KaTeX with untrusted-command support disabled. */
export function renderForumMath(latex: string, displayMode = false) {
  if (!latex.trim() || latex.length > 1000) return;
  try {
    return katex.renderToString(latex, {
      displayMode, output: "htmlAndMathml", throwOnError: true, trust: false,
      strict: "error", maxSize: 10, maxExpand: 1000,
    });
  } catch { return; }
}
