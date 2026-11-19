import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, CheckCircle2, Clock3, FileText, FolderOpen, Inbox, ListTodo, RefreshCw, ShieldAlert, Users } from "lucide-react";
import type { MentorWorkQuery, MentorWorkspaceData } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n";
import { MentorWorkRows } from "./mentor-work-queue";
import { mentorWorkspaceDestination } from "../utils/mentor-workspace-navigation";
import "../mentor-overview.css";

export function MentorOverview({ data, fetching, refresh, openWork }: {
  data: MentorWorkspaceData;
  fetching: boolean;
  refresh: () => void;
  openWork: (query: Partial<MentorWorkQuery>) => void;
}) {
  const { t, language } = useI18n();
  const { summary } = data;
  const statistics = [
    { key: "projects", icon: FolderOpen, value: summary.projects, href: "/mentor-workspace?view=projects" },
    { key: "needsResponse", icon: ListTodo, value: summary.needsResponse, query: { status: "ACTIONABLE" } as const },
    { key: "manuscripts", icon: FileText, value: summary.manuscripts, query: { kind: "REVIEW", status: "ACTIONABLE" } as const },
    { key: "invitations", icon: Inbox, value: summary.invitations, href: "/mentor-workspace?view=incoming" },
  ];

  return <div className="mentor-overview">
    <header className="mentor-overview-header">
      <div>
        <p className="mentor-overview-kicker">{t("mentorWorkspace.eyebrow")}</p>
        <h1>{t("mentorWorkspace.dashboardTitle")}</h1>
        <p className="mentor-overview-intro">{t("mentorWorkspace.dashboardHint")}</p>
      </div>
      <div className="mentor-overview-sync">
        <span role="status" aria-live="polite">{fetching ? t("mentorWorkspace.updating") : <>
          {t("mentorWorkspace.updatedAt")} <time dateTime={data.generatedAt}>{new Date(data.generatedAt).toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit" })}</time>
        </>}</span>
        <Button size="icon" variant="outline" disabled={fetching} onClick={refresh} aria-label={t("mentorWorkspace.refresh")}>
          <RefreshCw size={15} aria-hidden="true" />
        </Button>
      </div>
    </header>

    <nav className="mentor-overview-statistics" aria-label={t("mentorWorkspace.overview")}>
      {statistics.map(({ key, icon: Icon, value, href, query }) => {
        const content = <><Icon size={17} aria-hidden="true" /><span>{t(`mentorWorkspace.metric.${key}`)}</span><strong>{value}</strong><ArrowRight size={14} aria-hidden="true" /></>;
        return href ? <Link key={key} to={href}>{content}</Link> : <button key={key} type="button" onClick={() => openWork(query!)}>{content}</button>;
      })}
    </nav>

    {summary.overdue > 0 || summary.blocked > 0 ? <div className="mentor-overview-alerts" aria-label={t("mentorWorkspace.attentionFlags")}>
      {summary.overdue > 0 ? <button type="button" onClick={() => openWork({ status: "OVERDUE", sort: "deadline" })}>
        <Clock3 size={16} aria-hidden="true" /><span>{t("mentorWorkspace.overdueRequests", { count: summary.overdue })}</span><ArrowRight size={15} aria-hidden="true" />
      </button> : null}
      {summary.blocked > 0 ? <button type="button" onClick={() => openWork({ status: "BLOCKED" })}>
        <ShieldAlert size={16} aria-hidden="true" /><span>{t("mentorWorkspace.blockedRequests", { count: summary.blocked })}</span><ArrowRight size={15} aria-hidden="true" />
      </button> : null}
    </div> : null}

    <div className="mentor-overview-columns">
      <section className="mentor-overview-priorities" aria-labelledby="mentor-priorities-title">
        <header className="mentor-overview-section-heading">
          <div><h2 id="mentor-priorities-title">{t("mentorWorkspace.priorities")}</h2><p>{t("mentorWorkspace.prioritiesHint")}</p></div>
          <Button variant="ghost" size="sm" onClick={() => openWork({ status: "ACTIONABLE" })}>{t("mentorWorkspace.allWork")}<ArrowRight size={14} aria-hidden="true" /></Button>
        </header>
        {data.items.length ? <>
          <MentorWorkRows items={data.items} />
          <div className="mentor-overview-list-footer">
            <span>{t("mentorWorkspace.showingWork", { shown: data.items.length, total: data.meta.total })}</span>
            {data.meta.total > data.items.length ? <Button variant="ghost" size="sm" onClick={() => openWork({ status: "ACTIONABLE" })}>{t("mentorWorkspace.viewAll")}<ArrowRight size={14} aria-hidden="true" /></Button> : null}
          </div>
        </> : <div className="mentor-overview-empty">
          <CheckCircle2 size={28} aria-hidden="true" />
          <h3>{t("mentorWorkspace.emptyPriorities")}</h3>
          <p>{t("mentorWorkspace.caughtUpHint")}</p>
          <Button variant="outline" size="sm" onClick={() => openWork({ status: "ALL" })}>{t("mentorWorkspace.browseWorkHistory")}</Button>
        </div>}
      </section>

      <section className="mentor-overview-teams" aria-labelledby="mentor-teams-title">
        <header className="mentor-overview-section-heading">
          <div><h2 id="mentor-teams-title">{t("mentorWorkspace.recentTeams")}</h2><p>{t("mentorWorkspace.recentTeamsHint")}</p></div>
        </header>
        {data.projects.length ? <>
          <ul className="mentor-overview-team-list">
            {data.projects.slice(0, 4).map(project => <li key={project.id}>
              <div className="mentor-overview-team-heading">
                <Link to={mentorWorkspaceDestination(`/projects/${encodeURIComponent(project.id)}`)}>{project.title}<ArrowRight size={15} aria-hidden="true" /></Link>
                <Badge variant="secondary">{t(`mentorWorkspace.projectStatus.${project.status}`)}</Badge>
              </div>
              <p><Users size={14} aria-hidden="true" />{t("mentorWorkspace.team", { name: project.teamLead, count: project.teamSize })}</p>
              {project.researchStage ? <p><BookOpen size={14} aria-hidden="true" />{t(`mentorWorkspace.stage.${project.researchStage}`)}</p> : project.researchField ? <p><BookOpen size={14} aria-hidden="true" />{project.researchField}</p> : null}
              <div className="mentor-overview-team-footer">
                <time dateTime={project.updatedAt}>{t("mentorWorkspace.teamUpdated", { date: new Date(project.updatedAt).toLocaleDateString(language, { day: "numeric", month: "short" }) })}</time>
                {project.pendingCount > 0 ? <button type="button" onClick={() => openWork({ projectId: project.id, status: "ACTIONABLE" })}>{t("mentorWorkspace.pendingCount", { count: project.pendingCount })}<ArrowRight size={13} aria-hidden="true" /></button> : <span>{t("mentorWorkspace.noRequests")}</span>}
              </div>
            </li>)}
          </ul>
          <Link className="mentor-overview-all-teams" to="/mentor-workspace?view=projects">{t("mentorWorkspace.allTeams", { count: data.projectMeta.total })}<ArrowRight size={15} aria-hidden="true" /></Link>
        </> : <div className="mentor-overview-empty">
          <Users size={26} aria-hidden="true" /><h3>{t("mentorWorkspace.emptyProjects")}</h3><p>{t("mentorWorkspace.startMentoringHint")}</p>
          <Button asChild size="sm" variant="outline"><Link to="/mentor-workspace?view=incoming">{t("mentorWorkspace.invitations")}</Link></Button>
        </div>}
      </section>
    </div>

    <section className="mentor-overview-resources" aria-labelledby="mentor-resources-title">
      <h2 id="mentor-resources-title">{t("mentorWorkspace.reviewTools")}</h2>
      <div>
        <Link to="/mentor-workspace?view=reviews"><BookOpen size={19} aria-hidden="true" /><span><strong>{t("mentorWorkspace.reviewCenterTitle")}</strong><small>{t("mentorWorkspace.reviewCenterHint")}</small></span><ArrowRight size={16} aria-hidden="true" /></Link>
        <Link to="/mentor-workspace?view=templates"><FileText size={19} aria-hidden="true" /><span><strong>{t("mentorWorkspace.templatesTitle")}</strong><small>{t("mentorWorkspace.templatesHint")}</small></span><ArrowRight size={16} aria-hidden="true" /></Link>
      </div>
    </section>
  </div>;
}
