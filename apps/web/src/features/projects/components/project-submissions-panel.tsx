import { lazy, Suspense } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useCurrentUser } from "@/features/auth";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { projectSubmissionPath } from "@/features/submissions/project-submission-path";

const SubmissionList = lazy(() => import("@/pages/submissions/submission-list").then(m => ({ default: m.SubmissionListPage })));
const SubmissionNew = lazy(() => import("@/pages/submissions/submission-new").then(m => ({ default: m.SubmissionNewPage })));
const SubmissionDetail = lazy(() => import("@/pages/submissions/submission-detail").then(m => ({ default: m.SubmissionDetailPage })));

export function ProjectSubmissionsPanel({ projectId, projectTitle, readOnly }: { projectId: string; projectTitle: string; readOnly: boolean }) {
  const [params] = useSearchParams();
  const { data, isLoading, error, refetch } = useCurrentUser();
  const { t } = useI18n();
  const selected = params.get("submission");
  const loading = <div className="h-48 animate-pulse bg-muted" role="status" aria-label={t("Loading submissions")} />;
  if (isLoading) return loading;
  if (error || !data) return <Button onClick={() => void refetch()}>{t("Retry")}</Button>;
  if (data.user.systemRole !== "ADMIN" && !data.user.emailVerifiedAt) return <Navigate to="/verify-email" replace />;
  const backPath = projectSubmissionPath(projectId);
  if (selected === "new" && readOnly) return <div className="space-y-4" data-no-i18n><p>{t("Archived projects are read-only.")}</p><Button asChild variant="outline"><Link to={backPath}>{t("Back to submissions")}</Link></Button></div>;
  return <div className="project-submission-flow min-w-0"><Suspense fallback={loading}>
    {selected === "new" ? <SubmissionNew key={projectId} projectId={projectId} projectTitle={projectTitle} />
      : selected ? <SubmissionDetail key={`${projectId}:${selected}`} submissionId={selected} projectId={projectId} readOnly={readOnly} />
      : <SubmissionList projectId={projectId} readOnly={readOnly} />}
  </Suspense></div>;
}
