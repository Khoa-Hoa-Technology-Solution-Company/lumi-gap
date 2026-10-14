import { Link, useParams } from "react-router-dom";
import { useI18n } from "@/i18n";
import { WorkspacePlanPanel } from "@/features/projects/components/workspace-plan";
import { WorkspaceDiscussionsPanel } from "@/features/projects/components/workspace-discussions";
import "@/features/projects/workspace-coordination.css";

export function ProjectPlanReviewPage() {
  const { id } = useParams(); const { t } = useI18n();
  if (!id) return null;
  return <main className="coord-mentor-page" data-no-i18n><nav className="project-breadcrumb"><Link to="/academic-support">{t("Academic Support")}</Link><span aria-hidden="true">/</span><span>{t("Shared research plan")}</span></nav><WorkspacePlanPanel projectId={id} mentor /><hr /><WorkspaceDiscussionsPanel projectId={id} mentor readOnly={false} /></main>;
}
