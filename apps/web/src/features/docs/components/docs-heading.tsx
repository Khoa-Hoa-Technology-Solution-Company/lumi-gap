import { useState, type ReactNode } from "react";
import { Check, Link2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/utils/cn";
import { useDocsContext } from "./docs-context";

/** Copies an absolute link to `path` (e.g. "/docs/trend-share#formula"). */
export function CopyLinkButton({ path, className }: { path: string; className?: string }) {
  const { ui } = useDocsContext();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success(ui.linkCopied);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(ui.copyFailed);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={ui.copyLink}
      title={ui.copyLink}
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Link2 className="h-4 w-4" aria-hidden="true" />}
    </button>
  );
}

/** Heading with an anchor id and a copy-link button that appears on hover/focus. */
export function DocsAnchorHeading({
  as: Tag,
  id,
  path,
  className,
  children,
}: {
  as: "h1" | "h2" | "h3";
  id: string;
  path: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className="group flex min-w-0 items-center gap-1">
      <Tag id={id} tabIndex={-1} className={cn("min-w-0 scroll-mt-[calc(var(--app-header-height)+1.5rem)] break-words focus:outline-none", className)}>
        {children}
      </Tag>
      <CopyLinkButton path={path} className="opacity-60 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100" />
    </div>
  );
}
