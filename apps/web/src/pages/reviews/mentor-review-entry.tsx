import { useReviewPageNavigation } from "@/features/reviews/hooks/use-review-page-navigation";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { submissionsApi } from "@/features/submissions";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";

/** Converts only a retained, sender-assigned legacy delivery via the existing API. */
export function MentorReviewEntryPage() {
  const { embedded, param, navigate } = useReviewPageNavigation();
  const Container = embedded ? "section" : "main";
  const submissionId = param("submissionId") ?? "";
  const client = useQueryClient(), { t } = useI18n();
  const preparation = useRef<{ id: string; promise: ReturnType<typeof submissionsApi.prepareMentorReview> }>();
  const [error, setError] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true; setError(false);
    if (preparation.current?.id !== submissionId) preparation.current = { id: submissionId, promise: submissionsApi.prepareMentorReview(submissionId) };
    preparation.current.promise.then(async prepared => {
      if (!active) return;
      await client.invalidateQueries({ queryKey: ["mentor-workspace"] });
      if (active) navigate(`/reviews/${prepared.assignmentId}`, { replace: true });
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [submissionId, navigate, client, attempt]);
  return <Container className="mx-auto max-w-3xl space-y-4 px-4 py-10" data-no-i18n>
    <Link to="/mentor-workspace?view=work" className="text-sm text-primary underline">{t("mentorWorkspace.backGlobal")}</Link>
    {error ? <div role="alert"><p>{t("mentorWorkspace.reviewEntryError")}</p><Button className="mt-3" variant="outline" onClick={() => { preparation.current = undefined; setAttempt(n => n + 1); }}>{t("Try again")}</Button></div>
      : <p role="status">{t("mentorWorkspace.preparingReview")}</p>}
  </Container>;
}
