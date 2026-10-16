import { Link } from "react-router-dom";
import type { MouseEvent } from "react";
import { ArrowUpRight, BookOpen, FolderKanban, Globe2, LockKeyhole, UsersRound } from "lucide-react";
import type { IProject } from "@trend/shared-types";
import { useI18n } from "@/i18n";
import { ownsProject, PROJECT_STATUS_LABELS } from "../utils/project-directory";

function openProjectFromRow(event: MouseEvent<HTMLTableRowElement>) {
  // Keep the table semantic and let its real links handle keyboard navigation,
  // modified clicks and the shortcuts to literature or members.
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (!(event.target instanceof Element) || event.target.closest("a, button, input, select, textarea")) return;
  if (window.getSelection()?.toString()) return;
  event.currentTarget.querySelector<HTMLAnchorElement>(".project-directory-title")?.click();
}

function ProjectDirectoryRow({ project, userId }: { project: IProject; userId?: string }) {
  const { t, language } = useI18n();
  const path = `/projects/${encodeURIComponent(project._id)}`;
  const date = new Date(project.updatedAt);
  const number = new Intl.NumberFormat(language);
  const visibility = ["PUBLIC", "PUBLIC_SUMMARY"].includes(project.visibility) ? "Public summary" : project.visibility === "INVITE_ONLY" ? "Invite only" : "Private";
  const VisibilityIcon = ["PUBLIC", "PUBLIC_SUMMARY"].includes(project.visibility) ? Globe2 : project.visibility === "INVITE_ONLY" ? UsersRound : LockKeyhole;
  const names = project.members.flatMap(member => typeof member.targetId === "object" && member.targetId.fullName ? [member.targetId.fullName] : []);

  return <tr className="project-directory-row" onClick={openProjectFromRow}>
    <th scope="row" className="project-directory-name">
      <div className="project-directory-identity">
        <span className="project-directory-icon" aria-hidden="true"><FolderKanban /></span>
        <div className="project-directory-copy">
          <Link to={path} className="project-directory-title" data-no-i18n>
            <span>{project.title}</span><ArrowUpRight aria-hidden="true" />
          </Link>
          {project.researchField || project.description ? <p className="project-directory-description" data-no-i18n title={project.description || project.researchField}>{project.researchField || project.description}</p> : null}
          <div className="project-directory-meta">
            <span><VisibilityIcon aria-hidden="true" />{t(visibility)}</span>
            <span>{t(ownsProject(project, userId) ? "You own this project" : "Team project")}</span>
          </div>
        </div>
      </div>
    </th>
    <td className="project-directory-status">
      <span className="project-directory-mobile-label">{t("Status")}</span>
      <span className="project-directory-status-label" data-status={project.status}><span aria-hidden="true" />{t(PROJECT_STATUS_LABELS[project.status])}</span>
    </td>
    <td className="project-directory-papers">
      <span className="project-directory-mobile-label">{t("Papers")}</span>
      <Link to={`${path}?tab=papers`} className="project-directory-count" aria-label={t(project.paperCount === 1 ? "Open literature in {{project}}: {{count}} paper" : "Open literature in {{project}}: {{count}} papers", { project: project.title, count: number.format(project.paperCount) })}>
        <BookOpen aria-hidden="true" /><span>{number.format(project.paperCount)}</span>
      </Link>
    </td>
    <td className="project-directory-team">
      <span className="project-directory-mobile-label">{t("Members")}</span>
      <Link to={`${path}?tab=members`} className="project-directory-count" title={names.join(", ") || undefined} aria-label={t(project.memberCount === 1 ? "Open team in {{project}}: {{count}} member" : "Open team in {{project}}: {{count}} members", { project: project.title, count: number.format(project.memberCount) })}>
        {names.length ? <span className="project-directory-avatars" aria-hidden="true">{names.slice(0, 2).map((name, index) => <span key={index}>{name.trim().split(/\s+/).slice(-2).map(word => word[0]).join("").toLocaleUpperCase(language)}</span>)}</span> : <UsersRound aria-hidden="true" />}
        <span>{number.format(project.memberCount)}</span>
      </Link>
    </td>
    <td className="project-directory-updated">
      <span className="project-directory-mobile-label">{t("Updated")}</span>
      {Number.isFinite(date.getTime()) ? <time dateTime={project.updatedAt} title={new Intl.DateTimeFormat(language, { dateStyle: "full", timeStyle: "short" }).format(date)}>{new Intl.DateTimeFormat(language, { day: "numeric", month: "short", year: "numeric" }).format(date)}</time> : <span>{t("Date unavailable")}</span>}
    </td>
  </tr>;
}

export function ProjectDirectory({ projects, userId }: { projects: IProject[]; userId?: string }) {
  const { t } = useI18n();
  return <table className="project-directory-table" role="table">
    <caption className="sr-only">{t("Your research projects")}</caption>
    <colgroup><col className="project-directory-col-name" /><col className="project-directory-col-status" /><col className="project-directory-col-count" /><col className="project-directory-col-count" /><col className="project-directory-col-date" /></colgroup>
    <thead><tr><th scope="col">{t("Project")}</th><th scope="col">{t("Status")}</th><th scope="col">{t("Papers")}</th><th scope="col">{t("Members")}</th><th scope="col">{t("Last updated")}</th></tr></thead>
    <tbody>{projects.map(project => <ProjectDirectoryRow key={project._id} project={project} userId={userId} />)}</tbody>
  </table>;
}
