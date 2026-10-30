import { useQuery } from "@tanstack/react-query";
import { GraduationCap, Award, MessageSquare, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import { contributionsApi } from "../api/contributions.api";

interface Props {
  projectId: string;
}

export function AdvisorContributionsPanel({ projectId }: Props) {
  const { t } = useI18n();

  const query = useQuery({
    queryKey: ["advisor-contributions", projectId],
    queryFn: () => contributionsApi.advisorContributions(projectId),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-4 py-4" data-no-i18n>
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  const advisors = query.data ?? [];

  return (
    <div className="space-y-6" data-no-i18n>
      <header className="rounded-xl border border-border/80 bg-card p-5 space-y-2">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-primary" />
          <h3 className="text-base font-semibold">{t("Lecturer & Advisor Contributions")}</h3>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t(
            "Records agreed CRediT roles, supervisory agreements, and substantive feedback provided under Mentor Access. Routine comments do not automatically grant authorship entitlement.",
          )}
        </p>
      </header>

      {advisors.length > 0 ? (
        <div className="space-y-4">
          {advisors.map(adv => (
            <div key={adv.mentorId} className="rounded-xl border border-border/70 bg-card p-5 space-y-4 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="font-semibold text-foreground text-sm">{adv.mentorName}</span>
                  <Badge variant="outline" className="text-xs">
                    {t(adv.relationshipStatus)}
                  </Badge>
                </div>
              </div>

              {/* Agreements */}
              {adv.agreements.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Award className="h-3.5 w-3.5 text-primary" />
                    {t("Agreed CRediT roles & acknowledgements")}
                  </h4>
                  <div className="space-y-2">
                    {adv.agreements.map(ag => (
                      <div key={ag.id} className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-1.5 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-1.5">
                          <div className="flex items-center gap-1 flex-wrap">
                            {ag.creditRoles.map(r => (
                              <Badge key={r} variant="secondary" className="text-2xs font-medium">
                                {t(r)}
                              </Badge>
                            ))}
                          </div>
                          <Badge variant="outline" className="text-2xs">
                            {t(ag.status)}
                          </Badge>
                        </div>
                        <p className="text-foreground leading-relaxed italic">"{ag.acknowledgement}"</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Feedback items */}
              {adv.feedbackItems.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5 text-primary" />
                    {t("Substantive advisory feedback")}
                  </h4>
                  <div className="space-y-2">
                    {adv.feedbackItems.map(fb => (
                      <div key={fb.id} className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-1 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium text-foreground">
                            {t(fb.kind)}
                            {fb.shareTitle ? ` · ${fb.shareTitle}` : ""}
                          </span>
                          <Badge variant="outline" className="text-2xs">
                            {t(fb.status)}
                          </Badge>
                        </div>
                        {fb.creditRoles.length > 0 && (
                          <div className="flex items-center gap-1 flex-wrap pt-0.5">
                            {fb.creditRoles.map(r => (
                              <Badge key={r} variant="secondary" className="text-2xs">
                                {t(r)}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {fb.resultingRevisionRef && (
                          <p className="text-2xs text-muted-foreground pt-0.5">
                            {t("Resulting revision")}: {fb.resultingRevisionRef}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border/80 p-8 text-center bg-muted/10">
          <GraduationCap className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
          <p className="text-sm font-medium text-foreground">{t("No advisor contributions recorded yet")}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {t("Invite lecturers under Academic Support → Mentor to collaborate and agree on CRediT roles.")}
          </p>
        </div>
      )}
    </div>
  );
}

