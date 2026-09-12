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
    <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">{t(title)}</h1>
        {description && (
          <p className="max-w-2xl text-muted-foreground">{t(description)}</p>
        )}
      </div>
      {actions && <div className="flex flex-shrink-0 gap-2">{actions}</div>}
    </div>
  );
}
