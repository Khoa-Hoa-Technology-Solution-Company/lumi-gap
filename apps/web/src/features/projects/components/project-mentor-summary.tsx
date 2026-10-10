import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useI18n } from "@/i18n";
import { academicSupportApi } from "../api/academic-support.api";

/** Read-only team display; all relationship management stays in Academic Support. */
export function ProjectMentorSummary({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const mentorships = useQuery({ queryKey: ["academic-support", "project", projectId, 1], queryFn: () => academicSupportApi.list(projectId) });
  if (!mentorships.data?.counts.active) return null;
  return <section className="mt-6 rounded-lg border bg-card p-4" data-no-i18n><h3 className="text-sm font-semibold">{t("Academic Mentor")}</h3>
    <ul className="mt-3 space-y-2">{mentorships.data.relationships.filter(r => r.status === "ACTIVE").map(r => <li key={r.id}><Link to={`/academics/${r.mentorUser._id}`} className="text-sm font-medium hover:underline">{r.mentorUser.fullName}</Link><p className="text-xs text-muted-foreground">{r.mentorUser.positionTitle} · {r.mentorUser.institutionName} · {t("Mentor")}</p></li>)}</ul>
    <Link to={`/projects/${encodeURIComponent(projectId)}?tab=support`} className="mt-3 inline-block text-xs text-primary hover:underline">{t("Academic Support")}</Link>
  </section>;
}
