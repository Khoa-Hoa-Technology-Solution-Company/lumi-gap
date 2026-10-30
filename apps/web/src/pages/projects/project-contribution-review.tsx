import { Link, useParams, useSearchParams } from "react-router-dom";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";
import { WorkDetail } from "@/features/projects/components/work-contributions";
import { EvaluationReview } from "@/features/projects/components/contribution-evaluation";
import { PersonalContributionEvidencePanel } from "@/features/projects/components/personal-contribution-evidence-panel";
import { contributionsApi } from "@/features/projects/api/contributions.api";
import { useWorkspaceResource } from "@/features/projects/hooks/use-workspace";
import { WorkspaceError, WorkspaceLoading } from "@/features/projects/components/workspace-common";
import "@/features/projects/workspace-coordination.css";
import "@/features/projects/project-contributions.css";

export function ProjectContributionReviewPage() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const record = params.get("record");
  const evaluation = params.get("evaluation");
  const tab = params.get("tab");
  const { t } = useI18n();
  const userId = useAuthStore(s => s.user?.id ?? "");

  const result = useWorkspaceResource(
    id,
    "scoped-work-review",
    () => contributionsApi.detail(id, record!),
    record,
    Boolean(record),
  );

  if (tab === "evidence" || (!record && !evaluation)) {
    return (
      <main className="coord-mentor-page contributions-workspace max-w-5xl mx-auto p-6 space-y-6" data-no-i18n>
        <Link to="/notifications">{t("Notifications")}</Link>
        <h1>{t("My Research Evidence & Contribution History")}</h1>
        <PersonalContributionEvidencePanel projectId={id} />
      </main>
    );
  }

  if (evaluation) {
    return (
      <main className="coord-mentor-page contributions-workspace" data-no-i18n>
        <Link to="/notifications">{t("Notifications")}</Link>
        <h1>{t("Contribution evaluation")}</h1>
        <EvaluationReview key={evaluation} projectId={id} evaluationId={evaluation} />
      </main>
    );
  }

  return (
    <main className="coord-mentor-page contributions-workspace" data-no-i18n>
      <Link to="/notifications">{t("Notifications")}</Link>
      <h1>{t("Work contributions")}</h1>
      {result.isLoading ? (
        <WorkspaceLoading />
      ) : result.isError ? (
        <WorkspaceError error={result.error} retry={() => void result.refetch()} />
      ) : (
        result.data && <WorkDetail projectId={id} item={result.data} currentUserId={userId} readOnly={result.data.readOnly} />
      )}
    </main>
  );
}
