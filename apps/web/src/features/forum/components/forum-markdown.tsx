import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ExternalLink } from "lucide-react";
import { cn } from "@/utils/cn";

interface ForumMarkdownProps {
  content: string;
  className?: string;
  isCompact?: boolean;
}

export function ForumMarkdown({ content, className, isCompact = false }: ForumMarkdownProps) {
  if (!content) return null;

  return (
    <div
      className={cn(
        "prose prose-slate dark:prose-invert max-w-[70ch] break-words [overflow-wrap:anywhere]",
        isCompact
          ? "prose-sm leading-relaxed"
          : "text-base leading-[1.7] sm:text-lg prose-headings:font-semibold prose-headings:tracking-tight prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline",
        className
      )}
    >
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children, ...props }) => {
            const isExternal = href?.startsWith("http://") || href?.startsWith("https://");
            return (
              <a
                href={href}
                target={isExternal ? "_blank" : undefined}
                rel={isExternal ? "noopener noreferrer" : undefined}
                className="inline-flex items-center gap-1 font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline underline-offset-2"
                {...props}
              >
                {children}
                {isExternal && <ExternalLink className="inline h-3 w-3 opacity-70" />}
              </a>
            );
          },
          blockquote: ({ children }) => (
            <blockquote className="my-4 rounded-md border border-border bg-muted/30 px-4 py-2.5 text-muted-foreground not-italic">
              {children}
            </blockquote>
          ),
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
          li: ({ children }) => <li className="pl-0.5">{children}</li>,
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
          p: ({ children }) => <p className="my-3 leading-[1.7]">{children}</p>,
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
