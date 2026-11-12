import { Link } from "react-router-dom";
import { ArrowRight, FileCheck2, FilePlus2, History, Clock, AlertCircle, CheckCircle2, Sparkles, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSubmissions } from "@/features/submissions";
import { projectSubmissionPath } from "@/features/submissions/project-submission-path";
import { useI18n } from "@/i18n";

export function submissionStatusBadge(status: string, t: (key: string) => string = (k) => k) {
  const norm = status.toLowerCase();
  if (norm === "submitted") {
    return <Badge variant="secondary">{t("Submitted")}</Badge>;
  }
  if (norm === "accepted") {
    return <Badge className="border-emerald-300/80 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300">{t("Accepted")}</Badge>;
  }
  if (norm === "waiting_feedback") {
    return (
      <Badge className="gap-1 border-amber-300/80 bg-amber-500/15 text-amber-800 hover:bg-amber-500/20 dark:border-amber-700/60 dark:text-amber-300">
        <Clock className="h-3 w-3" aria-hidden="true" />
        {t("WAITING_FEEDBACK")}
      </Badge>
    );
  }
  if (norm === "revision_requested") {
    return (
      <Badge className="gap-1 border-rose-300/80 bg-rose-500/15 text-rose-800 hover:bg-rose-500/20 dark:border-rose-700/60 dark:text-rose-300">
        <AlertCircle className="h-3 w-3" aria-hidden="true" />
        {t("REVISION_REQUESTED")}
      </Badge>
    );
  }
  if (norm === "feedback_received") {
    return (
      <Badge className="gap-1 border-blue-300/80 bg-blue-500/15 text-blue-800 hover:bg-blue-500/20 dark:border-blue-700/60 dark:text-blue-300">
        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
        {t("FEEDBACK_RECEIVED")}
      </Badge>
    );
  }
  if (norm === "ready_to_advance") {
    return (
      <Badge className="gap-1 border-emerald-300/80 bg-emerald-500/15 text-emerald-800 hover:bg-emerald-500/20 dark:border-emerald-700/60 dark:text-emerald-300">
        <Sparkles className="h-3 w-3" aria-hidden="true" />
        {t("READY_TO_ADVANCE")}
      </Badge>
    );
  }
  if (norm === "draft") {
    return <Badge variant="outline" className="text-muted-foreground">{t("DRAFT")}</Badge>;
  }
  return <Badge variant="secondary">{t(status.replaceAll("_", " "))}</Badge>;
}

export function submissionTypeBadge(type?: string) {
  const labels: Record<string, string> = {
    RESEARCH_PROPOSAL: "Đề cương",
    LITERATURE_REVIEW: "Literature Review",
    RESEARCH_GAP: "Research Gap",
    METHODOLOGY: "Phương pháp nghiên cứu",
    THESIS_CHAPTER: "Chương nghiên cứu",
    RESEARCH_PAPER: "Bản thảo hoàn chỉnh",
    THESIS_DRAFT: "Bản thảo luận văn",
    SOFTWARE_RESEARCH_PROJECT: "Dự án phần mềm",
  };
  return <Badge variant="outline" className="font-normal">{labels[type || ""] || type?.replaceAll("_", " ") || "Bản thảo"}</Badge>;
}

export function SubmissionListPage({ projectId, readOnly = false }: { projectId?: string; readOnly?: boolean }) {
  const query = useSubmissions(projectId);
  const { t, language } = useI18n();
  const Heading = projectId ? "h2" : "h1";
  const newPath = projectId ? projectSubmissionPath(projectId, "new") : "/submissions/new";

  return (
    <div className={projectId ? "project-submissions" : "mx-auto w-full max-w-6xl px-4 py-8 sm:px-6"} data-no-i18n>
      <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Heading className="text-2xl font-semibold tracking-tight">{t("Submissions")}</Heading>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
            {t(projectId ? "Send manuscripts to lecturers and follow their feedback." : "Your research submissions. Open a manuscript in its project workspace.")}
          </p>
        </div>
        {!readOnly && (
          <Button asChild className="shrink-0 self-start shadow-sm">
            <Link to={newPath}>
              <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t("New submission")}
            </Link>
          </Button>
        )}
      </header>
      {readOnly && <p className="mt-5 text-sm text-muted-foreground" role="status">{t("Archived projects are read-only.")}</p>}

      {query.isLoading ? (
        <div className="mt-6 h-48 animate-pulse rounded-xl bg-muted" role="status" aria-label={t("Loading submissions")} />
      ) : query.error ? (
        <div className="mt-6 rounded-xl border border-destructive/30 bg-destructive/5 p-5" role="alert">
          <p>{t("Unable to load your submissions.")}</p>
          <Button variant="outline" className="mt-3" onClick={() => void query.refetch()}>{t("Retry")}</Button>
        </div>
      ) : query.data?.length ? (
        <div className="mt-6">
          <p className="mb-3 text-sm text-muted-foreground font-medium">{query.data.length} {t("Submissions")}</p>
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-xs">
            {query.data.map(submission => (
              <Link
                key={submission._id}
                to={projectSubmissionPath(projectId ?? submission.projectId, submission._id)}
                className="group flex items-start gap-4 p-4.5 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none"
              >
                <div className="mt-1 hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-muted/30 text-muted-foreground group-hover:border-primary/40 group-hover:text-primary sm:flex">
                  <FileCheck2 className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {submissionTypeBadge(submission.submissionType)}
                    {submissionStatusBadge(submission.status, t)}
                    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      <History className="h-3 w-3" aria-hidden="true" />
                      v{submission.currentRevisionNumber}
                    </span>
                  </div>
                  <h3 className="mt-2 break-words text-base font-semibold leading-snug group-hover:text-primary">
                    {submission.title}
                  </h3>
                  <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                    {submission.abstract || submission.researchField || t("Research field not specified")}
                  </p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>{t("Updated")} {new Date(submission.updatedAt).toLocaleDateString(language, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                  </div>
                </div>
                <ArrowRight className="mt-2 h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 motion-reduce:transform-none" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <section className="mt-6 flex flex-col items-center rounded-xl border border-dashed border-border bg-muted/10 px-5 py-12 text-center sm:py-16">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Send className="h-6 w-6" aria-hidden="true" />
          </div>
          <h3 className="mt-4 text-base font-semibold">{t("No research submissions yet.")}</h3>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            {t("Manuscripts sent for feedback and their PDF revisions will appear here.")}
          </p>
          {!readOnly && (
            <Button asChild className="mt-6" size="sm">
              <Link to={newPath}>
                <FilePlus2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t("New submission")}
              </Link>
            </Button>
          )}
        </section>
      )}
    </div>
  );
}
