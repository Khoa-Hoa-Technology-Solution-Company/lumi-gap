import { snippetCompletion, type CompletionContext, type Completion } from "@codemirror/autocomplete";

// Independently maintained LumiGap completions. Package availability is decided
// by the installed compiler; completion never downloads or executes packages.
const commands = ["documentclass", "usepackage", "title", "author", "date", "maketitle", "tableofcontents", "listoffigures", "listoftables", "chapter", "section", "subsection", "subsubsection", "paragraph", "textbf", "textit", "texttt", "textsf", "emph", "footnote", "url", "href", "label", "ref", "eqref", "autoref", "pageref", "cite", "citep", "citet", "parencite", "textcite", "nocite", "includegraphics", "input", "include", "includeonly", "item", "caption", "centering", "bibliography", "bibliographystyle", "addbibresource", "printbibliography", "newcommand", "renewcommand", "newenvironment", "newtheorem", "setlength", "hspace", "vspace", "clearpage", "newpage", "appendix", "pagestyle", "pagenumbering", "index", "printindex", "makeindex", "gls", "acrshort", "acrlong", "newglossaryentry", "printglossaries", "frac", "sqrt", "sum", "prod", "int", "lim", "left", "right", "mathrm", "mathbf", "mathcal", "mathbb", "text", "times", "cdot", "alpha", "beta", "gamma", "delta", "theta", "lambda", "mu", "sigma", "pi", "omega", "leq", "geq", "neq", "approx", "infty", "partial", "nabla", "toprule", "midrule", "bottomrule", "multicolumn", "multirow"];
const environments = ["document", "abstract", "figure", "figure*", "table", "table*", "tabular", "tabularx", "longtable", "itemize", "enumerate", "description", "equation", "equation*", "align", "align*", "gather", "gather*", "split", "cases", "matrix", "pmatrix", "bmatrix", "theorem", "proof", "quote", "quotation", "verbatim", "lstlisting", "minipage", "center", "flushleft", "flushright", "thebibliography"];
const packages = ["amsmath", "amssymb", "amsthm", "mathtools", "graphicx", "xcolor", "hyperref", "cleveref", "geometry", "booktabs", "tabularx", "longtable", "multirow", "array", "float", "caption", "subcaption", "enumitem", "natbib", "biblatex", "fontspec", "inputenc", "fontenc", "lmodern", "babel", "polyglossia", "iftex", "listings", "tikz", "pgfplots", "siunitx", "algorithm", "algorithmic", "makeidx", "glossaries", "setspace", "fancyhdr"];
const snippets: Record<string, string> = {
  section: "section{${Title}}", subsection: "subsection{${Title}}", chapter: "chapter{${Title}}",
  figure: "begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=0.8\\linewidth]{${figures/image.pdf}}\n  \\caption{${Caption}}\n  \\label{fig:${name}}\n\\end{figure}",
  table: "begin{table}[htbp]\n  \\centering\n  \\begin{tabular}{ll}\n    \\toprule\n    ${Column 1} & ${Column 2} \\\\\n    \\midrule\n    ${Value} & ${Value} \\\\\n    \\bottomrule\n  \\end{tabular}\n  \\caption{${Caption}}\n  \\label{tab:${name}}\n\\end{table}",
  equation: "begin{equation}\n  ${a = b}\n  \\label{eq:${name}}\n\\end{equation}",
  itemize: "begin{itemize}\n  \\item ${Item}\n\\end{itemize}",
  enumerate: "begin{enumerate}\n  \\item ${Item}\n\\end{enumerate}",
};
export function completeLatex(context: CompletionContext, citationKeys: string[], filePaths: string[] = []) {
  const options = (values: string[], type = "text"): Completion[] => [...new Set(values)].map(label => ({ label, type }));
  const argument = context.matchBefore(/\\(?:[A-Za-z]*cite[A-Za-z]*|ref|eqref|autoref|pageref|begin|end|usepackage|documentclass|input|include|includegraphics|addbibresource)\{[^}\n]*/);
  if (argument) {
    const brace = argument.text.indexOf("{"), command = argument.text.slice(1, brace);
    const after = argument.text.slice(brace + 1), comma = after.lastIndexOf(","), from = argument.from + brace + 1 + comma + 1;
    let values: string[];
    if (command.includes("cite")) values = citationKeys;
    else if (["ref", "eqref", "autoref", "pageref"].includes(command)) values = [...context.state.doc.toString().matchAll(/\\label\{([^}]+)\}/g)].map(match => match[1]!);
    else if (["begin", "end"].includes(command)) values = environments;
    else if (command === "usepackage") values = packages;
    else if (command === "documentclass") values = ["article", "report", "book", "letter", "beamer", "IEEEtran"];
    else values = filePaths.filter(path => command === "includegraphics" ? /\.(png|jpe?g|pdf)$/.test(path) : command === "addbibresource" ? path.endsWith(".bib") : path.endsWith(".tex"));
    return { from, options: options(values), validFor: /^[A-Za-z0-9_:/ .-]*$/ };
  }
  const command = context.matchBefore(/\\[A-Za-z]*/);
  if (!command) return null;
  const items: Completion[] = commands.map(label => snippets[label] ? snippetCompletion(snippets[label]!, { label, type: "keyword" }) : { label, type: "keyword" });
  for (const [label, template] of Object.entries(snippets)) if (!commands.includes(label)) items.push(snippetCompletion(template, { label, type: "keyword", detail: "LaTeX" }));
  return { from: command.from + 1, options: items, validFor: /^[A-Za-z]*$/ };
}
