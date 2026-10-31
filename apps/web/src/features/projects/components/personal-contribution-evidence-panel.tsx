import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, ShieldCheck, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import { contributionsApi } from "../api/contributions.api";

interface Props {
  projectId: string;
}

export function PersonalContributionEvidencePanel({ projectId }: Props) {
  const { t } = useI18n();
  const [exporting, setExporting] = useState(false);

  const query = useQuery({
    queryKey: ["my-contribution-history", projectId],
    queryFn: () => contributionsApi.myHistory(projectId),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-4 py-4" data-no-i18n>
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  const history = query.data;
  if (!history) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center" data-no-i18n>
        <AlertCircle className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
        <p className="text-sm font-medium">{t("No contribution record found for your account in this project.")}</p>
      </div>
    );
  }

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await contributionsApi.exportMyHistory(projectId);
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lumigap-contribution-evidence-${history.userId}-${projectId.slice(0, 8)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(t("Contribution evidence exported with SHA-256 integrity digest"));
    } catch {
      toast.error(t("Could not export contribution evidence"));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6" data-no-i18n>
      <header className="rounded-xl border border-border/80 bg-card p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h3 className="text-base font-semibold">{t("My Contribution Evidence & Export")}</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t(
                "Your historical research activities, verified contributions, and agreed matrix shares are permanently preserved even if membership changes.",
              )}
            </p>
          </div>
          <Button size="sm" onClick={() => void handleExport()} disabled={exporting}>
            <Download className="mr-2 h-4 w-4" />
            {t(exporting ? "Exporting…" : "Export evidence (JSON)")}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/40 text-xs">
          <span className="text-muted-foreground">{t("Status")}:</span>
          <Badge variant="outline" className="font-semibold">
            {t(history.membershipStatus)}
          </Badge>
          {history.privacyRedacted && (
            <Badge variant="secondary" className="bg-amber-500/10 text-amber-700 dark:text-amber-300">
              {t("Privacy-redacted for departed member")}
            </Badge>
          )}
          <span className="font-mono text-2xs text-muted-foreground ml-auto">
            Digest: {history.integrityDigestSha256.slice(0, 16)}…
          </span>
        </div>
      </header>

      {/* Work Contributions list */}
      <section className="space-y-3">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          {t("Recorded Work Contributions")} ({history.workContributions.length})
        </h4>
        {history.workContributions.length > 0 ? (
          <div className="space-y-2">
            {history.workContributions.map(item => (
              <div key={item.id} className="rounded-lg border border-border/70 bg-card p-3.5 space-y-1.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-foreground text-sm">{item.title}</span>
                  <Badge variant="outline">{t(item.status)}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
                  <span>{t(item.category)}</span> ·{" "}
                  <span>{new Date(item.workDate).toLocaleDateString()}</span>
                  {item.myRoles.length > 0 && (
                    <>
                      <span>·</span>
                      {item.myRoles.map(r => (
                        <Badge key={r} variant="secondary" className="text-2xs">
                          {t(r)}
                        </Badge>
                      ))}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t("No work contributions recorded yet.")}</p>
        )}
      </section>

      {/* Agreed Matrix Allocations */}
      <section className="space-y-3">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          {t("Agreed Contribution Matrix Allocations")} ({history.allocations.length})
        </h4>
        {history.allocations.length > 0 ? (
          <div className="space-y-2">
            {history.allocations.map(alloc => (
              <div key={alloc.revisionId} className="rounded-lg border border-border/70 bg-card p-3.5 space-y-1.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-foreground">{alloc.periodTitle}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-primary">{alloc.myPercentage}</span>
                    <Badge variant="outline">{t(alloc.status)}</Badge>
                  </div>
                </div>
                <p className="text-muted-foreground">{alloc.scope}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t("No finalized allocation revisions yet.")}</p>
        )}
      </section>
    </div>
  );
}

