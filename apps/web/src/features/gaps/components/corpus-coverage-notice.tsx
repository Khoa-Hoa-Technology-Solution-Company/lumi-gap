import { useEffect, useState } from "react";
import { DatabaseZap, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { GapCorpusCoverage } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";
import { gapsApi } from "../api/gaps.api";

const POLL_MS = 3000;

/**
 * How much of the topic's most relevant OpenAlex literature the corpus holds. When it is low, a gap found now may only
 * reflect missing papers, so the user can add them first; `onEnriched` reloads the evidence preview afterwards.
 */
export function CorpusCoverageNotice({ coverage, topic, onEnriched }: { coverage: GapCorpusCoverage; topic: string; onEnriched: () => void }) {
  const { t } = useI18n();
  const [jobId, setJobId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!jobId) return;
    const timer = setInterval(async () => {
      try {
        const status = await gapsApi.getCorpusEnrichmentStatus(jobId);
        if (status.state === "done") {
          setJobId(null);
          toast.success(t("Added {{count}} papers from OpenAlex. The evidence was reloaded.", { count: status.added ?? 0 }));
          onEnriched();
        } else if (status.state === "failed") {
          setJobId(null);
          toast.error(t("Could not add papers from OpenAlex. Try again later."));
        }
      } catch {
        setJobId(null);
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [jobId, onEnriched, t]);

  const enrich = async () => {
    setStarting(true);
    try {
      setJobId((await gapsApi.enrichCorpus(topic)).jobId);
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message ?? t("Could not add papers from OpenAlex. Try again later."));
    } finally {
      setStarting(false);
    }
  };

  const missing = coverage.checked - coverage.present;
  return (
    <div className={cn(
      "flex flex-col gap-3 rounded-lg border p-3 text-xs sm:flex-row sm:items-center sm:justify-between",
      coverage.low
        ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300"
        : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-300",
    )}>
      <div className="flex gap-2">
        <DatabaseZap className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          <strong>{t("Corpus coverage: {{present}} of the {{checked}} most relevant OpenAlex papers", { present: coverage.present, checked: coverage.checked })}</strong>
          {coverage.low ? ` — ${t("too few to trust a gap found now: missing papers look like a gap. Add them first.")}` : ""}
        </p>
      </div>
      {missing > 0 && (
        <Button size="sm" variant={coverage.low ? "default" : "outline"} className="shrink-0" disabled={starting || !!jobId} onClick={enrich}>
          {starting || jobId ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
          {jobId ? t("Adding papers…") : t("Add {{count}} papers from OpenAlex", { count: missing })}
        </Button>
      )}
    </div>
  );
}
