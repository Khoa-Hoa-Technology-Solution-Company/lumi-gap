import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useMentorWorkspace } from "@/features/projects/hooks/use-mentor-workspace";
import { useReviewPageNavigation } from "../hooks/use-review-page-navigation";

export function NextMentorReview({ requestId }: { requestId?: string }) {
  const { t } = useI18n();
  const { href } = useReviewPageNavigation();
  const query = useMentorWorkspace({ status: "ACTIONABLE", kind: "REVIEW", pageSize: 2 });
  const next = !query.error ? query.data?.items.find(item => item.sourceId !== requestId && ["MANUSCRIPT_REVIEW", "PROPOSAL_REVIEW"].includes(item.kind)) : undefined;
  return <div className="mt-4 flex flex-wrap gap-3" data-no-i18n>
    {next && <Button asChild><Link to={href(next.href)}>{t("mentorWorkspace.reviewNext")}</Link></Button>}
    <Button asChild variant="outline"><Link to="/mentor-workspace?view=work">{t("mentorWorkspace.backGlobal")}</Link></Button>
    {query.error && <Button variant="ghost" onClick={() => void query.refetch()}>{t("Try again")}</Button>}
  </div>;
}
