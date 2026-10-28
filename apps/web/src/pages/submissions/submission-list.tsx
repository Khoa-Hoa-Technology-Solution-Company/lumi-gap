import { Link } from "react-router-dom";
import { ArrowRight, FileCheck2, FilePlus2, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSubmissions } from "@/features/submissions";
import { projectSubmissionPath } from "@/features/submissions/project-submission-path";
import { useI18n } from "@/i18n";

export function SubmissionListPage({ projectId, readOnly = false }: { projectId?: string; readOnly?: boolean }) {
  const query = useSubmissions(projectId);
  const { t, language } = useI18n();
  const Heading = projectId ? "h2" : "h1";
  const newPath = projectId ? projectSubmissionPath(projectId, "new") : "/submissions/new";
  return <div className={projectId ? "project-submissions" : "mx-auto w-full max-w-6xl px-4 py-8 sm:px-6"} data-no-i18n>
    <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0"><Heading className="text-2xl font-semibold tracking-tight">{t("Submissions")}</Heading>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">{t(projectId ? "Send manuscripts to lecturers and follow their feedback." : "Your research submissions. Open a manuscript in its project workspace.")}</p></div>
      {!readOnly && <Button asChild className="shrink-0 self-start"><Link to={newPath}><FilePlus2 className="h-4 w-4" aria-hidden="true" />{t("New submission")}</Link></Button>}
    </header>
    {readOnly && <p className="mt-5 text-sm text-muted-foreground" role="status">{t("Archived projects are read-only.")}</p>}
    {query.isLoading ? <div className="mt-6 h-48 animate-pulse rounded-xl bg-muted" role="status" aria-label={t("Loading submissions")} />
      : query.error ? <div className="mt-6 rounded-xl border border-destructive/30 bg-destructive/5 p-5" role="alert"><p>{t("Unable to load your submissions.")}</p><Button variant="outline" className="mt-3" onClick={() => void query.refetch()}>{t("Retry")}</Button></div>
      : query.data?.length ? <div className="mt-6">
        <p className="mb-3 text-sm text-muted-foreground">{query.data.length} {t("Submissions")}</p>
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">{query.data.map(submission => <Link key={submission._id} to={projectSubmissionPath(projectId ?? submission.projectId, submission._id)} className="group flex items-start gap-3 px-4 py-4 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none">
          <FileCheck2 className="mt-1 hidden h-5 w-5 shrink-0 text-muted-foreground sm:block" aria-hidden="true" />
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{t(submission.submissionType?.replaceAll("_", " ") || "Submission")}</Badge><Badge variant="secondary">{t(submission.status.replaceAll("_", " "))}</Badge></div>
            <h3 className="mt-2 break-words text-base font-semibold leading-6 group-hover:text-primary">{submission.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{submission.researchField || t("Research field not specified")}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><History className="h-3.5 w-3.5" aria-hidden="true" />{t("Revision")} {submission.currentRevisionNumber}</span><span>{t("Updated")} {new Date(submission.updatedAt).toLocaleDateString(language)}</span></div>
          </div><ArrowRight className="mt-2 h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 motion-reduce:transform-none" aria-hidden="true" />
        </Link>)}</div>
      </div> : <section className="mt-6 flex flex-col items-center rounded-xl border border-border bg-muted/10 px-5 py-10 text-center sm:py-12">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground"><FileCheck2 className="h-5 w-5" aria-hidden="true" /></div>
        <h3 className="mt-4 text-base font-semibold">{t("No research submissions yet.")}</h3>
        <p className="mt-1.5 max-w-md text-sm leading-6 text-muted-foreground">{t("Manuscripts sent for feedback and their PDF revisions will appear here.")}</p>
      </section>}
  </div>;
}
