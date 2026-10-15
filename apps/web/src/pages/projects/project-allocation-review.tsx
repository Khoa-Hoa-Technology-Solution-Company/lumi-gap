import { Link, useParams } from "react-router-dom";
import { useI18n } from "@/i18n";
import { ScopedAllocationPanel } from "@/features/projects/components/contribution-allocation";
import "@/features/projects/workspace-coordination.css";
import "@/features/projects/project-contributions.css";
export function ProjectAllocationReviewPage() {
  const { id } = useParams(); const { t } = useI18n();
  return id ? <main className="coord-mentor-page" data-no-i18n><Link to="/notifications">{t("Notifications")}</Link><ScopedAllocationPanel projectId={id} /></main> : null;
}
