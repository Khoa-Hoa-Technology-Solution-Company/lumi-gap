import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, ClipboardList, GraduationCap, LayoutDashboard, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";
import { academicSupportApi, type ContextSection } from "@/features/projects/api/academic-support.api";
import { WorkspacePlanPanel } from "@/features/projects/components/workspace-plan";
import { WorkspaceDiscussionsPanel } from "@/features/projects/components/workspace-discussions";
import { canLeaveWorkspace, WorkspaceError, WorkspaceLoading } from "@/features/projects/components/workspace-common";
import "@/features/projects/workspace-coordination.css";
import { MentorGuidance } from "@/features/projects/components/mentor-guidance";
import "./mentor-project.css";

const tabs = ["overview", "research", "plan", "questions"] as const;
type Tab = typeof tabs[number];
const labels = { overview: "Project overview", research: "Research material", plan: "Shared research plan", questions: "Team questions" };
const icons = { overview: LayoutDashboard, research: BookOpen, plan: ClipboardList, questions: MessageSquare };
const detailLabels: Record<string, string> = { INCLUDED: "Relevant", EXCLUDED: "Not relevant", PENDING: "Not reviewed", CONSIDERING: "Considering", NOT_STARTED: "Not started", READING: "Reading", READ: "Read", OWNER: "Project owner", MEMBER: "Team member", PROPOSED: "Proposed candidate", SUPPORTED: "Supported", REJECTED: "Rejected", NEEDS_EVIDENCE: "Needs more evidence" };
const sections: ContextSection[] = ["papers", "gaps", "evidence", "reports", "members"];
const sectionLabels = { papers: "Literature", gaps: "Research gaps", evidence: "Evidence", reports: "Research outputs", members: "Team members" };

export function MentorProjectPage() {
  const { projectId } = useParams();
  return projectId ? <MentorProjectWorkspace key={projectId} projectId={projectId} /> : null;
}

