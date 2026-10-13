import { useEffect, useRef, type KeyboardEvent } from "react";
import { BookOpen, FileText, FileCheck2, Lightbulb, MessageSquare, ShieldCheck, Users, GitPullRequest } from "lucide-react";
import { useI18n } from "@/i18n";

export type ProjectTab = "papers" | "members" | "contributions" | "reports" | "gaps" | "chat" | "support" | "submissions";
const sections = [
  { key: "papers", label: "Literature", icon: BookOpen, group: "Research workspace" },
  { key: "gaps", label: "Research Gaps", icon: Lightbulb, group: "Research workspace" },
  { key: "reports", label: "Artifacts", icon: FileText, group: "Research workspace" },
  { key: "submissions", label: "Submissions", icon: FileCheck2, group: "Research workspace" },
  { key: "members", label: "Members", icon: Users, group: "Collaboration" },
  { key: "support", label: "Academic Support", icon: ShieldCheck, group: "Collaboration" },
  { key: "contributions", label: "Contributions", icon: GitPullRequest, group: "Collaboration" },
  { key: "chat", label: "Chat", icon: MessageSquare, group: "Collaboration" },
] as const;

export function ProjectSectionNav({ activeTab, onChange, paperCount, memberCount }: {
  activeTab: ProjectTab; onChange: (tab: ProjectTab) => void; paperCount: number; memberCount: number;
}) {
  const { t } = useI18n();
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const tabs = navRef.current?.querySelector<HTMLElement>('[role="tablist"]');
    const selected = tabs?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!tabs || !selected || tabs.clientWidth === 0) return;
    const viewport = tabs.getBoundingClientRect();
    const target = selected.getBoundingClientRect();
    // Reveal the selected tab within its row without moving the page vertically.
    if (target.left < viewport.left) tabs.scrollLeft += target.left - viewport.left;
    else if (target.right > viewport.right) tabs.scrollLeft += target.right - viewport.right;
  }, [activeTab]);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number;
    if (event.key === "ArrowRight") next = (index + 1) % sections.length;
    else if (event.key === "ArrowLeft") next = (index + sections.length - 1) % sections.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = sections.length - 1;
    else return;
    event.preventDefault();
    const section = sections[next]!;
    onChange(section.key);
    navRef.current?.querySelector<HTMLButtonElement>(`#project-tab-${section.key}`)?.focus({ preventScroll: true });
  };
  return <nav ref={navRef} className="project-section-nav" data-no-i18n aria-label={t("Project sections")}>
    <div className="project-section-mobile">
      <label htmlFor="project-section-select">{t("Project sections")}</label>
      <select id="project-section-select" value={activeTab} onChange={event => onChange(event.target.value as ProjectTab)} aria-controls={`project-panel-${activeTab}`}>
        {["Research workspace", "Collaboration"].map(group => <optgroup key={group} label={t(group)}>{sections.filter(section => section.group === group).map(section => <option key={section.key} value={section.key}>{t(section.label)}</option>)}</optgroup>)}
      </select>
    </div>
    <div className="project-section-tabs" role="tablist" aria-label={t("Project sections")} aria-orientation="horizontal">
      {sections.map((section, index) => {
        const Icon = section.icon;
        const count = section.key === "papers" ? paperCount : section.key === "members" ? memberCount : undefined;
        return <button key={section.key} type="button" id={`project-tab-${section.key}`} role="tab" aria-selected={activeTab === section.key} aria-controls={`project-panel-${section.key}`} tabIndex={activeTab === section.key ? 0 : -1} onKeyDown={event => onKeyDown(event, index)} onClick={() => onChange(section.key)} className={`project-section-tab ${section.key === "members" ? "project-section-team" : ""}`}>
          <Icon aria-hidden="true" /><span>{t(section.label)}</span>{count !== undefined ? <span className="project-section-count">{count}</span> : null}
        </button>;
      })}
    </div>
  </nav>;
}
