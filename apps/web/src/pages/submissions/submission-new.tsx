import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useProjects } from "@/features/projects/hooks/use-projects";
import { MentorManuscriptDialog } from "@/features/submissions/components/mentor-manuscript-dialog";
import { projectSubmissionPath } from "@/features/submissions/project-submission-path";
import { useI18n } from "@/i18n";

export function SubmissionNewPage({ projectId, projectTitle }: { projectId?: string; projectTitle?: string }) {
  const { t } = useI18n(), navigate = useNavigate();
  const projects = useProjects({ enabled: !projectId });
  const [chosen, setChosen] = useState(projectId ?? "");
  const id = projectId ?? chosen;
  return <div data-no-i18n>{!id ? <div className="mx-auto max-w-lg space-y-4 p-6"><h1 className="text-xl font-semibold">{t("Send manuscript for feedback")}</h1><label>{t("Research project")}<select className="mt-2 block w-full rounded border bg-background p-2" value={chosen} onChange={event => setChosen(event.target.value)}><option value="">{t("Select a project")}</option>{projects.data?.map(project => <option key={project._id} value={project._id}>{project.title}</option>)}</select></label>{projects.error ? <button onClick={() => void projects.refetch()}>{t("Retry")}</button> : null}<Link to="/submissions">{t("Cancel")}</Link></div> : <MentorManuscriptDialog open projectId={id} projectTitle={projectTitle} onOpenChange={open => { if (!open) navigate(projectSubmissionPath(id)); }} onSent={result => { toast.success(t(result.reused ? "This version already has a mentor review request." : "Manuscript sent for mentor feedback.")); navigate(projectSubmissionPath(id, result.submissionId)); }} />}</div>;
}
