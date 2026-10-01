import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";

type ForumLayoutProps = {
  children: ReactNode;
  sidebar: ReactNode;
  className?: string;
  contentClassName?: string;
};

/**
 * Shared shell for the forum index and thread detail views.
 *
 * The app header lives in MainLayout. Keeping this workspace separate means
 * the forum navigation can be sticky below that header without creating a
 * second page-level scroll container.
 */
export function ForumLayout({
  children,
  sidebar,
  className,
  contentClassName,
}: ForumLayoutProps) {
  return (
    <div className={cn("forum-workspace relative min-h-[calc(100dvh-var(--app-header-height))]", className)}>
      <div
        className={cn(
          "w-full md:grid md:grid-cols-[var(--forum-sidebar-width)_minmax(0,1fr)]",
        )}
      >
        {sidebar}
        <div className={cn("forum-content mx-auto w-full min-w-0 max-w-[calc(var(--forum-reading-width)+4rem)] px-4 pb-12 pt-5 sm:px-6 md:px-4 lg:px-6 xl:px-8 xl:pt-8", contentClassName)}>{children}</div>
      </div>
    </div>
  );
}

export function ForumSurface({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("forum-surface mx-auto min-w-0 rounded-xl border border-border/80", className)} {...props}>{children}</div>;
}
