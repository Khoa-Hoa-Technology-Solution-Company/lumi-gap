import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { lazy, Suspense, useId, useState, type ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { cn } from "@/utils/cn";
import { useI18n } from "@/i18n";
import { forumRemarkPlugins } from "../utils/forum-remark-formatting";
import { safeForumImageUrl } from "../utils/forum-formatting";

const ForumMathView = lazy(() => import("./forum-math-view"));

interface ForumMarkdownProps {
  content: string;
  className?: string;
  isCompact?: boolean;
}

function ForumSpoiler({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [revealed, setRevealed] = useState(false);
  return <span role="button" tabIndex={0} aria-expanded={revealed} aria-label={t(revealed ? "Hide spoiler" : "Reveal spoiler")} className="forum-spoiler-toggle" data-revealed={revealed} onClick={() => setRevealed((current) => !current)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setRevealed((current) => !current); } }}><span aria-hidden={!revealed}>{children}</span></span>;
}

function MathView({ latex, block }: { latex: string; block?: boolean }) {
  return <Suspense fallback={<span className="forum-math">{latex}</span>}><ForumMathView latex={latex} block={block} /></Suspense>;
}

export function ForumMarkdown({ content, className, isCompact = false }: ForumMarkdownProps) {
  const footnotePrefix = `forum-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}-`;
  const { t } = useI18n();
  if (!content) return null;

  return (
    <div
      className={cn(
        "forum-prose prose prose-neutral dark:prose-invert max-w-[70ch] break-words [overflow-wrap:anywhere]",
        isCompact
          ? "prose-sm leading-relaxed"
          : "text-base leading-6 prose-headings:font-semibold prose-headings:tracking-tight",
        className
      )}
    >
      <Markdown
        remarkPlugins={[remarkGfm, ...forumRemarkPlugins]}
        remarkRehypeOptions={{ clobberPrefix: footnotePrefix, footnoteLabel: t("Footnotes"), footnoteBackLabel: t("Back to text") }}
        components={{
          a: ({ href, children, node: _node, ...props }) => {
            const isExternal = href?.startsWith("http://") || href?.startsWith("https://");
            return (
              <a
                href={href}
                target={isExternal ? "_blank" : undefined}
                rel={isExternal ? "noopener noreferrer" : undefined}
                className="forum-prose-link"
                {...props}
                aria-describedby={props["aria-describedby"] === "footnote-label" ? `${footnotePrefix}footnote-label` : props["aria-describedby"]}
              >
                {children}
                {isExternal && <ExternalLink aria-hidden="true" className="ml-1 inline h-3 w-3 opacity-70" />}
              </a>
            );
          },
          h2: ({ children, id, node: _node, ...props }) => <h2 {...props} id={id === "footnote-label" ? `${footnotePrefix}footnote-label` : id}>{children}</h2>,
          span: ({ children, node }) => {
            const properties = node?.properties as Record<string, unknown> | undefined;
            const mathKind = properties?.dataForumMath ?? properties?.["data-forum-math"];
            const latex = properties?.dataLatex ?? properties?.["data-latex"];
            const spoiler = properties?.dataForumSpoiler ?? properties?.["data-forum-spoiler"];
            return mathKind ? <MathView latex={String(latex ?? "")} /> : spoiler ? <ForumSpoiler>{children}</ForumSpoiler> : <span>{children}</span>;
          },
          div: ({ children, node, className: divClass }) => {
            const properties = node?.properties as Record<string, unknown> | undefined;
            const mathKind = properties?.dataForumMath ?? properties?.["data-forum-math"];
            const latex = properties?.dataLatex ?? properties?.["data-latex"];
            return mathKind ? <MathView latex={String(latex ?? "")} block /> : <div className={divClass}>{children}</div>;
          },
          blockquote: ({ children }) => <blockquote className="my-4 rounded-md border border-border bg-muted/30 px-4 py-2.5 text-neutral-700 not-italic dark:text-neutral-300">{children}</blockquote>,
          img: ({ src, alt, title }) => safeForumImageUrl(src) ? <img src={safeForumImageUrl(src)} alt={alt ?? ""} title={title} loading="lazy" referrerPolicy="no-referrer" className="forum-image my-4" /> : null,
          code: ({ className: codeClassName, children, ...props }) => {
            const isBlock = codeClassName?.includes("language-");
            if (isBlock) {
              return (
                <div className="my-3 overflow-x-auto rounded-xl border border-slate-200 bg-slate-900 p-4 text-slate-100 shadow-inner dark:border-slate-800 dark:bg-black">
                  <code className={cn("text-sm sm:text-base font-mono leading-relaxed", codeClassName)} {...props}>
                    {children}
                  </code>
                </div>
              );
            }
            return (
              <code
                className="rounded-md bg-muted px-1.5 py-0.5 text-[0.875em] font-mono font-medium text-foreground ring-1 ring-border/50"
                {...props}
              >
                {children}
              </code>
            );
          },
          ul: ({ children }) => <ul className="my-2.5 list-disc pl-5 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="my-2.5 list-decimal pl-5 space-y-1">{children}</ol>,
          li: ({ children, node: _node, className: itemClassName, ...props }) => <li {...props} className={cn("pl-0.5", itemClassName)}>{children}</li>,
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-left text-base divide-y divide-border">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="bg-muted/60 px-4 py-2.5 font-semibold text-foreground text-sm">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-4 py-2.5 text-foreground/90 border-t border-border/50">{children}</td>
          ),
          p: ({ children }) => <p className="my-4 leading-6">{children}</p>,
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
