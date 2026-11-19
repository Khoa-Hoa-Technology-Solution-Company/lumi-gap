import { Link, useParams } from "react-router-dom";
import { ManuscriptAttributionDialog } from "@/features/manuscripts/components/manuscript-attribution-dialog";
import { useI18n } from "@/i18n";
export function ManuscriptAttributionReviewPage() {
  const {projectId='',id='',snapshotId=''}=useParams(),{t}=useI18n();
  return <main data-no-i18n className="mx-auto max-w-3xl space-y-4 px-4 py-8"><Link className="text-sm text-primary underline" to="/notifications">{t("Notifications")}</Link><h1 className="text-2xl font-semibold">{t("Manuscript Attribution Check")}</h1><p className="text-sm text-muted-foreground">{t("Review only the manuscript version and attribution shared with you. Project membership is not required.")}</p><ManuscriptAttributionDialog key={snapshotId} defaultOpen projectId={projectId} manuscriptId={id} snapshotId={snapshotId} snapshotLabel="" sourceVersion={0} canWrite={false}/></main>;
}
