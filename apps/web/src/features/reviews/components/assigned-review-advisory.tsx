import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { submissionsApi } from "@/features/submissions/api/submissions.api";
import { useAuthStore } from "@/stores/auth-store";
import { useI18n } from "@/i18n";

/** Advisory output is readable only for the exact authorized review revision. */
export function AssignedReviewAdvisory({ submissionId, revisionId }: { submissionId: string; revisionId?: string }) {
  const { t } = useI18n();
  const actor = useAuthStore(state => state.user?.id);
  const query = useQuery({
    queryKey: ["review-advisory", actor, submissionId, revisionId],
    queryFn: ({ signal }) => submissionsApi.aiPreReviews(submissionId, signal),
    enabled: Boolean(actor && submissionId && revisionId), retry: false,
  });
  const review = !query.error ? query.data?.find(item => item.sourceRevisionId === revisionId && item.status === "COMPLETED") : undefined;
  if (query.isLoading) return <p role="status" className="mt-4 text-xs text-muted-foreground">{t("Loading…")}</p>;
  if (query.isError) return <div className="mt-4 text-sm" role="alert"><p>{t("Unable to load AI pre-reviews.")}</p><Button variant="ghost" size="sm" onClick={() => void query.refetch()}>{t("Try again")}</Button></div>;
  if (!review) return null;
  return <details className="mt-4 rounded-md border p-4">
    <summary className="cursor-pointer text-sm font-medium">{t("mentorWorkspace.aiAdvisory")}</summary>
    <p className="mt-3 text-xs leading-5 text-muted-foreground">{t("mentorWorkspace.aiAdvisoryHint")}</p>
    {review.summary && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">{review.summary}</p>}
    {review.reviewFocusAreas?.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">{review.reviewFocusAreas.map((item, i) => <li key={i}>{item}</li>)}</ul>}
    {review.limitations?.length > 0 && <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{review.limitations.join("\n")}</p>}
  </details>;
}
