import { Link, useLocation } from "react-router-dom";
import type { ContributionArtifactLink, ResolvedContributionArtifactRef } from "@trend/shared-types";
import { useI18n } from "@/i18n";
import { WorkspaceArtifactLink, projectSectionHref } from "./workspace-common";
import { useWorkspaceResource } from "../hooks/use-workspace";
import { contributionsApi } from "../api/contributions.api";
import { mentorWorkspaceDestination } from "../utils/mentor-workspace-navigation";

function ResearchReviewReference({ projectId, link }: { projectId: string; link: ContributionArtifactLink }) {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const resource = useWorkspaceResource(projectId, "research-artifact", () => contributionsApi.artifact(projectId, link), link);
  if (resource.isError) return <span>{t("Artifact unavailable or removed")}</span>;
  if (!resource.data) return <span>{t("Loading...")}</span>;
  if (resource.data.content) return <details><summary>{t("researchContribution.openEvidence")}</summary><strong>{resource.data.title}</strong><p className="contribution-prose">{resource.data.content}</p></details>;
  if (!resource.data.href) return <span>{t("Artifact unavailable or removed")}</span>;
  return <Link className="coord-inline-link" to={pathname==="/mentor-workspace"?mentorWorkspaceDestination(resource.data.href):resource.data.href}>{t("researchContribution.openEvidence")}</Link>;
}

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
  if (["SUBMISSION", "SUBMISSION_REVISION", "HUMAN_REVIEW", "SYNTHESIS", "RESEARCH_DECISION"].includes(link.kind)) return <ResearchReviewReference projectId={projectId} link={link} />;
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
    <WorkspaceArtifactLink projectId={projectId} link={link as Exclude<ContributionArtifactLink, { kind: "TASK" | "SUBMISSION" | "SUBMISSION_REVISION" | "HUMAN_REVIEW" | "SYNTHESIS" | "RESEARCH_DECISION" }>} />
  );
}
