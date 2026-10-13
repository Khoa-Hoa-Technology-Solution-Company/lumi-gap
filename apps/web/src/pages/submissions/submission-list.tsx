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
    <header className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-start sm:justify-between">
      <div><Heading className="text-3xl font-semibold tracking-tight">{t("Submissions")}</Heading>
        <p className="mt-2 max-w-2xl text-base leading-6 text-muted-foreground">{t(projectId ? "Prepare manuscripts, track versions and request reviews within this project." : "Your research submissions. Open a manuscript in its project workspace.")}</p></div>
      {!readOnly && <Button asChild className="shrink-0 self-start"><Link to={newPath}><FilePlus2 className="mr-2 h-4 w-4" />{t("New submission")}</Link></Button>}
    </header>
    {readOnly && <p className="mt-5 text-sm text-muted-foreground" role="status">{t("Archived projects are read-only.")}</p>}
    {query.isLoading ? <div className="mt-6 h-48 animate-pulse bg-muted" role="status" aria-label={t("Loading submissions")} />
      : query.error ? <div className="mt-6 border border-destructive/30 bg-destructive/5 p-5" role="alert"><p>{t("Unable to load your submissions.")}</p><Button variant="outline" className="mt-3" onClick={() => void query.refetch()}>{t("Retry")}</Button></div>
      : query.data?.length ? <div className="mt-6">
        <p className="mb-3 text-sm text-muted-foreground">{query.data.length} {t("Submissions")}</p>
        <div className="divide-y border-y">{query.data.map(submission => <Link key={submission._id} to={projectSubmissionPath(projectId ?? submission.projectId, submission._id)} className="group flex items-start gap-4 px-1 py-6 transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none sm:px-4">
          <FileCheck2 className="mt-1 hidden h-6 w-6 shrink-0 text-primary sm:block" aria-hidden="true" />
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{t(submission.submissionType?.replaceAll("_", " ") || "Submission")}</Badge><Badge variant="secondary">{t(submission.status.replaceAll("_", " "))}</Badge></div>
            <h3 className="mt-3 break-words text-xl font-semibold leading-snug group-hover:text-primary">{submission.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{submission.researchField || t("Research field not specified")}</p>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground"><span className="flex items-center gap-1.5"><History className="h-4 w-4" />{t("Revision")} {submission.currentRevisionNumber}</span><span>{t("Updated")} {new Date(submission.updatedAt).toLocaleDateString(language)}</span></div>
          </div><ArrowRight className="mt-2 h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 motion-reduce:transform-none" aria-hidden="true" />
        </Link>)}</div>
      </div> : <section className="py-12 sm:py-16">
        <div className="flex h-12 w-12 items-center justify-center bg-primary/10 text-primary"><FileCheck2 className="h-6 w-6" /></div>
        <h3 className="mt-5 text-2xl font-semibold">{t("No research submissions yet.")}</h3>
        <p className="mt-2 max-w-xl text-base leading-7 text-muted-foreground">{t("Turn your research into a manuscript. Define its goals, attach a PDF and keep every revision together.")}</p>
        {!readOnly && <Button asChild className="mt-6"><Link to={newPath}>{t("Create submission")}<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>}
        <ol className="mt-10 grid gap-6 border-t pt-6 sm:grid-cols-3">{["Prepare manuscript", "Track revisions", "Request peer review"].map((label, index) => <li key={label} className="flex gap-3"><span className="text-sm font-semibold tabular-nums text-primary">0{index + 1}</span><span className="text-base font-medium">{t(label)}</span></li>)}</ol>
      </section>}
  </div>;
}