function MentorProjectWorkspace({ projectId }: { projectId: string }) {
  const { t } = useI18n(), userId = useAuthStore(s => s.user?.id);
  const [params, setParams] = useSearchParams();
  const tab: Tab = tabs.find(value => value === params.get("tab")) ?? "overview";
  const section = sections.find(value => value === params.get("section")) ?? "papers";
  const [page, setPage] = useState(1);
  const currentSection = tab === "research" ? section : "papers";
  const workspace = useQuery({ queryKey: ["academic-support", userId, "workspace", projectId, currentSection, tab === "research" ? page : 1], queryFn: () => academicSupportApi.workspace(projectId, { section: currentSection, page: tab === "research" ? page : 1 }), enabled: Boolean(userId), retry: false });
  const changeTab = async (next: Tab) => {
    if (next === tab || !await canLeaveWorkspace()) return;
    const updated = new URLSearchParams(params); updated.set("tab", next);
    for (const key of ["discussion", "discussionView", "revision", "question"]) updated.delete(key);
    setPage(1); setParams(updated);
  };
  const back = <Link className="mentor-project-back" to="/academic-support?view=active"><ArrowLeft size={16} aria-hidden="true" />{t("Back to teams you mentor")}</Link>;
  if (workspace.isLoading) return <main className="mentor-project-page" data-no-i18n>{back}<WorkspaceLoading /></main>;
  if (!workspace.data || workspace.isError) return <main className="mentor-project-page" data-no-i18n>{back}<div className="mentor-project-unavailable"><h1>{t("Project guidance unavailable")}</h1><p>{t("You need an active, verified mentorship to open this workspace. The project may be unavailable or your access may have changed.")}</p><WorkspaceError error={workspace.error} retry={() => void workspace.refetch()} /></div></main>;
  const data = workspace.data;
  return <main className="mentor-project-page" data-no-i18n>{back}
    <header className="mentor-project-heading"><div><p><GraduationCap size={16} aria-hidden="true" />{t("Project guidance")}</p><h1>{data.project.title}</h1><div className="mentor-project-areas">{data.project.researchAreas.map(area => <span key={area}>{t(area)}</span>)}</div></div><span className="mentor-project-access">{t(data.canProvideFeedback ? "Mentorship active" : "Read-only project")}</span></header>
    <nav className="mentor-project-nav" aria-label={t("Project guidance")}>
      {tabs.map(value => { const Icon = icons[value]; return <button type="button" key={value} aria-current={value === tab ? "page" : undefined} onClick={() => void changeTab(value)}><Icon size={17} aria-hidden="true" />{t(labels[value])}</button>; })}
    </nav>
    <section className="mentor-project-panel" aria-label={t(labels[tab])}>
      {tab === "overview" && <div className="mentor-project-overview"><div className="mentor-project-introduction"><h2>{t("Research overview")}</h2><p>{data.context.description || data.project.summary || t("No public description yet.")}</p>{data.project.mentoringNeeds && <section className="mentor-project-needs"><h2>{t("Where you can help")}</h2><p>{data.project.mentoringNeeds}</p></section>}
        <div className="mentor-project-resource-links"><h2>{t("Research material")}</h2><p>{t("Read the team's papers, candidate gaps and supporting evidence before giving feedback.")}</p><div>{sections.filter(value => value !== "members").map(value => <button type="button" key={value} onClick={() => { const next = new URLSearchParams(params); next.set("tab", "research"); next.set("section", value); setPage(1); void canLeaveWorkspace().then(allowed => { if (allowed) setParams(next); }); }}><span>{t(sectionLabels[value])}</span><span>{data.context.counts[value]}</span></button>)}</div></div>
        {(data.context.inclusionCriteria.length > 0 || data.context.exclusionCriteria.length > 0) && <details className="mentor-project-criteria"><summary>{t("Screening criteria")}</summary>{(["inclusionCriteria", "exclusionCriteria"] as const).map(key => data.context[key].length > 0 && <div key={key}><h3>{t(key === "inclusionCriteria" ? "Inclusion criteria" : "Exclusion criteria")}</h3><ul>{data.context[key].map((item, index) => <li key={index}>{item}</li>)}</ul></div>)}</details>}
      </div><MentorGuidance projectId={projectId} data={data} /></div>}
      {tab === "research" && <><div className="mentor-project-research-toolbar"><label>{t("Material type")}<select value={section} onChange={e => { const next = new URLSearchParams(params); next.set("section", e.target.value); setPage(1); setParams(next); }}>{sections.map(value => <option key={value} value={value}>{t(sectionLabels[value])} ({data.context.counts[value]})</option>)}</select></label><span>{data.context.meta.total} {t("items")}</span></div>
        {!data.context.items.length ? <div className="mentor-project-empty"><BookOpen size={25} aria-hidden="true" /><h2>{t("No research material here yet")}</h2><p>{t("Material will appear as the team adds it to the project.")}</p></div> : <div className="mentor-project-materials">{data.context.items.map(item => <details key={item.id}><summary><strong>{item.title}</strong>{item.detail && <span>{item.detail.split(" · ").map(part => t(detailLabels[part] ?? part)).join(" · ")}</span>}{item.body && <p>{item.body.slice(0, 240)}{item.body.length > 240 ? "…" : ""}</p>}</summary>{item.body && <div>{item.body}</div>}</details>)}</div>}
        {data.context.meta.totalPages > 1 && <nav className="mentor-project-pagination" aria-label={t("Pagination")}><Button size="sm" variant="outline" disabled={page <= 1 || workspace.isFetching} onClick={() => setPage(value => value - 1)}>{t("Previous")}</Button><span>{page} / {data.context.meta.totalPages}</span><Button size="sm" variant="outline" disabled={page >= data.context.meta.totalPages || workspace.isFetching} onClick={() => setPage(value => value + 1)}>{t("Next")}</Button></nav>}
      </>}
      {tab === "plan" && <WorkspacePlanPanel projectId={projectId} mentor />}
      {tab === "questions" && <WorkspaceDiscussionsPanel projectId={projectId} mentor readOnly={!data.canProvideFeedback} />}
    </section>
  </main>;
}
