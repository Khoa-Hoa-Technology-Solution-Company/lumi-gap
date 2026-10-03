import type { ReactNode } from "react";
import { useI18n } from "@/i18n";

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Right-aligned action area (buttons, links). */
  actions?: ReactNode;
}

/**
 * Standard page header. Use at the top of every route page for consistent
 * vertical rhythm: 36px h1 + 24px gap to content.
 */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  const { t } = useI18n();

  return (
    <div className="mb-6 flex min-w-0 flex-col gap-4 sm:mb-8 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0 space-y-2">
        <h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">{t(title)}</h1>
        {description && (
          <p className="max-w-2xl text-muted-foreground">{t(description)}</p>
        )}
      </div>
      {actions && <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-shrink-0 [&>*]:min-w-0 max-sm:[&>*]:flex-1">{actions}</div>}
    </div>
  );
}
