import { Link } from "react-router-dom";
import type { ContributionArtifactLink, ResolvedContributionArtifactRef } from "@trend/shared-types";
import { useI18n } from "@/i18n";
import { WorkspaceArtifactLink, projectSectionHref } from "./workspace-common";

export function ContributionArtifactReference({
  projectId,
  link,
  detail,
}: {
  projectId: string;
  link: ContributionArtifactLink | null;
  detail?: ResolvedContributionArtifactRef | null;
}) {
  const { t } = useI18n();
  if (!link) return null;
  if (detail && !detail.available) {
    return (
      <span className="coord-chip coord-status-disputed" title={detail.label ?? t("Artifact unavailable or removed from project")}>
        {link.kind}: {t("Artifact unavailable or removed")}
      </span>
    );
  }
  return link.kind === "TASK" ? (
    <Link className="coord-inline-link" to={projectSectionHref(projectId, "tasks", { task: link.id })}>
      {t("Related task")}
    </Link>
  ) : (
    <WorkspaceArtifactLink projectId={projectId} link={link} />
  );
}
