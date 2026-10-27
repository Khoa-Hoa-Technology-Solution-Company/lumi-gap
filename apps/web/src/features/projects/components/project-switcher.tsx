import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { FolderKanban } from "lucide-react";
import type { IProject } from "@trend/shared-types";
import { useI18n } from "@/i18n";
import { PROJECT_STATUS_LABELS } from "../utils/project-directory";
import { projectWorkspaceHref } from "../utils/project-workspace-navigation";
import { canLeaveWorkspace } from "./workspace-common";

export function ProjectSwitcher({ projects, allProjects, selectedId }: {
  projects: IProject[]; allProjects: IProject[]; selectedId?: string;
}) {
  const { t, language } = useI18n();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const number = new Intl.NumberFormat(language);
  // Mobile always offers the whole library, including a selection hidden by a desktop filter.
  return <>
    <div className="project-switcher-mobile">
      <label htmlFor="project-switcher-select" className="sr-only">{t("Switch project")}</label>
      <select id="project-switcher-select" value={allProjects.some(project => project._id === selectedId) ? selectedId : ""}
        onChange={async event => { const next = event.target.value; if (next && next !== selectedId && await canLeaveWorkspace()) navigate(projectWorkspaceHref(next, params)); }}>
        <option value="" disabled>{t("Choose a project")}</option>
        {allProjects.map(project => <option value={project._id} key={project._id}>{project.title}</option>)}
      </select>
    </div>
    <nav className="project-switcher-list" aria-label={t("Your research projects")}>
      {projects.map(project => <Link key={project._id} to={projectWorkspaceHref(project._id, params)}
        className="project-switcher-item" aria-current={selectedId === project._id ? "page" : undefined}>
        <FolderKanban aria-hidden="true" />
        <span className="project-switcher-copy">
          <strong data-no-i18n>{project.title}</strong>
          <span className="project-switcher-stage-row"><span className="project-switcher-stage">{t(PROJECT_STATUS_LABELS[project.status])}</span>
          <span className="project-switcher-counts">
            <span>{t(project.paperCount === 1 ? "{{count}} paper" : "{{count}} papers", { count: number.format(project.paperCount) })}</span>
            <span aria-hidden="true">·</span>
            <span>{t(project.memberCount === 1 ? "{{count}} member" : "{{count}} members", { count: number.format(project.memberCount) })}</span>
          </span>
          </span>
        </span>
      </Link>)}
    </nav>
  </>;
}
