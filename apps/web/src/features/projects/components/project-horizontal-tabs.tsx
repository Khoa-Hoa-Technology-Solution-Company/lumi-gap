import { useRef, type KeyboardEvent } from "react";
import { useI18n } from "@/i18n";
import { projectSections, type ProjectTab } from "./project-section-nav";
import { cn } from "@/utils/cn";

export function ProjectHorizontalTabs({
  activeTab,
  onChange,
  paperCount,
  memberCount,
  loading = false,
  allowedTabs,
  className,
}: {
  activeTab: ProjectTab;
  onChange: (tab: ProjectTab) => void;
  paperCount: number;
  memberCount: number;
  loading?: boolean;
  allowedTabs?: readonly ProjectTab[];
  className?: string;
}) {
  const { t } = useI18n();
  const navRef = useRef<HTMLDivElement>(null);
  const sections = projectSections.filter(section => !allowedTabs || allowedTabs.includes(section.key));

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = sections.length - 1;
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % sections.length
        : event.key === "ArrowLeft"
        ? (index + last) % sections.length
        : event.key === "Home"
        ? 0
        : event.key === "End"
        ? last
        : -1;
    if (next < 0) return;
    event.preventDefault();
    const section = sections[next]!;
    onChange(section.key);
    const selected = navRef.current?.querySelector<HTMLButtonElement>(`#project-content-tab-${section.key}`);
    selected?.focus({ preventScroll: true });
    selected?.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "smooth" });
  };

  return (
    <div className={cn("project-content-tabs-wrapper", className)} data-no-i18n>
      <nav
        ref={navRef}
        role="tablist"
        aria-label={t("Project sections")}
        aria-orientation="horizontal"
        className="project-content-tabs"
      >
        {sections.map((section, idx) => {
          const Icon = section.icon;
          const isSelected = activeTab === section.key;
          const count = section.key === "papers" ? paperCount : section.key === "members" ? memberCount : undefined;
          return (
            <button
              key={section.key}
              type="button"
              id={`project-content-tab-${section.key}`}
              role="tab"
              aria-selected={isSelected}
              aria-current={isSelected ? "page" : undefined}
              aria-controls={`project-panel-${section.key}`}
              tabIndex={isSelected ? 0 : -1}
              disabled={loading}
              onClick={() => onChange(section.key)}
              onKeyDown={e => handleKeyDown(e, idx)}
              className="project-content-tab"
            >
              <Icon className={cn("h-4 w-4 shrink-0 transition-colors", isSelected ? "text-primary-foreground" : section.iconColor)} />
              <span>{t(section.label)}</span>
              {count !== undefined && (
                <span className="project-content-tab-count">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
