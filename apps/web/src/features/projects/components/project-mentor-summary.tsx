import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { GraduationCap, ArrowUpRight, Award, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { academicSupportApi } from "../api/academic-support.api";

/** Read-only team display; all relationship management stays in Academic Support. */
export function ProjectMentorSummary({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const mentorships = useQuery({ queryKey: ["academic-support", "project", projectId, 1], queryFn: () => academicSupportApi.list(projectId) });
  if (!mentorships.data) return null;
  const activeRelationships = mentorships.data.relationships.filter(r => r.status === "ACTIVE");

  return (
    <section className="project-mentor-showcase rounded-2xl border border-border/80 bg-card p-6 shadow-xs relative overflow-hidden" data-no-i18n>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-border/60">
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-xs mt-0.5">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base sm:text-lg font-bold text-foreground">{t("Academic Mentor")}</h3>
              {activeRelationships.length > 0 && (
                <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-semibold py-0.5 px-2 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>{t("Active")}</span>
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("Expert guidance and academic critique for your research.")}</p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm" className="font-semibold gap-1.5 self-start sm:self-center shadow-xs">
          <Link to={`/projects/${encodeURIComponent(projectId)}?tab=support`}>
            <span>{t(mentorships.data.counts.active ? "Academic Support" : "Find Mentors")}</span>
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      {activeRelationships.length > 0 ? (
        <ul className="mt-5 space-y-3" role="list">
          {activeRelationships.map(r => {
            const initial = r.mentorUser.fullName?.trim().charAt(0) || "M";
            return (
              <li key={r.id} className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-border/70 bg-muted/20 hover:bg-muted/40 transition-colors">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm ring-2 ring-primary/20" aria-hidden="true">
                    {initial}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link to={`/academics/${r.mentorUser._id}`} className="text-sm font-bold text-foreground hover:text-primary transition-colors hover:underline truncate">
                        {r.mentorUser.fullName}
                      </Link>
                      <Badge variant="secondary" className="font-semibold text-xs py-0 px-2 bg-primary/10 text-primary border-primary/20">
                        {t("Mentor")}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {r.mentorUser.positionTitle ? `${r.mentorUser.positionTitle} · ` : ""}{r.mentorUser.institutionName || ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-center">
                  <Button asChild variant="ghost" size="sm" className="h-8 text-xs font-medium text-muted-foreground hover:text-foreground">
                    <Link to={`/academics/${r.mentorUser._id}`}>
                      {t("View profile")}
                    </Link>
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-5 rounded-xl border border-dashed border-border/80 p-6 text-center bg-muted/10">
          <Award className="mx-auto h-7 w-7 text-muted-foreground/50 mb-2" />
          <p className="text-sm font-medium text-foreground">{t("Your project has no active mentor yet.")}</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
            {t("Connect with verified lecturers and research experts to receive guidance and academic critique.")}
          </p>
          <Button asChild size="sm" className="mt-4 font-semibold shadow-xs">
            <Link to={`/projects/${encodeURIComponent(projectId)}?tab=support`}>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              {t("Find Mentors")}
            </Link>
          </Button>
        </div>
      )}
    </section>
  );
}
