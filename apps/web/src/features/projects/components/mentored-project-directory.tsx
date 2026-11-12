import { Link } from "react-router-dom";
import type { MentorRelationship } from "@trend/shared-types";
import { ArrowUpRight } from "lucide-react";
import { useI18n } from "@/i18n";
import { PROJECT_STATUS_LABELS } from "../utils/project-directory";

export function MentoredProjectDirectory({ projects, compact = false, search = "" }: {
  projects: MentorRelationship[]; compact?: boolean; search?: string;
}) {
  const { t } = useI18n();
  const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/đ/gi, "d").toLocaleLowerCase();
  const terms = normalize(search.trim()).split(/\s+/).filter(Boolean);
  const filtered = projects.filter(item => terms.every(term => normalize(`${item.project?.title} ${item.project?.researchField ?? ""}`).includes(term)));
  if (!projects.length) return null;
  return <section className="mt-5 min-w-0" aria-label={t("Teams you mentor")}>
    <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{t("Teams you mentor")} <span>({projects.length})</span></h2>
    {filtered.length ? <ul className="divide-y rounded-lg border bg-background">
      {filtered.map(item => <li key={item.projectId} className="min-w-0">
        <Link to={`/projects/${encodeURIComponent(item.projectId)}?tab=overview`} className={`flex min-w-0 items-center justify-between gap-3 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${compact ? "p-3" : "p-5"}`}>
          <span className="min-w-0"><strong className={`block break-words ${compact ? "text-sm" : "text-base"}`}>{item.project!.title}</strong>
            <span className="mt-1 block text-sm text-muted-foreground">{t(item.mentorRole === "SECONDARY" ? "Secondary mentor" : "Primary mentor")} · {t(PROJECT_STATUS_LABELS[item.project!.stage])}</span>
            {!compact && item.project?.researchField && <span className="mt-1 block break-words text-sm text-muted-foreground">{item.project.researchField}</span>}
          </span>
          <ArrowUpRight size={18} className="shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
      </li>)}
    </ul> : <p className="text-sm text-muted-foreground">{t("No matching projects")}</p>}
  </section>;
}
