import { useRef, type ComponentType, type KeyboardEvent } from "react";
import { BookOpen, Compass, FileText, Send, MessageSquare, Users, Award, GraduationCap, LayoutDashboard, ListChecks, NotebookPen } from "lucide-react";
import { useI18n } from "@/i18n";

export type ProjectTab = "overview" | "plan" | "tasks" | "papers" | "members" | "contributions" | "gaps" | "chat" | "support" | "submissions" | "manuscripts";

export const projectSections: Array<{
  key: ProjectTab;
  label: string;
  group: string;
  icon: ComponentType<{ className?: string }>;
  iconColor: string;
}> = [
  { key: "overview", label: "Overview", group: "Workspace", icon: LayoutDashboard, iconColor: "text-blue-500" },
  { key: "papers", label: "Literature", group: "Research", icon: BookOpen, iconColor: "text-indigo-500" },
  { key: "gaps", label: "Research Gaps", group: "Research", icon: Compass, iconColor: "text-amber-500" },
  { key: "tasks", label: "Tasks & milestones", group: "Collaboration", icon: ListChecks, iconColor: "text-emerald-500" },
  { key: "chat", label: "Team chat & AI", group: "Collaboration", icon: MessageSquare, iconColor: "text-cyan-500" },
  { key: "support", label: "Find Mentors", group: "Collaboration", icon: GraduationCap, iconColor: "text-purple-500" },
  { key: "manuscripts", label: "Manuscripts", group: "Writing & review", icon: FileText, iconColor: "text-indigo-500" },
  { key: "submissions", label: "Submissions", group: "Writing & review", icon: Send, iconColor: "text-teal-500" },
  { key: "members", label: "Team & settings", group: "Team", icon: Users, iconColor: "text-slate-500" },
  { key: "contributions", label: "Contributions", group: "Team", icon: Award, iconColor: "text-yellow-600" },
  { key: "plan", label: "About project", group: "Team", icon: NotebookPen, iconColor: "text-violet-500" },
];

export function resolveProjectTab(value: string | null): ProjectTab {
  if (value === "reports") return "manuscripts";
  return projectSections.find(section => section.key === value)?.key ?? "overview";
}

const groups = ["Workspace", "Research", "Collaboration", "Writing & review", "Team"];

export function ProjectSectionNav({ activeTab, onChange, paperCount, memberCount, loading = false }: {
  activeTab: ProjectTab; onChange: (tab: ProjectTab) => void; paperCount: number; memberCount: number; loading?: boolean;
}) {
  const { t } = useI18n();
  const nav = useRef<HTMLElement>(null);

  const keyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = projectSections.length - 1;
    const next = event.key === "ArrowDown" || event.key === "ArrowRight" ? (index + 1) % projectSections.length : event.key === "ArrowUp" || event.key === "ArrowLeft" ? (index + last) % projectSections.length : event.key === "Home" ? 0 : event.key === "End" ? last : -1;
    if (next < 0) return;
    event.preventDefault();
    const section = projectSections[next]!;
    onChange(section.key);
    const selected = nav.current?.querySelector<HTMLButtonElement>(`#project-tab-${section.key}`);
    selected?.focus({ preventScroll: true });
    selected?.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "smooth" });
  };

  return (
    <nav className="coord-workspace-nav" ref={nav} data-no-i18n aria-busy={loading} aria-label={t("Project sections")}>
      <div className="coord-nav-mobile">
        <label htmlFor="project-section-select" className="sr-only">{t("Project sections")}</label>
        <select
          id="project-section-select"
          aria-controls={`project-panel-${activeTab}`}
          value={activeTab}
          disabled={loading}
          onChange={e => onChange(e.target.value as ProjectTab)}
        >
          {groups.map(group => (
            <optgroup key={group} label={t(group)}>
              {projectSections.filter(section => section.group === group).map(section => (
                <option key={section.key} value={section.key}>{t(section.label)}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="coord-nav-tabs" role="tablist" aria-label={t("Project sections")} aria-orientation="vertical">
        {groups.map(group => (
          <div className="coord-nav-group" role="presentation" key={group}>
            {group !== "Workspace" && <span className="coord-nav-label" aria-hidden="true">{t(group)}</span>}
            {projectSections.filter(section => section.group === group).map(section => {
              const count = section.key === "papers" ? paperCount : section.key === "members" ? memberCount : undefined;
              const Icon = section.icon;
              const isSelected = activeTab === section.key;
              return (
                <button
                  key={section.key}
                  type="button"
                  disabled={loading}
                  id={`project-tab-${section.key}`}
                  role="tab"
                  aria-selected={isSelected}
                  aria-controls={`project-panel-${section.key}`}
                  tabIndex={isSelected ? 0 : -1}
                  onKeyDown={e => keyDown(e, projectSections.indexOf(section))}
                  onClick={() => onChange(section.key)}
                >
                  <Icon className={`h-[18px] w-[18px] shrink-0 transition-colors ${isSelected ? "text-primary" : section.iconColor}`} />
                  <span className="font-medium">{t(section.label)}</span>
                  {count !== undefined && <small>{count}</small>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}
