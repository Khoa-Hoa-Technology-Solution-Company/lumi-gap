import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "@/utils/cn";

export interface BreadcrumbItem {
  label: string;
  href?: string;
  active?: boolean;
}

export function WorkspaceBreadcrumb({
  items,
  className,
}: {
  items: BreadcrumbItem[];
  className?: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className={cn("workspace-breadcrumb flex items-center gap-1.5 text-xs text-muted-foreground mb-4", className)}>
      <ol className="flex items-center gap-1.5 flex-wrap m-0 p-0 list-none">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={index} className="flex items-center gap-1.5 min-w-0">
              {index > 0 && (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" aria-hidden="true" />
              )}
              {item.href && !isLast ? (
                <Link
                  to={item.href}
                  className="font-medium hover:text-foreground transition-colors truncate max-w-[200px]"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className={cn(
                    "truncate max-w-[240px]",
                    isLast ? "font-semibold text-foreground" : "font-medium text-muted-foreground"
                  )}
                  aria-current={isLast ? "page" : undefined}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
