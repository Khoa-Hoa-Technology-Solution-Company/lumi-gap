import { Link } from "react-router-dom";
import type { ContributionArtifactLink } from "@trend/shared-types";
import { useI18n } from "@/i18n";
import { WorkspaceArtifactLink, projectSectionHref } from "./workspace-common";
export function ContributionArtifactReference({ projectId, link }: { projectId: string; link: ContributionArtifactLink | null }) {
  const { t } = useI18n();
  return link?.kind === "TASK" ? <Link className="coord-inline-link" to={projectSectionHref(projectId, "tasks", { task: link.id })}>{t("Related task")}</Link> : <WorkspaceArtifactLink projectId={projectId} link={link} />;
}
